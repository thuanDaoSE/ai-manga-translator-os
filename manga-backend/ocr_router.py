"""
Multi-Model Routed OCR Pipeline (OCR Router)
Author: AI Manga Translator
Purpose: Route cropped speech bubbles to specialized SOTA OCR engines:
         - 'ja', 'ko', 'en': Hayai-OCR v2 (SigLIP 2 NaFlex Vision Backbone, blazing fast)
         - 'zh' (Chinese): PaddleOCR ('ch' model - PP-OCRv4) with Hayai-OCR fallback
Architecture: Singleton + Lazy Loading (VRAM-efficient, loads models only upon demand)
"""

import os
import sys
import logging
from typing import Optional, Union, Dict, Any
import numpy as np
from PIL import Image

# Configure module logger
logger = logging.getLogger("OCRRouter")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [OCRRouter] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


class OCRRouter:
    _instance: Optional["OCRRouter"] = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(OCRRouter, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        self._initialized = True
        self._models: Dict[str, Any] = {}
        self._pororo_available: Optional[bool] = None
        self._paddle_available: Optional[bool] = None
        self._hayai_ocr_available: Optional[bool] = None
        logger.info("OCRRouter initialized (SOTA Hayai-OCR v2 + SigLIP 2 enabled).")

    @classmethod
    def get_instance(cls) -> "OCRRouter":
        if cls._instance is None:
            cls._instance = OCRRouter()
        return cls._instance

    # ------------------------------------------------------------------
    # Model Loaders (Lazy Loading with safe error handling)
    # ------------------------------------------------------------------

    def _get_hayai_ocr(self):
        """Lazy load SOTA Multilingual Manga OCR (Hayai-OCR v2 + SigLIP 2 NaFlex)"""
        if "hayai_ocr" not in self._models:
            try:
                import torch
                from transformers import AutoModel, AutoProcessor, PreTrainedTokenizerFast

                device = "cuda" if torch.cuda.is_available() else "cpu"
                model_id = "JustANormalTinkerer/hayai-ocr-v2"
                processor_id = "google/siglip2-base-patch16-naflex"

                logger.info(f"Loading Hayai-OCR v2 with SigLIP 2 Vision Backbone on {device}...")
                tokenizer = PreTrainedTokenizerFast.from_pretrained(model_id)
                processor = AutoProcessor.from_pretrained(processor_id)

                dtype = torch.bfloat16 if (device != "cpu" and torch.cuda.is_bf16_supported()) else (
                    torch.float16 if device != "cpu" else torch.float32
                )
                model = AutoModel.from_pretrained(
                    model_id,
                    torch_dtype=dtype if device != "cpu" else torch.float32,
                    trust_remote_code=True
                )
                if device != "cpu":
                    model = model.to(device)
                model.eval()

                class HayaiWrapper:
                    def __init__(self, m, p, t, dev):
                        self.model = m
                        self.processor = p
                        self.tokenizer = t
                        self.device = dev

                    def __call__(self, pil_image: Image.Image) -> str:
                        res = self.recognize_batch([pil_image])
                        return res[0] if res else ""

                    def recognize_batch(self, images: list) -> list:
                        if not images:
                            return []
                        crops = [
                            img.convert("RGB") if isinstance(img, Image.Image) else Image.fromarray(img).convert("RGB")
                            for img in images
                        ]
                        with torch.inference_mode():
                            inputs = self.processor(images=crops, max_num_patches=256, return_tensors="pt")
                            if self.device != "cpu":
                                inputs = {k: v.to(self.device) for k, v in inputs.items()}
                            decoded_texts = self.model.generate(
                                pixel_values=inputs["pixel_values"],
                                pixel_attention_mask=inputs.get("pixel_attention_mask"),
                                spatial_shapes=inputs.get("spatial_shapes"),
                                tokenizer=self.tokenizer,
                                max_new_tokens=128,
                                repetition_penalty=1.0,
                            )
                            return [str(t).strip() for t in decoded_texts]

                self._models["hayai_ocr"] = HayaiWrapper(model, processor, tokenizer, device)
                self._hayai_ocr_available = True
                logger.info("✅ Hayai-OCR v2 (SigLIP 2 NaFlex) loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load Hayai-OCR v2: {e}")
                self._hayai_ocr_available = False
                return None
        return self._models.get("hayai_ocr")

    def _get_manga_ocr(self):
        """Backward compatibility alias for _get_hayai_ocr"""
        return self._get_hayai_ocr()

    def _get_paddle_ocr(self, lang: str):
        """Lazy load PaddleOCR for specific language (ch, korean, en)"""
        cache_key = f"paddle_{lang}"
        if cache_key not in self._models:
            try:
                from paddleocr import PaddleOCR
                import torch
                use_gpu = torch.cuda.is_available()
                logger.info(f"Loading PaddleOCR (lang='{lang}', use_gpu={use_gpu})...")
                # show_log=False to suppress spammy inference logs
                ocr_engine = PaddleOCR(
                    use_angle_cls=True,
                    lang=lang,
                    use_gpu=use_gpu,
                    show_log=False
                )
                self._models[cache_key] = ocr_engine
                self._paddle_available = True
                logger.info(f"PaddleOCR (lang='{lang}') loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize PaddleOCR for lang '{lang}': {e}")
                return None
        return self._models.get(cache_key)

    def _get_pororo_ocr(self):
        """Lazy load Pororo for Korean (optional / experimental)"""
        if self._pororo_available is False:
            return None

        if "pororo_ko" not in self._models:
            try:
                from pororo import Pororo
                logger.info("Loading Pororo OCR for Korean...")
                self._models["pororo_ko"] = Pororo(task="ocr", lang="ko")
                self._pororo_available = True
                logger.info("Pororo OCR loaded successfully.")
            except Exception as e:
                logger.warning(f"Pororo not available or incompatible with current environment: {e}. Falling back to PaddleOCR (Korean).")
                self._pororo_available = False
                return None
        return self._models.get("pororo_ko")

    # ------------------------------------------------------------------
    # Image Format Normalization
    # ------------------------------------------------------------------

    @staticmethod
    def _to_pil(image_input: Union[Image.Image, np.ndarray]) -> Image.Image:
        if isinstance(image_input, Image.Image):
            return image_input.convert("RGB")
        elif isinstance(image_input, np.ndarray):
            import cv2
            if len(image_input.shape) == 2:
                rgb = cv2.cvtColor(image_input, cv2.COLOR_GRAY2RGB)
            elif image_input.shape[2] == 4:
                rgb = cv2.cvtColor(image_input, cv2.COLOR_BGRA2RGB)
            else:
                rgb = cv2.cvtColor(image_input, cv2.COLOR_BGR2RGB)
            return Image.fromarray(rgb)
        else:
            raise ValueError(f"Unsupported image type: {type(image_input)}")

    @staticmethod
    def _to_numpy_rgb(image_input: Union[Image.Image, np.ndarray]) -> np.ndarray:
        if isinstance(image_input, np.ndarray):
            import cv2
            if len(image_input.shape) == 2:
                return cv2.cvtColor(image_input, cv2.COLOR_GRAY2RGB)
            elif image_input.shape[2] == 4:
                return cv2.cvtColor(image_input, cv2.COLOR_BGRA2RGB)
            elif image_input.shape[2] == 3:
                # Assuming input from cv2 is BGR
                return cv2.cvtColor(image_input, cv2.COLOR_BGR2RGB)
            return image_input
        elif isinstance(image_input, Image.Image):
            return np.array(image_input.convert("RGB"))
        else:
            raise ValueError(f"Unsupported image type: {type(image_input)}")

    # ------------------------------------------------------------------
    # Core Routing & OCR Execution
    # ------------------------------------------------------------------

    def recognize(
        self,
        image_input: Union[Image.Image, np.ndarray],
        source_language: str = "ja",
        box_id: Union[int, str] = 1
    ) -> str:
        """
        Routes the cropped image to the optimal model based on source_language:
          - 'ja', 'ko', 'en' -> Hayai-OCR v2 (SigLIP 2 NaFlex)
          - 'zh' / 'cn' -> PaddleOCR (ch)
        """
        lang = (source_language or "ja").lower().strip()
        
        # Normalize language aliases
        if lang in ["jp", "japanese"]:
            lang = "ja"
        elif lang in ["cn", "chinese", "zh-cn", "zh-tw"]:
            lang = "zh"
        elif lang in ["kr", "korean"]:
            lang = "ko"
        elif lang in ["english"]:
            lang = "en"

        text = ""

        # 1. ROUTE: JAPANESE, KOREAN, ENGLISH -> SOTA Hayai-OCR v2 (SigLIP 2 NaFlex)
        if lang in ["ja", "ko", "en"]:
            logger.info(f"Routed OCR: Processing box ID {box_id} using [Hayai-OCR v2] for language [{lang}]")
            try:
                pil_img = self._to_pil(image_input)
                hayai = self._get_hayai_ocr()
                if hayai:
                    text = hayai(pil_img)
                else:
                    raise RuntimeError("Hayai-OCR v2 instance not available")
            except Exception as e:
                logger.warning(f"⚠️ [Hayai-OCR Error on Box {box_id}]: {e}. Attempting fallback to PaddleOCR...")
                paddle_lang = "japan" if lang == "ja" else ("korean" if lang == "ko" else "en")
                text = self._fallback_paddle(image_input, lang=paddle_lang, box_id=box_id)

        # 2. ROUTE: CHINESE -> PaddleOCR (ch)
        elif lang == "zh":
            logger.info(f"Routed OCR: Processing box ID {box_id} using [PaddleOCR-ch] for language [zh]")
            try:
                text = self._run_paddle_ocr(image_input, lang="ch", box_id=box_id)
            except Exception as e:
                logger.warning(f"⚠️ [PaddleOCR-ch Error on Box {box_id}]: {e}. Attempting fallback to Hayai-OCR...")
                text = self._fallback_any(image_input, box_id=box_id)

        # 3. OTHER LANGUAGES -> PaddleOCR (en) or Hayai-OCR
        else:
            logger.info(f"Routed OCR: Processing box ID {box_id} using [PaddleOCR-en] for language [{lang}]")
            try:
                text = self._run_paddle_ocr(image_input, lang="en", box_id=box_id)
            except Exception as e:
                logger.warning(f"⚠️ [PaddleOCR-en Error on Box {box_id}]: {e}. Attempting fallback to Hayai-OCR...")
                text = self._fallback_any(image_input, box_id=box_id)

        return (text or "").strip()

    # ------------------------------------------------------------------
    # Batch Processing Optimization (Tensor Batching for High Throughput)
    # ------------------------------------------------------------------

    def recognize_batch(
        self,
        image_inputs: list,
        source_language: str = "ja",
        batch_size: int = 16
    ) -> list:
        """
        Processes a list of cropped images in batch to maximize GPU Tensor Core utilization.
        For Japanese, Korean, English: batches all crops through Hayai-OCR v2 in a single forward pass.
        """
        if not image_inputs:
            return []

        lang = (source_language or "ja").lower().strip()
        if lang in ["jp", "japanese"]:
            lang = "ja"
        elif lang in ["cn", "chinese", "zh-cn", "zh-tw"]:
            lang = "zh"
        elif lang in ["kr", "korean"]:
            lang = "ko"
        elif lang in ["english"]:
            lang = "en"

        if lang in ["ja", "ko", "en"]:
            try:
                return self._run_hayai_ocr_batch(image_inputs, batch_size=batch_size)
            except Exception as e:
                logger.warning(f"⚠️ [Batch Hayai-OCR failed]: {e}. Falling back to sequential recognize...")
                return [self.recognize(img, source_language=lang, box_id=idx + 1) for idx, img in enumerate(image_inputs)]
        else:
            return [self.recognize(img, source_language=lang, box_id=idx + 1) for idx, img in enumerate(image_inputs)]

    def _run_hayai_ocr_batch(self, image_inputs: list, batch_size: int = 16) -> list:
        """Process a list of image crops using Hayai-OCR v2 in batched Tensor passes"""
        hayai = self._get_hayai_ocr()
        if not hayai:
            raise RuntimeError("Hayai-OCR v2 instance not available")

        results = []
        for i in range(0, len(image_inputs), batch_size):
            chunk = image_inputs[i:i + batch_size]
            pil_images = [self._to_pil(img) for img in chunk]
            try:
                batch_res = hayai.recognize_batch(pil_images)
                results.extend(batch_res)
            except Exception as batch_err:
                logger.warning(f"⚠️ [Hayai-OCR Batch Chunk Error]: {batch_err}. Fallback to sequential...")
                for pil_img in pil_images:
                    try:
                        results.append(hayai(pil_img).strip())
                    except Exception:
                        results.append("")
        return results

    def _run_paddle_ocr(self, image_input: Union[Image.Image, np.ndarray], lang: str, box_id: Any) -> str:
        """Helper to invoke PaddleOCR and extract concatenated text lines"""
        engine = self._get_paddle_ocr(lang)
        if not engine:
            raise RuntimeError(f"PaddleOCR model for lang '{lang}' could not be loaded.")

        np_img = self._to_numpy_rgb(image_input)
        result = engine.ocr(np_img, cls=True)

        lines = []
        if result and len(result) > 0 and result[0]:
            for line in result[0]:
                if len(line) >= 2 and line[1] and len(line[1]) >= 1:
                    recognized_line = line[1][0]
                    if recognized_line:
                        lines.append(recognized_line.strip())
        return " ".join(lines)

    def _fallback_paddle(self, image_input: Union[Image.Image, np.ndarray], lang: str, box_id: Any) -> str:
        try:
            return self._run_paddle_ocr(image_input, lang=lang, box_id=box_id)
        except Exception:
            return ""

    def _fallback_any(self, image_input: Union[Image.Image, np.ndarray], box_id: Any) -> str:
        """Emergency fallback: try Hayai-OCR v2 if available, else PaddleOCR en"""
        try:
            hayai = self._get_hayai_ocr()
            if hayai:
                pil_img = self._to_pil(image_input)
                return hayai(pil_img)
        except Exception:
            pass
        return ""


# Global singleton accessor function
def get_ocr_router() -> OCRRouter:
    return OCRRouter.get_instance()
