"""
Unified Hayai-OCR v2 Router (SigLIP 2 NaFlex)
Author: AI Manga Translator
Purpose: Dedicated single SOTA OCR engine for all manga/comic languages:
         - Japanese ('ja'), Korean ('ko'), Chinese ('zh'), English ('en')
Architecture: Singleton + Lazy Loading (VRAM-efficient, zero redundant fallbacks)
"""

import os
import sys
import logging
from typing import Optional, Union, Dict, Any, List
import numpy as np
from PIL import Image

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
        self._hayai_ocr_available: Optional[bool] = None
        logger.info("OCRRouter initialized (Dedicated Hayai-OCR v2 + SigLIP 2 engine).")

    @classmethod
    def get_instance(cls) -> "OCRRouter":
        if cls._instance is None:
            cls._instance = OCRRouter()
        return cls._instance

    def _get_hayai_ocr(self):
        """Lazy load SOTA Multilingual Manga OCR (Hayai-OCR v2 + SigLIP 2 NaFlex)"""
        if "hayai_ocr" not in self._models:
            try:
                from hayai_ocr import HayaiOcr
                logger.info("Loading Hayai-OCR v2 via official engine (SigLIP 2 NaFlex)...")
                engine = HayaiOcr(use_v2=True, compile=False)

                class OfficialHayaiWrapper:
                    def __init__(self, eng):
                        self.engine = eng

                    def __call__(self, pil_image: Image.Image) -> str:
                        res = self.engine(pil_image)
                        return (res or "").strip()

                    def recognize_batch(self, images: list) -> list:
                        if not images:
                            return []
                        crops = [
                            img.convert("RGB") if isinstance(img, Image.Image) else Image.fromarray(img).convert("RGB")
                            for img in images
                        ]
                        batch_res = self.engine(crops)
                        if isinstance(batch_res, list):
                            return [str(t).strip() for t in batch_res]
                        return [str(batch_res).strip()]

                self._models["hayai_ocr"] = OfficialHayaiWrapper(engine)
                self._hayai_ocr_available = True
                logger.info("✅ Hayai-OCR v2 (SigLIP 2 NaFlex) loaded successfully via official HayaiOcr.")
            except Exception as e:
                logger.error(f"Failed to load Hayai-OCR v2: {e}")
                self._hayai_ocr_available = False
                return None
        return self._models.get("hayai_ocr")

    def _get_fallback_ocr(self):
        if "fallback_ocr" not in self._models:
            try:
                from manga_ocr import MangaOcr
                logger.info("Loading Manga-OCR fallback engine...")
                self._models["fallback_ocr"] = MangaOcr()
            except Exception as e:
                logger.warning(f"Could not load fallback MangaOcr: {e}")
        return self._models.get("fallback_ocr")

    def _get_manga_ocr(self):
        return self._get_hayai_ocr()

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

    def recognize(
        self,
        image_input: Union[Image.Image, np.ndarray],
        source_language: str = "auto",
        box_id: Union[int, str] = 1
    ) -> str:
        """
        Unified OCR Recognition using JustANormalTinkerer/hayai-ocr-v2
        Natively supports Japanese, Korean, Chinese, and English manga/comic texts.
        """
        try:
            pil_img = self._to_pil(image_input)
            hayai = self._get_hayai_ocr()
            if hayai:
                text = hayai(pil_img)
                if text:
                    return text.strip()
            # Fallback nếu Hayai trả về rỗng hoặc chưa sẵn sàng
            fallback = self._get_fallback_ocr()
            if fallback:
                return (fallback(pil_img) or "").strip()
            return ""
        except Exception as e:
            logger.error(f"❌ [Hayai-OCR Error on Box {box_id}]: {e}")
            try:
                fallback = self._get_fallback_ocr()
                if fallback:
                    return (fallback(pil_img) or "").strip()
            except Exception:
                pass
            return ""

    def recognize_batch(
        self,
        image_inputs: list,
        source_language: str = "auto",
        batch_size: int = 16
    ) -> list:
        """Processes a list of cropped images in batch using Hayai-OCR v2."""
        if not image_inputs:
            return []

        try:
            return self._run_hayai_ocr_batch(image_inputs, batch_size=batch_size)
        except Exception as e:
            logger.warning(f"⚠️ [Batch Hayai-OCR failed]: {e}. Fallback to sequential...")
            return [self.recognize(img, source_language=source_language, box_id=idx + 1) for idx, img in enumerate(image_inputs)]

    def _run_hayai_ocr_batch(self, image_inputs: list, batch_size: int = 16) -> list:
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


def get_ocr_router() -> OCRRouter:
    return OCRRouter.get_instance()
