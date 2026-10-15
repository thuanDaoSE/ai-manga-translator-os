"""
JoyCaption VLM Engine for Manga Context Recognition
Model: fancyfeast/llama-joycaption-beta-one-hf-llava
Quantization: 4-bit NF4 (BitsAndBytes) for ultra-low VRAM (~5.5 - 6.5 GB) & high-speed inference
Features: On-Demand Progressive Download & Realtime Progress Tracking
"""

import os
import sys
import time
import logging
import threading
from typing import Optional, Union, Dict, Any
import numpy as np
from PIL import Image

logger = logging.getLogger("JoyCaptionEngine")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [JoyCaption] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


import requests

JOYCAPTION_FILES = [
    ("config.json", 1120),
    ("generation_config.json", 181),
    ("chat_template.json", 1373),
    ("preprocessor_config.json", 554),
    ("processor_config.json", 670),
    ("special_tokens_map.json", 607),
    ("tokenizer_config.json", 50849),
    ("tokenizer.json", 17215904),
    ("model.safetensors.index.json", 104448),
    ("model-00001-of-00004.safetensors", 4886339264),
    ("model-00002-of-00004.safetensors", 4999885824),
    ("model-00003-of-00004.safetensors", 4915901840),
    ("model-00004-of-00004.safetensors", 2158011760),
]

TOTAL_JOYCAPTION_BYTES = sum(sz for _, sz in JOYCAPTION_FILES)  # 16,977,543,892 (~15.81 GB)


class JoyCaptionDownloadManager:
    _instance: Optional["JoyCaptionDownloadManager"] = None

    def __init__(self):
        self.model_id = os.getenv("JOYCAPTION_MODEL_ID", "fancyfeast/llama-joycaption-beta-one-hf-llava")
        self.models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
        self.target_dir = os.path.join(self.models_dir, "joycaption")
        os.makedirs(self.target_dir, exist_ok=True)

        self.status = "idle"  # idle | downloading | ready | error
        self.progress_pct = 0.0
        self.downloaded_bytes = 0
        self.total_bytes = TOTAL_JOYCAPTION_BYTES
        self.speed_mbps = 0.0
        self.eta_seconds = 0
        self.error_message = ""
        self.is_cancelled = False
        self.lock = threading.RLock()

        self.abort_event = threading.Event()
        self._active_response: Optional[requests.Response] = None
        self._thread: Optional[threading.Thread] = None

    @classmethod
    def get_instance(cls) -> "JoyCaptionDownloadManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _cleanup_incomplete_files(self):
        """Dọn dẹp các tệp tạm thời .incomplete dở dang của JoyCaption"""
        try:
            if os.path.exists(self.target_dir):
                for fn in os.listdir(self.target_dir):
                    if fn.endswith(".incomplete") or ".tmp" in fn:
                        try:
                            os.remove(os.path.join(self.target_dir, fn))
                        except Exception:
                            pass
        except Exception as e:
            logger.warning(f"Lỗi khi dọn dẹp tệp dở dang JoyCaption: {e}")

        # Đồng thời dọn cả trong huggingface hub nếu có
        try:
            hub_root = os.path.expanduser("~/.cache/huggingface/hub")
            if os.path.exists(hub_root):
                for r, _, fls in os.walk(hub_root):
                    if "joycaption" in r.lower() or "llama" in r.lower():
                        for fn in fls:
                            if fn.endswith(".incomplete") or ".tmp" in fn:
                                try:
                                    os.remove(os.path.join(r, fn))
                                except Exception:
                                    pass
        except Exception:
            pass

    def cancel_download(self) -> Dict[str, Any]:
        """Dừng/hủy quá trình tải JoyCaption ngay lập tức và ngắt kết nối mạng triệt để"""
        logger.info("🛑 [JoyCaption] Nhận lệnh hủy tải từ người dùng. Đang đóng kết nối mạng...")
        self.abort_event.set()
        self.is_cancelled = True

        if self._active_response is not None:
            try:
                self._active_response.close()
            except Exception:
                pass

        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=2.5)

        self._cleanup_incomplete_files()

        with self.lock:
            self.status = "idle"
            self.progress_pct = 0.0
            self.downloaded_bytes = 0
            self.speed_mbps = 0.0
            self.eta_seconds = 0
            self.error_message = ""
            self._active_response = None
            self._thread = None

        logger.info("✅ [JoyCaption] Đã dừng tải hoàn toàn, thread đã kết thúc.")
        return self.get_status_dict()

    def is_model_ready(self) -> bool:
        """Kiểm tra xem toàn bộ trọng số JoyCaption (~15.8GB) đã có đầy đủ chưa (cục bộ hoặc HF cache)"""
        # 1. Kiểm tra thư mục cục bộ models/joycaption
        if os.path.exists(self.target_dir):
            safetensors = [f for f in os.listdir(self.target_dir) if f.endswith(".safetensors") and not f.endswith(".incomplete")]
            total_size = sum(os.path.getsize(os.path.join(self.target_dir, f)) for f in safetensors)
            if len(safetensors) >= 4 and total_size > 14 * (1024**3):
                with self.lock:
                    self.status = "ready"
                    self.progress_pct = 100.0
                return True

        # 2. Kiểm tra trong cache HuggingFace
        try:
            from huggingface_hub import snapshot_download
            path = snapshot_download(self.model_id, local_files_only=True)
            safetensors = [f for f in os.listdir(path) if f.endswith(".safetensors") and not f.endswith(".incomplete")]
            total_size = sum(os.path.getsize(os.path.join(path, f)) for f in safetensors)
            if len(safetensors) >= 4 and total_size > 14 * (1024**3):
                with self.lock:
                    self.status = "ready"
                    self.progress_pct = 100.0
                return True
        except Exception:
            pass

        with self.lock:
            if self.status != "downloading":
                self.status = "idle"
                self.progress_pct = 0.0
        return False

    def get_status_dict(self) -> Dict[str, Any]:
        with self.lock:
            if self.status == "idle" and self.is_model_ready():
                self.status = "ready"
                self.progress_pct = 100.0

            total_gb = round(self.total_bytes / (1024**3), 2)
            dl_gb = round(self.downloaded_bytes / (1024**3), 2)
            eta_str = "--"
            if self.status == "ready":
                eta_str = "0s"
            elif self.eta_seconds > 0:
                mins = self.eta_seconds // 60
                secs = self.eta_seconds % 60
                eta_str = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"

            return {
                "status": self.status,
                "is_ready": self.status == "ready",
                "progress": self.progress_pct,
                "downloaded_bytes": self.downloaded_bytes,
                "total_bytes": self.total_bytes,
                "downloaded_gb": dl_gb,
                "total_gb": total_gb,
                "downloaded_formatted": f"{dl_gb:.2f} GB / {total_gb:.2f} GB",
                "speed_mbps": self.speed_mbps,
                "speed_formatted": f"{self.speed_mbps} MB/s",
                "eta_formatted": eta_str,
                "error": self.error_message
            }

    def start_download(self) -> Dict[str, Any]:
        if self.is_model_ready():
            return self.get_status_dict()

        with self.lock:
            if self.status == "downloading":
                return self.get_status_dict()
            self.status = "downloading"
            self.is_cancelled = False
            self.abort_event.clear()
            self.error_message = ""
            self.progress_pct = 0.0
            self.downloaded_bytes = 0
            self.speed_mbps = 0.0
            self.eta_seconds = 0

        self._thread = threading.Thread(target=self._run_download, daemon=True)
        self._thread.start()
        return self.get_status_dict()

    def _run_download(self):
        try:
            logger.info(f"🚀 [JoyCaption] Bắt đầu tải mô hình {self.model_id} (~15.8GB)...")

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
            token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
            if token:
                headers["Authorization"] = f"Bearer {token}"

            session = requests.Session()

            # Đếm trước các file đã có để tính base downloaded_bytes
            already_done_bytes = 0
            for fname, fsize in JOYCAPTION_FILES:
                fpath = os.path.join(self.target_dir, fname)
                if os.path.exists(fpath) and os.path.getsize(fpath) >= fsize:
                    already_done_bytes += fsize

            bytes_downloaded = already_done_bytes
            last_time = time.time()
            last_bytes = bytes_downloaded
            smoothed_speed = 0.0

            with self.lock:
                self.downloaded_bytes = bytes_downloaded
                if self.total_bytes > 0:
                    self.progress_pct = min(99.9, round((bytes_downloaded / self.total_bytes) * 100.0, 1))

            for fname, fsize in JOYCAPTION_FILES:
                if self.abort_event.is_set():
                    break

                target_file = os.path.join(self.target_dir, fname)
                incomplete_file = os.path.join(self.target_dir, f"{fname}.incomplete")

                # Bỏ qua nếu file đã có đủ dung lượng
                if os.path.exists(target_file) and os.path.getsize(target_file) >= fsize:
                    continue

                url = f"https://huggingface.co/{self.model_id}/resolve/main/{fname}"
                logger.info(f"📥 [JoyCaption] Tải tệp {fname}...")

                response = session.get(url, stream=True, headers=headers, timeout=15, allow_redirects=True)
                self._active_response = response

                if response.status_code not in (200, 206):
                    raise RuntimeError(f"Server trả về mã {response.status_code} khi tải {fname}")

                with open(incomplete_file, "wb") as f:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):  # 1 MB chunk
                        if self.abort_event.is_set():
                            logger.info(f"🛑 [JoyCaption] Nhận abort_event khi đang tải {fname}.")
                            break
                        if not chunk:
                            continue

                        f.write(chunk)
                        bytes_downloaded += len(chunk)

                        now = time.time()
                        dt = now - last_time
                        if dt >= 0.5:
                            delta_bytes = bytes_downloaded - last_bytes
                            instant_mbps = (delta_bytes / dt) / (1024 * 1024)

                            if smoothed_speed == 0.0:
                                smoothed_speed = instant_mbps
                            else:
                                smoothed_speed = (0.7 * smoothed_speed) + (0.3 * instant_mbps)

                            with self.lock:
                                if self.abort_event.is_set():
                                    break
                                self.downloaded_bytes = bytes_downloaded
                                self.speed_mbps = round(max(0.0, smoothed_speed), 1)
                                if self.total_bytes > 0:
                                    self.progress_pct = min(99.9, round((bytes_downloaded / self.total_bytes) * 100.0, 1))
                                    rem_bytes = max(0, self.total_bytes - bytes_downloaded)
                                    if smoothed_speed > 0.05:
                                        self.eta_seconds = int(rem_bytes / (smoothed_speed * 1024 * 1024))
                                    else:
                                        self.eta_seconds = 0

                            last_time = now
                            last_bytes = bytes_downloaded

                if self.abort_event.is_set():
                    self._cleanup_incomplete_files()
                    return

                # Đổi tên file sau khi tải xong tệp này
                if os.path.exists(incomplete_file):
                    if os.path.exists(target_file):
                        try:
                            os.remove(target_file)
                        except Exception:
                            pass
                    os.replace(incomplete_file, target_file)

            if self.abort_event.is_set():
                self._cleanup_incomplete_files()
                return

            if self.is_model_ready():
                with self.lock:
                    self.status = "ready"
                    self.progress_pct = 100.0
                    self.speed_mbps = 0.0
                    self.eta_seconds = 0
                    self.downloaded_bytes = self.total_bytes
                logger.info("✅ Tải JoyCaption VLM thành công 100%!")
            else:
                with self.lock:
                    self.status = "error"
                    self.error_message = "Tải hoàn tất nhưng thiếu file safetensors"

        except Exception as e:
            if self.abort_event.is_set():
                logger.info("🛑 [JoyCaption] Kết thúc do người dùng hủy.")
                self._cleanup_incomplete_files()
                return
            logger.error(f"❌ Lỗi tải JoyCaption: {e}", exc_info=True)
            with self.lock:
                self.status = "error"
                self.error_message = str(e)
            self._cleanup_incomplete_files()
        finally:
            if self._active_response:
                try:
                    self._active_response.close()
                except Exception:
                    pass
            self._active_response = None


class JoyCaptionEngine:
    _instance: Optional["JoyCaptionEngine"] = None
    _model = None
    _processor = None
    _is_available: Optional[bool] = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(JoyCaptionEngine, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        self._initialized = True
        self.model_id = os.getenv("JOYCAPTION_MODEL_ID", "fancyfeast/llama-joycaption-beta-one-hf-llava")
        logger.info(f"JoyCaptionEngine initialized (Target Model: {self.model_id}).")

    @classmethod
    def get_instance(cls) -> "JoyCaptionEngine":
        if cls._instance is None:
            cls._instance = JoyCaptionEngine()
        return cls._instance

    def is_ready(self) -> bool:
        return JoyCaptionDownloadManager.get_instance().is_model_ready()

    def _load_model(self):
        if self._model is not None:
            return True

        if not self.is_ready():
            logger.info("JoyCaption model is not downloaded yet. Skipping VLM captioning.")
            return False

        try:
            import torch
            from transformers import AutoProcessor, LlavaForConditionalGeneration, BitsAndBytesConfig

            device = "cuda" if torch.cuda.is_available() else "cpu"
            if device != "cuda":
                logger.warning("CUDA not available. JoyCaption requires a GPU for 4-bit NF4 execution.")
                self._is_available = False
                return False

            compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
            logger.info(f"⏳ Loading JoyCaption 4-bit NF4 ({self.model_id}) on {device}...")

            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=compute_dtype,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
            )

            target_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "joycaption")
            model_target = target_dir if (os.path.exists(target_dir) and len([f for f in os.listdir(target_dir) if f.endswith(".safetensors") and not f.endswith(".incomplete")]) >= 4) else self.model_id

            self._processor = AutoProcessor.from_pretrained(
                model_target,
                trust_remote_code=True,
                local_files_only=True
            )

            self._model = LlavaForConditionalGeneration.from_pretrained(
                model_target,
                quantization_config=quantization_config,
                device_map="auto",
                torch_dtype=compute_dtype,
                trust_remote_code=True,
                local_files_only=True
            )
            self._model.eval()

            self._is_available = True
            logger.info("✅ JoyCaption (4-bit NF4) loaded successfully into VRAM!")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to load JoyCaption model: {e}", exc_info=True)
            self._is_available = False
            return False

    @staticmethod
    def _normalize_image(image_input: Union[Image.Image, np.ndarray]) -> Image.Image:
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
            raise ValueError(f"Unsupported image input type: {type(image_input)}")

    def generate_caption(
        self,
        image_input: Union[Image.Image, np.ndarray],
        prompt: Optional[str] = None,
        max_new_tokens: int = 150
    ) -> str:
        """Analyzes the manga/comic page and generates a scene caption."""
        if not self._load_model():
            return ""

        try:
            import torch
            pil_image = self._normalize_image(image_input)

            max_dim = 1280
            w, h = pil_image.size
            if max(w, h) > max_dim:
                scale = max_dim / float(max(w, h))
                pil_image = pil_image.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

            default_prompt = (
                "USER: <image>\n"
                "Analyze this manga/comic page concisely. Describe the scene setting, character identities/genders, "
                "relationships, emotions, actions, and overall mood to provide context for translating dialogue.\n"
                "ASSISTANT:"
            )
            input_prompt = prompt if prompt else default_prompt

            inputs = self._processor(
                text=input_prompt,
                images=pil_image,
                return_tensors="pt"
            )

            if torch.cuda.is_available():
                inputs = {k: v.to("cuda") for k, v in inputs.items()}

            with torch.inference_mode():
                output_ids = self._model.generate(
                    **inputs,
                    max_new_tokens=max_new_tokens,
                    do_sample=False,
                    repetition_penalty=1.1
                )

            input_len = inputs["input_ids"].shape[1]
            generated_ids = output_ids[:, input_len:]
            caption = self._processor.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()

            logger.info(f"✨ JoyCaption Context: {caption[:120]}...")
            return caption

        except Exception as e:
            logger.error(f"⚠️ Error during JoyCaption generation: {e}")
            return ""

    def unload_model(self):
        if self._model is not None:
            del self._model
            self._model = None
        if self._processor is not None:
            del self._processor
            self._processor = None
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            logger.info("🧹 JoyCaption unloaded from VRAM.")
        except Exception:
            pass


def get_joycaption_engine() -> JoyCaptionEngine:
    return JoyCaptionEngine.get_instance()
