"""
FLUX.1 Schnell Inpainting Engine for Manga/Webtoon AI Redraw
Supports:
- Lazy Loading (chỉ nạp vào VRAM khi có yêu cầu vẽ, không ngốn tài nguyên khi khởi động server)
- Model CPU Offload (tối ưu VRAM cho card đồ họa 12GB - 24GB như RTX 3060/4070/3090)
- Bounding-box Smart Crop with Seamless Alpha Blending
- Fast 4-step inference with Apache 2.0 commercial model (black-forest-labs/FLUX.1-schnell)
"""

import os
import cv2
import torch
import numpy as np
from PIL import Image
import logging
from typing import Optional

logger = logging.getLogger("flux_engine")

class FluxInpaintEngine:
    _instance: Optional["FluxInpaintEngine"] = None
    _pipeline = None
    _is_loading = False

    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model_id = os.getenv("FLUX_MODEL_ID", "black-forest-labs/FLUX.1-schnell")
        logger.info(f"Khởi tạo FluxInpaintEngine (Device: {self.device}, Model ID: {self.model_id})")

    @classmethod
    def get_instance(cls) -> "FluxInpaintEngine":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_pipeline(self):
        """Lazy load Diffusers FluxInpaintPipeline"""
        if self._pipeline is not None:
            return self._pipeline

        logger.info(f"⏳ Đang nạp mô hình FLUX Inpainting: {self.model_id}...")
        try:
            from diffusers import FluxInpaintPipeline

            # Sử dụng bfloat16 nếu GPU hỗ trợ CUDA, float32 nếu fallback CPU
            dtype = torch.bfloat16 if self.device == "cuda" else torch.float32

            pipe = FluxInpaintPipeline.from_pretrained(
                self.model_id,
                torch_dtype=dtype
            )

            if self.device == "cuda":
                # Kích hoạt model_cpu_offload để nạp tuần tự từng khối vào VRAM và nhả về RAM
                pipe.enable_model_cpu_offload()
            else:
                pipe.to("cpu")

            self._pipeline = pipe
            logger.info("✅ FLUX Inpainting Pipeline đã được khởi tạo và sẵn sàng!")
            return self._pipeline
        except Exception as e:
            logger.error(f"❌ Không thể nạp FLUX Pipeline: {e}", exc_info=True)
            raise e

    def run_inpaint(
        self,
        image_bgr: np.ndarray,
        mask_gray: np.ndarray,
        prompt: str,
        negative_prompt: str = "",
        steps: int = 4,
        guidance_scale: float = 3.5,
        pad: int = 64
    ) -> np.ndarray:
        """
        Thực hiện vẽ lại vùng chọn (mask) bằng FLUX Schnell:
        1. Tìm bounding box của mask và cắt crop ảnh kèm padding.
        2. Căn chỉnh kích thước chia hết cho 16.
        3. Chạy inference FLUX.
        4. Blend mượt mà vùng sinh mới vào ảnh gốc.
        """
        h_orig, w_orig = image_bgr.shape[:2]

        # 1. Tìm bounding box của mask
        x, y, w, h = cv2.boundingRect(mask_gray)
        if w == 0 or h == 0:
            logger.warning("Mask rỗng, bỏ qua inpaint FLUX")
            return image_bgr

        # Mở rộng vùng crop kèm padding
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(w_orig, x + w + pad)
        y2 = min(h_orig, y + h + pad)

        crop_w = x2 - x1
        crop_h = y2 - y1

        # Căn chỉnh kích thước crop là bội số của 16 để phù hợp với VAE của FLUX
        target_w = ((crop_w + 15) // 16) * 16
        target_h = ((crop_h + 15) // 16) * 16

        crop_img = image_bgr[y1:y2, x1:x2]
        crop_mask = mask_gray[y1:y2, x1:x2]

        # Resize tạm thời nếu cần làm tròn kích thước
        if crop_w != target_w or crop_h != target_h:
            resized_img = cv2.resize(crop_img, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
            resized_mask = cv2.resize(crop_mask, (target_w, target_h), interpolation=cv2.INTER_NEAREST)
        else:
            resized_img = crop_img
            resized_mask = crop_mask

        # Chuyển đổi sang định dạng PIL
        crop_rgb = cv2.cvtColor(resized_img, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(crop_rgb)
        pil_mask = Image.fromarray(resized_mask).convert("L")

        # Đảm bảo prompt có phong cách manga chất lượng cao
        full_prompt = prompt.strip()
        if "manga" not in full_prompt.lower():
            full_prompt = f"{full_prompt}, high quality manga style, monochrome screentone, clean lineart"

        logger.info(f"🎨 Đang chạy FLUX Inpaint (Vùng: {target_w}x{target_h}, Prompt: '{full_prompt}')")

        pipe = self.get_pipeline()
        with torch.inference_mode():
            result = pipe(
                prompt=full_prompt,
                image=pil_image,
                mask_image=pil_mask,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                max_sequence_length=256
            ).images[0]

        # Chuyển kết quả về numpy BGR
        result_np = cv2.cvtColor(np.array(result), cv2.COLOR_RGB2BGR)

        # Resize trở lại kích thước crop ban đầu nếu có căn chỉnh bội số
        if crop_w != target_w or crop_h != target_h:
            result_np = cv2.resize(result_np, (crop_w, crop_h), interpolation=cv2.INTER_LANCZOS4)

        # 4. Seamless Alpha Blending: Làm mờ viền mask để ghép không tì vết
        blurred_mask = cv2.GaussianBlur(crop_mask.astype(np.float32) / 255.0, (11, 11), 0)
        blurred_mask = np.expand_dims(blurred_mask, axis=2)

        # Blend: output = result * mask + orig * (1 - mask)
        blended_crop = (result_np.astype(np.float32) * blurred_mask + 
                        crop_img.astype(np.float32) * (1.0 - blurred_mask)).astype(np.uint8)

        # Dán đè vùng crop đã vẽ lại vào ảnh gốc
        output_image = image_bgr.copy()
        output_image[y1:y2, x1:x2] = blended_crop

        logger.info("✨ FLUX Inpaint hoàn thành xuất sắc!")
        return output_image

def run_flux_redraw(
    image_bgr: np.ndarray,
    mask_gray: np.ndarray,
    prompt: str,
    negative_prompt: str = ""
) -> np.ndarray:
    """Helper gọi nhanh FLUX Redraw engine"""
    engine = FluxInpaintEngine.get_instance()
    return engine.run_inpaint(
        image_bgr=image_bgr,
        mask_gray=mask_gray,
        prompt=prompt,
        negative_prompt=negative_prompt
    )
