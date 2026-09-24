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


class JoyCaptionDownloadManager:
    _instance: Optional["JoyCaptionDownloadManager"] = None

    def __init__(self):
        self.model_id = os.getenv("JOYCAPTION_MODEL_ID", "fancyfeast/llama-joycaption-beta-one-hf-llava")
        self.status = "idle"  # idle | downloading | ready | error
        self.progress_pct = 0.0
        self.downloaded_bytes = 0
        self.total_bytes = 7800000000  # ~7.26 GB
        self.speed_mbps = 0.0
        self.eta_seconds = 0
        self.error_message = ""
        self.lock = threading.Lock()
        self._last_time = time.time()
        self._bytes_in_interval = 0
        self._thread: Optional[threading.Thread] = None

    @classmethod
    def get_instance(cls) -> "JoyCaptionDownloadManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def is_model_ready(self) -> bool:
        """Kiểm tra xem toàn bộ trọng số JoyCaption đã có trong cache cục bộ chưa"""
        try:
            from huggingface_hub import snapshot_download
            path = snapshot_download(self.model_id, local_files_only=True)
            # Kiểm tra file trọng số chính
            has_config = os.path.exists(os.path.join(path, "config.json"))
            if has_config:
                with self.lock:
                    self.status = "ready"
                    self.progress_pct = 100.0
                return True
            return False
        except Exception:
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
            self.error_message = ""
            self.progress_pct = 0.0
            self.downloaded_bytes = 0
            self._last_time = time.time()
            self._bytes_in_interval = 0

        self._thread = threading.Thread(target=self._run_download, daemon=True)
        self._thread.start()
        return self.get_status_dict()

    def _run_download(self):
        try:
            logger.info(f"🚀 [JoyCaption] Bắt đầu tải mô hình: {self.model_id}...")
            from huggingface_hub import HfApi, snapshot_download
            import tqdm

            mgr = self

            class JoyCaptionTqdm(tqdm.tqdm):
                def update(self, n=1):
                    super().update(n)
                    with mgr.lock:
                        mgr.downloaded_bytes += n
                        mgr._bytes_in_interval += n
                        now = time.time()
                        elapsed = now - mgr._last_time
                        if elapsed >= 0.5:
                            speed = mgr._bytes_in_interval / elapsed
                            mgr.speed_mbps = round(speed / (1024 * 1024), 1)
                            mgr._bytes_in_interval = 0
                            mgr._last_time = now
                            if mgr.total_bytes > 0:
                                mgr.progress_pct = min(99.9, round((mgr.downloaded_bytes / mgr.total_bytes) * 100, 1))
                                remaining = max(0, mgr.total_bytes - mgr.downloaded_bytes)
                                if speed > 0:
                                    mgr.eta_seconds = int(remaining / speed)

            try:
                api = HfApi()
                info = api.model_info(self.model_id, files_metadata=True)
                calc_total = sum(s.size for s in info.siblings if s.size)
                if calc_total > 0:
                    with self.lock:
                        self.total_bytes = calc_total
            except Exception as e:
                logger.warning(f"Không thể lấy metadata dung lượng JoyCaption: {e}")

            snapshot_download(
                self.model_id,
                tqdm_class=JoyCaptionTqdm,
                resume_download=True,
                ignore_patterns=["*.jpeg", "*.png", "*.md"]
            )

            if self.is_model_ready():
                with self.lock:
                    self.status = "ready"
                    self.progress_pct = 100.0
                    self.speed_mbps = 0.0
                    self.eta_seconds = 0
                logger.info("✅ Tải JoyCaption VLM thành công 100%!")
            else:
                with self.lock:
                    self.status = "error"
                    self.error_message = "Tải hoàn tất nhưng thiếu file cấu hình"
        except Exception as e:
            logger.error(f"❌ Lỗi tải JoyCaption: {e}", exc_info=True)
            with self.lock:
                self.status = "error"
                self.error_message = str(e)


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

            self._processor = AutoProcessor.from_pretrained(
                self.model_id,
                trust_remote_code=True,
                local_files_only=True
            )

            self._model = LlavaForConditionalGeneration.from_pretrained(
                self.model_id,
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
