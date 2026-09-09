"""
Multi-Model Routed OCR Pipeline (OCR Router)
Author: AI Manga Translator
Purpose: Route cropped speech bubbles to specialized OCR engines per language:
         - 'ja' (Japanese): Manga-OCR (optimized for Japanese manga, vertical text & furigana)
         - 'zh' (Chinese): PaddleOCR ('ch' model - PP-OCRv4)
         - 'ko' (Korean): Pororo OCR (if available) with PaddleOCR ('korean') fallback
         - 'en' / default: PaddleOCR ('en' model)
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
        self._manga_ocr_available: Optional[bool] = None
        logger.info("OCRRouter initialized (Lazy-Loading enabled).")

    @classmethod
    def get_instance(cls) -> "OCRRouter":
        if cls._instance is None:
            cls._instance = OCRRouter()
        return cls._instance

    # ------------------------------------------------------------------
    # Model Loaders (Lazy Loading with safe error handling)
    # ------------------------------------------------------------------

    def _get_manga_ocr(self):
        """Lazy load MangaOcr for Japanese"""
        if "manga_ocr" not in self._models:
            try:
                from manga_ocr import MangaOcr
                logger.info("Loading MangaOcr model for Japanese into memory...")
                self._models["manga_ocr"] = MangaOcr()
                self._manga_ocr_available = True
                logger.info("MangaOcr loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load MangaOcr: {e}")
                self._manga_ocr_available = False
                return None
        return self._models.get("manga_ocr")

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
          - 'ja' -> Manga-OCR
          - 'zh' / 'cn' -> PaddleOCR (ch)
          - 'ko' -> Pororo (or PaddleOCR korean)
          - 'en' / others -> PaddleOCR (en)
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

        # 1. ROUTE: JAPANESE -> Manga-OCR
        if lang == "ja":
            logger.info(f"Routed OCR: Processing box ID {box_id} using [Manga-OCR] for language [ja]")
            try:
                pil_img = self._to_pil(image_input)
                mocr = self._get_manga_ocr()
                if mocr:
                    text = mocr(pil_img)
                else:
                    raise RuntimeError("MangaOcr instance not available")
            except Exception as e:
                logger.warning(f"⚠️ [Manga-OCR Error on Box {box_id}]: {e}. Attempting fallback to PaddleOCR...")
                text = self._fallback_paddle(image_input, lang="japan", box_id=box_id)

        # 2. ROUTE: CHINESE -> PaddleOCR (ch)
        elif lang == "zh":
            logger.info(f"Routed OCR: Processing box ID {box_id} using [PaddleOCR-ch] for language [zh]")
            try:
                text = self._run_paddle_ocr(image_input, lang="ch", box_id=box_id)
            except Exception as e:
                logger.warning(f"⚠️ [PaddleOCR-ch Error on Box {box_id}]: {e}. Attempting fallback...")
                text = self._fallback_any(image_input, box_id=box_id)

        # 3. ROUTE: KOREAN -> Pororo (if installed) or PaddleOCR (korean)
        elif lang == "ko":
            pororo_engine = self._get_pororo_ocr()
            if pororo_engine:
                logger.info(f"Routed OCR: Processing box ID {box_id} using [Pororo-OCR] for language [ko]")
                try:
                    np_img = self._to_numpy_rgb(image_input)
                    res = pororo_engine(np_img)
                    if isinstance(res, list):
                        text = " ".join([str(item) for item in res if item])
                    elif isinstance(res, dict):
                        text = " ".join(res.get("description", []))
                    else:
                        text = str(res)
                except Exception as e:
                    logger.warning(f"⚠️ [Pororo Error on Box {box_id}]: {e}. Fallback to PaddleOCR (korean)...")
                    text = self._run_paddle_ocr(image_input, lang="korean", box_id=box_id)
            else:
                logger.info(f"Routed OCR: Processing box ID {box_id} using [PaddleOCR-korean] for language [ko]")
                try:
                    text = self._run_paddle_ocr(image_input, lang="korean", box_id=box_id)
                except Exception as e:
                    logger.warning(f"⚠️ [PaddleOCR-korean Error on Box {box_id}]: {e}. Attempting fallback...")
                    text = self._fallback_any(image_input, box_id=box_id)

        # 4. ROUTE: ENGLISH / DEFAULT -> PaddleOCR (en)
        else:
            logger.info(f"Routed OCR: Processing box ID {box_id} using [PaddleOCR-en] for language [{lang}]")
            try:
                text = self._run_paddle_ocr(image_input, lang="en", box_id=box_id)
            except Exception as e:
                logger.warning(f"⚠️ [PaddleOCR-en Error on Box {box_id}]: {e}. Attempting fallback...")
                text = self._fallback_any(image_input, box_id=box_id)

        return (text or "").strip()

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
        """Emergency fallback: try MangaOcr if available, else PaddleOCR en"""
        try:
            mocr = self._get_manga_ocr()
            if mocr:
                pil_img = self._to_pil(image_input)
                return mocr(pil_img)
        except Exception:
            pass
        return ""


# Global singleton accessor function
def get_ocr_router() -> OCRRouter:
    return OCRRouter.get_instance()
