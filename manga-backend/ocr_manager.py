import os
import sys
import cv2
import numpy as np
import torch
import asyncio
import threading
from typing import List, Dict, Any, Tuple, Optional
from PIL import Image
from huggingface_hub import snapshot_download, hf_hub_download
from fastapi import HTTPException
from shapely.geometry import Polygon

# Optional imports with try-except to ensure the app starts up even if some dependencies are installing
try:
    import onnxruntime as ort
except ImportError:
    ort = None

try:
    from vllm import SamplingParams
    from vllm.engine.async_llm_engine import AsyncLLMEngine
    from vllm.engine.arg_utils import AsyncEngineArgs
except ImportError:
    SamplingParams = None
    AsyncLLMEngine = None
    AsyncEngineArgs = None

try:
    from manga_ocr import MangaOcr
except ImportError:
    MangaOcr = None


def run_async_fn_sync(coro):
    """Runs an asynchronous coroutine synchronously, handling running event loops."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
        
    if loop and loop.is_running():
        # We are in a running event loop (e.g. FastAPI/Uvicorn).
        # We must run it in a separate thread and wait for it.
        result = []
        exception = []
        
        def runner():
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                res = new_loop.run_until_complete(coro)
                result.append(res)
            except Exception as e:
                exception.append(e)
            finally:
                new_loop.close()
                
        t = threading.Thread(target=runner)
        t.start()
        t.join()
        
        if exception:
            raise exception[0]
        return result[0]
    else:
        # No running event loop, we can just run it
        return asyncio.run(coro)


async def run_vllm_async(engine, inputs, sampling_params):
    """Runs concurrent text recognition inputs on vLLM AsyncLLMEngine."""
    import uuid
    tasks = []
    
    async def collect_request(engine, prompt, sampling_params, req_id, multi_modal_data):
        gen = engine.generate(
            prompt=None,
            sampling_params=sampling_params,
            request_id=req_id,
            inputs={"prompt": prompt, "multi_modal_data": multi_modal_data} if multi_modal_data else None
        )
        final_output = None
        async for request_output in gen:
            final_output = request_output
        return final_output

    for i, item in enumerate(inputs):
        req_id = f"vlm_{uuid.uuid4().hex}_{i}"
        tasks.append(collect_request(
            engine,
            item["prompt"],
            sampling_params,
            req_id,
            item.get("multi_modal_data")
        ))
        
    return await asyncio.gather(*tasks)


class ONNXLangRecognizer:
    """
    Handles preprocessing, ONNX Runtime inference (CPU only), and CTC decoding 
    for English, Korean, and Chinese PaddleOCR models.
    """
    def __init__(self, model_path: str, dict_path: str):
        if ort is None:
            raise ImportError("onnxruntime is required for Free Tier OCR.")
            
        # CRITICAL: Force CPUExecutionProvider to save GPU VRAM for VIP tasks
        # Optimize ONNX Runtime session configuration for Serverless Cold-Start
        sess_options = ort.SessionOptions()
        sess_options.add_session_config_entry("session.use_mmap", "1")
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.enable_cpu_mem_arena = False

        self.session = ort.InferenceSession(
            model_path, 
            sess_options=sess_options,
            providers=['CPUExecutionProvider']
        )
        self.input_name = self.session.get_inputs()[0].name
        self.char_list = self._load_dict(dict_path)

    def _load_dict(self, dict_path: str) -> List[str]:
        """Loads characters list for CTC decoding."""
        char_list = []
        if os.path.exists(dict_path):
            with open(dict_path, "r", encoding="utf-8") as f:
                char_list = [line.strip("\r\n") for line in f.readlines()]
        # PaddleOCR v2/v3/v4 models use index 0 as CTC blank token
        char_list.insert(0, "blank")
        return char_list

    def preprocess(self, crop_img: np.ndarray, target_height: int = 48) -> np.ndarray:
        """
        Resizes the crop to target height while keeping aspect ratio, 
        and normalizes for PaddleOCR input.
        """
        h, w, c = crop_img.shape
        ratio = w / float(h)
        target_width = int(target_height * ratio)
        
        # Resize image
        resized = cv2.resize(crop_img, (target_width, target_height), interpolation=cv2.INTER_LINEAR)
        
        # Normalization (PaddleOCR standard: subtract 0.5 and divide by 0.5)
        img = resized.astype('float32') / 255.0
        img = (img - 0.5) / 0.5
        
        # HWC to CHW and expand to NCHW
        img = np.transpose(img, (2, 0, 1))
        img = np.expand_dims(img, axis=0)
        return img

    def decode_ctc(self, preds: np.ndarray) -> str:
        """CTC decoding (collapses duplicate tokens, removes blanks)."""
        # preds shape: [1, sequence_length, num_classes]
        preds_idx = preds.argmax(axis=2)[0]
        
        decoded_chars = []
        prev_idx = -1
        for idx in preds_idx:
            if idx == 0:  # CTC Blank
                prev_idx = idx
                continue
            if idx == prev_idx:
                continue
            if idx < len(self.char_list):
                decoded_chars.append(self.char_list[idx])
            prev_idx = idx
            
        return "".join(decoded_chars)

    def recognize(self, crop_img: np.ndarray) -> str:
        """Runs inference and decodes characters."""
        try:
            input_data = self.preprocess(crop_img)
            outputs = self.session.run(None, {self.input_name: input_data})
            preds = outputs[0]
            return self.decode_ctc(preds)
        except Exception as e:
            print(f"❌ Error during ONNX recognition: {e}")
            return ""


class ONNXDBDetector:
    """
    ONNX Runtime implementation of PaddleOCR text detection.
    Runs exclusively on CPUExecutionProvider with zero GPU trace.
    """
    def __init__(self, model_path: str):
        if ort is None:
            raise ImportError("onnxruntime is required for Text Detection.")
        self.session = ort.InferenceSession(
            model_path, 
            providers=['CPUExecutionProvider']
        )
        self.input_name = self.session.get_inputs()[0].name

    def preprocess(self, img: np.ndarray, limit_side_len: int = 960) -> Tuple[np.ndarray, float]:
        h, w, c = img.shape
        if max(h, w) > limit_side_len:
            if h > w:
                ratio = float(limit_side_len) / h
            else:
                ratio = float(limit_side_len) / w
        else:
            ratio = 1.0
            
        resize_h = int(round(h * ratio / 32) * 32)
        resize_w = int(round(w * ratio / 32) * 32)
        resize_h = max(32, resize_h)
        resize_w = max(32, resize_w)
        
        img_resized = cv2.resize(img, (resize_w, resize_h))
        img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
        img_float = img_rgb.astype(np.float32) / 255.0
        
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        img_norm = (img_float - mean) / std
        
        img_chw = np.transpose(img_norm, (2, 0, 1))
        img_batch = np.expand_dims(img_chw, axis=0)
        return img_batch, ratio

    def postprocess(self, pred: np.ndarray, ori_h: int, ori_w: int, ratio: float) -> List[List[List[float]]]:
        pred = pred[0, 0, :, :]
        thresh = 0.3
        box_thresh = 0.6
        unclip_ratio = 1.5
        
        segmentation = pred > thresh
        contours, _ = cv2.findContours(
            (segmentation * 255).astype(np.uint8),
            cv2.RETR_LIST,
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        polys = []
        h, w = pred.shape
        for contour in contours:
            rect = cv2.minAreaRect(contour)
            if min(rect[1]) < 3:
                continue
                
            points = cv2.boxPoints(rect)
            points = self.order_points(points)
            score = self.get_box_score(pred, points)
            if score < box_thresh:
                continue
                
            poly = Polygon(points)
            if poly.area <= 0:
                continue
            distance = poly.area * unclip_ratio / poly.length
            offset_poly = poly.buffer(distance, join_style=2)
            if offset_poly.is_empty:
                continue
            
            if offset_poly.geom_type == 'MultiPolygon':
                offset_poly = max(offset_poly.geoms, key=lambda p: p.area)
                
            unclipped_points = np.array(offset_poly.exterior.coords)[:-1]
            unclipped_rect = cv2.minAreaRect(unclipped_points.astype(np.float32))
            if min(unclipped_rect[1]) < 5:
                continue
                
            final_points = cv2.boxPoints(unclipped_rect)
            final_points = self.order_points(final_points)
            
            # Map back to original dimensions
            final_points[:, 0] = np.clip(np.round(final_points[:, 0] / ratio), 0, ori_w)
            final_points[:, 1] = np.clip(np.round(final_points[:, 1] / ratio), 0, ori_h)
            
            polys.append(final_points.tolist())
        return polys

    def order_points(self, pts):
        rect = np.zeros((4, 2), dtype="float32")
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        return rect

    def get_box_score(self, pred, points):
        h, w = pred.shape
        points = points.copy()
        points[:, 0] = np.clip(points[:, 0], 0, w - 1)
        points[:, 1] = np.clip(points[:, 1], 0, h - 1)
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, [points.astype(np.int32)], 1)
        return cv2.mean(pred, mask)[0]

    def ocr(self, img: np.ndarray, rec: bool = False) -> List[List[List[List[float]]]]:
        h, w, c = img.shape
        img_batch, ratio = self.preprocess(img)
        outputs = self.session.run(None, {self.input_name: img_batch})
        preds = outputs[0]
        polys = self.postprocess(preds, h, w, ratio)
        return [polys]


class OCRManager:
    """
    OCR Manager with Dual-Engine routing logic:
    - Text Detection (all languages): ONNXDBDetector running exclusively on CPU Execution Provider.
    - Free Tier Text Rec (EN, KO, ZH): Lazy-loaded CPU-only ONNX Runtime models.
    - VIP Tier Text Rec (JA): gigass03/PaddleOCR-VL-1.6-Manga-Finetuned VLM via vLLM AsyncLLMEngine.
    """
    _detector_instance: Optional[ONNXDBDetector] = None
    
    # Model Repository mappings for Free Tier ONNX models
    ONNX_REPOS = {
        "en": {
            "repo_id": "deepghs/paddleocr", 
            "model_file": "rec/en_PP-OCRv4_rec/model.onnx", 
            "dict_file": "rec/en_PP-OCRv4_rec/dict.txt"
        },
        "ja": {
            "repo_id": "deepghs/paddleocr", 
            "model_file": "rec/japan_PP-OCRv3_rec/model.onnx", 
            "dict_file": "rec/japan_PP-OCRv3_rec/dict.txt"
        },
        "ko": {
            "repo_id": "deepghs/paddleocr", 
            "model_file": "rec/korean_PP-OCRv3_rec/model.onnx", 
            "dict_file": "rec/korean_PP-OCRv3_rec/dict.txt"
        },
        "ch": {
            "repo_id": "deepghs/paddleocr", 
            "model_file": "rec/ch_PP-OCRv4_rec/model.onnx", 
            "dict_file": "rec/ch_PP-OCRv4_rec/dict.txt"
        }
    }

    def __init__(self):
        self.onnx_recognizers: Dict[str, ONNXLangRecognizer] = {}
        self.vllm_engine: Optional[Any] = None
        self.vllm_sampling_params: Optional[Any] = None
        self.manga_ocr_instance: Optional[Any] = None
        self.detector_path: Optional[str] = None

    def get_detector(self) -> ONNXDBDetector:
        """Loads and returns the text detector (singleton pattern)."""
        if OCRManager._detector_instance is None:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            detector_onnx_path = os.path.join(current_dir, "detector.onnx")
            
            if not os.path.exists(detector_onnx_path):
                print("⚠️ detector.onnx not found in local workspace. Converting from Hugging Face files...")
                self.detector_path = snapshot_download("bluolightning/PaddleOCRv5-Server-Det-For-Manga")
                
                try:
                    import subprocess
                    cmd = [
                        sys.executable, "-m", "paddle2onnx.command",
                        "--model_dir", self.detector_path,
                        "--model_filename", "inference.pdmodel",
                        "--params_filename", "inference.pdiparams",
                        "--save_file", detector_onnx_path,
                        "--opset_version", "11",
                        "--enable_onnx_checker", "True"
                    ]
                    env = os.environ.copy()
                    env["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
                    subprocess.run(cmd, env=env, check=True, capture_output=True)
                    print("🎉 Successfully converted detector model to detector.onnx!")
                except Exception as e:
                    print(f"❌ Failed to convert model to ONNX: {e}")
                    raise RuntimeError(f"detector.onnx not found and conversion failed: {e}")
            
            print(f"🚀 Loading CPU-only ONNX Text Detector from: {detector_onnx_path}")
            OCRManager._detector_instance = ONNXDBDetector(detector_onnx_path)
            print("✅ CPU ONNX Detector loaded successfully.")
            
        return OCRManager._detector_instance

    def get_onnx_recognizer(self, language: str) -> ONNXLangRecognizer:
        """Lazy-loads and caches ONNX recognition models for the Free Tier."""
        if language not in self.ONNX_REPOS:
            raise ValueError(f"Unsupported free tier language: {language}")

        if language not in self.onnx_recognizers:
            print(f"🚀 Lazy-loading ONNX recognizer for language: {language}...")
            config = self.ONNX_REPOS[language]
            
            # Download model and dictionary from Hugging Face
            model_path = hf_hub_download(repo_id=config["repo_id"], filename=config["model_file"])
            dict_path = hf_hub_download(repo_id=config["repo_id"], filename=config["dict_file"])
            
            self.onnx_recognizers[language] = ONNXLangRecognizer(model_path, dict_path)
            print(f"✅ Language recognizer ({language}) loaded successfully on CPU.")
            
        return self.onnx_recognizers[language]

    def get_vllm_japanese_engine(self) -> Tuple[Any, Any]:
        """Lazy-loads the VIP Japanese VLM model via vLLM with memory bounds."""
        if AsyncLLMEngine is None or SamplingParams is None:
            raise ImportError("vllm is required for VIP Japanese OCR.")

        if self.vllm_engine is None:
            print("🚀 Lazy-loading Japanese VLM Model (gigass03/PaddleOCR-VL-1.6-Manga-Finetuned)...")
            
            # Maximize continuous batching on GPU (utilize 90% GPU VRAM, queue up to 10 sequences)
            engine_args = AsyncEngineArgs(
                model="gigass03/PaddleOCR-VL-1.6-Manga-Finetuned",
                gpu_memory_utilization=0.9,
                max_num_seqs=10,
                trust_remote_code=True
            )
            self.vllm_engine = AsyncLLMEngine.from_engine_args(engine_args)
            
            # Set sampling params (temperature=0.0 for greedy decoding/OCR task)
            self.vllm_sampling_params = SamplingParams(
                temperature=0.0,
                max_tokens=256
            )
            print("✅ Japanese vLLM AsyncLLMEngine loaded successfully (gpu_memory_utilization=0.9, max_num_seqs=10).")
            
        return self.vllm_engine, self.vllm_sampling_params

    def get_manga_ocr(self) -> Any:
        """Lazy-loads MangaOCR specifically fine-tuned on Japanese Manga text."""
        if self.manga_ocr_instance is None:
            if MangaOcr is None:
                raise ImportError("manga_ocr is required for Japanese Manga OCR.")
            print("🚀 Lazy-loading MangaOCR (kha-white/manga-ocr-base)...")
            self.manga_ocr_instance = MangaOcr()
            print("✅ MangaOCR loaded successfully.")
        return self.manga_ocr_instance

    def process_ocr(self, image: np.ndarray, language: str, is_vip: bool) -> List[Dict[str, Any]]:
        """
        Processes an image, detects text regions, and routes them to the appropriate recognition models.
        """
        lang_key = 'ch' if language == 'zh' else language
        
        # Strict language validation check
        supported_languages = ['ja', 'en', 'ko', 'ch']
        if lang_key not in supported_languages:
            raise HTTPException(
                status_code=400,
                detail=f"Language '{language}' is not supported. Supported languages: {supported_languages}"
            )

        # VIP validation check for Japanese - Bypassed for local/MangaOcr fallback
        pass

        if image is None or image.size == 0:
            raise ValueError("Input image is empty or invalid.")

        # 4. Perform Text Detection (All Languages - CPU Exclusive)
        detector = self.get_detector()
        det_results = detector.ocr(image, rec=False)
        
        boxes: List[Tuple[int, int, int, int]] = []
        if det_results and det_results[0]:
            for poly in det_results[0]:
                pts = np.array(poly, dtype=np.int32)
                # Get axis-aligned bounding box from polygon
                x, y, w, h = cv2.boundingRect(pts)
                # Ignore extremely small noise boxes
                if w > 4 and h > 4:
                    boxes.append((x, y, x + w, y + h))

        # 5. Route Text Recognition
        ocr_results = []
        img_h, img_w = image.shape[:2]

        if not boxes:
            return ocr_results

        # 5a. VIP Tier Logic (Japanese VLM via vLLM)
        if lang_key == 'ja':
            if AsyncLLMEngine is None or os.getenv("VLM_MOCK", "true").lower() == "true":
                # Mock VLM call for local development/testing
                print("💡 [VLM MOCK] Mocking Japanese VLM OCR...")
                for i, box in enumerate(boxes):
                    ocr_results.append({
                        "box": list(box),
                        "text": f"こんにちは {i+1}"
                    })
            else:
                engine, sampling_params = self.get_vllm_japanese_engine()
                
                # Prepare batch inputs for vLLM
                vllm_inputs = []
                valid_boxes = []
                for (x1, y1, x2, y2) in boxes:
                    # Add tiny padding to the crop for context
                    pad = 4
                    x1_pad, y1_pad = max(0, x1 - pad), max(0, y1 - pad)
                    x2_pad, y2_pad = min(img_w, x2 + pad), min(img_h, y2 + pad)
                    
                    crop_bgr = image[y1_pad:y2_pad, x1_pad:x2_pad]
                    if crop_bgr.size == 0:
                        continue
                        
                    crop_rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
                    crop_pil = Image.fromarray(crop_rgb)
                    
                    # Format prompt for the fine-tuned PaddleOCR-VL model
                    prompt = "USER: <image>\nOCR:\nASSISTANT:"
                    
                    vllm_inputs.append({
                        "prompt": prompt,
                        "multi_modal_data": {"image": crop_pil}
                    })
                    valid_boxes.append((x1, y1, x2, y2))
                
                # Run batch inference on GPU using vLLM AsyncLLMEngine
                if vllm_inputs:
                    outputs = run_async_fn_sync(run_vllm_async(engine, vllm_inputs, sampling_params))
                    for i, out in enumerate(outputs):
                        if out and out.outputs:
                            recognized_text = out.outputs[0].text.strip()
                            ocr_results.append({
                                "box": list(valid_boxes[i]),
                                "text": recognized_text
                            })

        # 5b. Free Tier Logic (EN, KO, ZH via CPU ONNX models)
        else:
            recognizer = self.get_onnx_recognizer(lang_key)
            
            for (x1, y1, x2, y2) in boxes:
                # Add tiny padding to the crop for context
                pad = 2
                x1_pad, y1_pad = max(0, x1 - pad), max(0, y1 - pad)
                x2_pad, y2_pad = min(img_w, x2 + pad), min(img_h, y2 + pad)
                
                crop_bgr = image[y1_pad:y2_pad, x1_pad:x2_pad]
                if crop_bgr.size == 0:
                    continue
                
                # Inference run strictly on CPU
                recognized_text = recognizer.recognize(crop_bgr)
                ocr_results.append({
                    "box": [x1, y1, x2, y2],
                    "text": recognized_text
                })

        return ocr_results

    def recognize_crop(self, crop_img: np.ndarray, language: str, is_vip: bool) -> str:
        """Runs recognition on a single crop image."""
        lang_key = 'ch' if language == 'zh' else language
        
        supported_languages = ['ja', 'en', 'ko', 'ch']
        if lang_key not in supported_languages:
            raise ValueError(f"Language '{language}' is not supported.")
            
        if lang_key == 'ja':
            if os.getenv("VLM_MOCK", "false").lower() == "true":
                return "こんにちは"
            
            # Primary: MangaOCR (Industry standard model fine-tuned specifically for Japanese Manga text)
            if MangaOcr is not None:
                try:
                    mocr = self.get_manga_ocr()
                    crop_rgb = cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB)
                    crop_pil = Image.fromarray(crop_rgb)
                    text = mocr(crop_pil)
                    if text and text.strip():
                        return text.strip()
                except Exception as e:
                    print(f"⚠️ [MANGA_OCR FALLBACK] MangaOCR execution failed: {e}. Trying vLLM / ONNX...")

            if AsyncLLMEngine is not None:
                try:
                    engine, sampling_params = self.get_vllm_japanese_engine()
                    crop_rgb = cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB)
                    crop_pil = Image.fromarray(crop_rgb)
                    prompt = "USER: <image>\nOCR:\nASSISTANT:"
                    
                    vllm_inputs = [{
                        "prompt": prompt,
                        "multi_modal_data": {"image": crop_pil}
                    }]
                    
                    outputs = run_async_fn_sync(run_vllm_async(engine, vllm_inputs, sampling_params))
                    if outputs and outputs[0] and outputs[0].outputs:
                        return outputs[0].outputs[0].text.strip()
                    return ""
                except Exception as e:
                    print(f"⚠️ [VLM FALLBACK] vLLM execution failed: {e}. Falling back to Japanese ONNX OCR!")
            
            # Fallback to Japanese PaddleOCR ONNX model if both MangaOCR and vLLM fail
            recognizer = self.get_onnx_recognizer('ja')
            return recognizer.recognize(crop_img)
            
        else:
            recognizer = self.get_onnx_recognizer(lang_key)
            return recognizer.recognize(crop_img)


# Mock User/Request class for testing
class MockUser:
    def __init__(self, is_vip: bool):
        self.is_vip = is_vip


# Sample helper function as requested
def process_ocr(image: np.ndarray, language: str, is_vip: bool) -> List[Dict[str, Any]]:
    """
    Sample entry point function to instantiate the manager and process the image OCR.
    """
    manager = OCRManager()
    return manager.process_ocr(image, language, is_vip)
