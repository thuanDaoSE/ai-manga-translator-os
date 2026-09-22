import os
import cv2
import base64
import numpy as np
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
import db_models as models
from worker import run_local_lama, get_ocr_manager, get_text_detector

router = APIRouter(prefix="/api", tags=["editor"])

class MaskPayload(BaseModel):
    image_url: str
    mask_base64: Optional[str] = None
    mask_url: Optional[str] = None
    page_id: Optional[str] = None

class RedrawPayload(BaseModel):
    image_url: str
    mask_base64: str
    prompt: Optional[str] = ""
    negative_prompt: Optional[str] = ""
    translation_mode: Optional[str] = "redraw"
    page_id: Optional[str] = None

def resolve_local_image_path(url: str) -> str:
    """Chuyển đổi URL ảnh thành đường dẫn tệp tin vật lý cục bộ"""
    url_clean = url.split('?')[0]
    if "/workspace/" in url_clean:
        return "workspace/" + url_clean.split("/workspace/")[-1]
    return url_clean.lstrip('/')

@router.post("/erase-mask")
async def erase_mask(
    payload: MaskPayload,
    db: AsyncSession = Depends(get_db)
):
    """Xóa vùng chọn (Mask) trên ảnh bằng Local LaMa Inpainting"""
    local_path = resolve_local_image_path(payload.image_url)
    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy file ảnh tại {local_path}")

    image = cv2.imread(local_path)
    if image is None:
        raise HTTPException(status_code=400, detail="Không thể đọc file ảnh")

    if not payload.mask_base64:
        raise HTTPException(status_code=400, detail="Thiếu mask_base64")

    b64_data = payload.mask_base64
    if "," in b64_data:
        b64_data = b64_data.split(",")[1]
    mask_bytes = base64.b64decode(b64_data)
    mask_rgba = cv2.imdecode(np.frombuffer(mask_bytes, np.uint8), cv2.IMREAD_UNCHANGED)

    if mask_rgba is None:
        raise HTTPException(status_code=400, detail="Mặt nạ mask không hợp lệ")

    mask = mask_rgba[:, :, 3] if len(mask_rgba.shape) == 3 and mask_rgba.shape[2] == 4 else cv2.cvtColor(mask_rgba, cv2.COLOR_BGR2GRAY) if len(mask_rgba.shape) == 3 else mask_rgba

    # Inpaint
    def run_inpaint():
        x, y, w, h = cv2.boundingRect(mask)
        if w > 0 and h > 0:
            pad = 60
            h_img, w_img = image.shape[:2]
            x1, y1 = max(0, x - pad), max(0, y - pad)
            x2, y2 = min(w_img, x + w + pad), min(h_img, y + h + pad)

            crop_img = image[y1:y2, x1:x2]
            crop_mask = mask[y1:y2, x1:x2]

            inpainted_crop = run_local_lama(crop_img, crop_mask)
            image[y1:y2, x1:x2] = inpainted_crop
        cv2.imwrite(local_path, image, [cv2.IMWRITE_JPEG_QUALITY, 95])

    await asyncio.to_thread(run_inpaint)

    new_url = f"/{local_path}"
    # Đồng bộ CSDL nếu có page_id
    if payload.page_id:
        result = await db.execute(select(models.Page).where(models.Page.id == payload.page_id))
        page = result.scalars().first()
        if page:
            page.clean_url = new_url
            await db.commit()

    return {
        "status": "success",
        "new_url": new_url,
        "credits": 999999
    }

@router.post("/ctd-erase")
async def ctd_erase(
    payload: MaskPayload,
    db: AsyncSession = Depends(get_db)
):
    """Tẩy chữ thông minh phát hiện nét chữ tự động và xóa bằng LaMa"""
    return await erase_mask(payload, db)

@router.post("/redraw")
@router.post("/ai-redraw-mask")
async def ai_redraw(
    payload: RedrawPayload,
    db: AsyncSession = Depends(get_db)
):
    """Vẽ lại vùng ảnh bằng Native LaMa Inpainting Engine"""
    mask_payload = MaskPayload(
        image_url=payload.image_url,
        mask_base64=payload.mask_base64,
        page_id=payload.page_id
    )
    return await erase_mask(mask_payload, db)

@router.post("/quick-scan")
async def quick_scan(payload: dict = Body(...)):
    """Quét OCR nhanh vùng chọn"""
    crop_b64 = payload.get("crop_base64", "")
    if "," in crop_b64:
        crop_b64 = crop_b64.split(",")[1]
        
    img_bytes = base64.b64decode(crop_b64)
    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Không thể đọc ảnh crop")
        
    from PIL import Image
    pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    ocr_mgr = get_ocr_manager()
    text = ocr_mgr.ocr(pil_img, lang=payload.get("source_language", "ja"))
    
    return {"status": "success", "text": text}
