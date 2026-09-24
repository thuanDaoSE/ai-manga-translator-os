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
                return (text or "").strip()
            else:
                raise RuntimeError("Hayai-OCR v2 instance not available")
        except Exception as e:
            logger.error(f"❌ [Hayai-OCR Error on Box {box_id}]: {e}")
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
