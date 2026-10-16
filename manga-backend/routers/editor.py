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

router = APIRouter(tags=["editor"])

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
    """Vẽ lại vùng ảnh bằng AI (FLUX.1 Schnell Inpainting hoặc LaMa Fallback)"""
    prompt = (payload.prompt or "").strip()
    if not prompt:
        mask_payload = MaskPayload(
            image_url=payload.image_url,
            mask_base64=payload.mask_base64,
            page_id=payload.page_id
        )
        return await erase_mask(mask_payload, db)

    local_path = resolve_local_image_path(payload.image_url)
    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy file ảnh tại {local_path}")

    image = cv2.imread(local_path)
    if image is None:
        raise HTTPException(status_code=400, detail="Không thể đọc file ảnh")

    b64_data = payload.mask_base64
    if "," in b64_data:
        b64_data = b64_data.split(",")[1]
    mask_bytes = base64.b64decode(b64_data)
    mask_rgba = cv2.imdecode(np.frombuffer(mask_bytes, np.uint8), cv2.IMREAD_UNCHANGED)

    if mask_rgba is None:
        raise HTTPException(status_code=400, detail="Mặt nạ mask không hợp lệ")

    mask = mask_rgba[:, :, 3] if len(mask_rgba.shape) == 3 and mask_rgba.shape[2] == 4 else cv2.cvtColor(mask_rgba, cv2.COLOR_BGR2GRAY) if len(mask_rgba.shape) == 3 else mask_rgba

    def run_redraw_task():
        nonlocal image
        engine_used = "flux"
        try:
            from flux_engine import run_flux_redraw
            image = run_flux_redraw(
                image_bgr=image,
                mask_gray=mask,
                prompt=prompt,
                negative_prompt=payload.negative_prompt or ""
            )
        except Exception as e:
            import logging
            logging.getLogger("editor_router").warning(f"FLUX Redraw gặp sự cố, tự động fallback sang LaMa Inpainting: {e}")
            engine_used = "lama_fallback"
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
        return engine_used

    engine_used = await asyncio.to_thread(run_redraw_task)

    new_url = f"/{local_path}"
    if payload.page_id:
        result = await db.execute(select(models.Page).where(models.Page.id == payload.page_id))
        page = result.scalars().first()
        if page:
            page.clean_url = new_url
            await db.commit()

    return {
        "status": "success",
        "new_url": new_url,
        "credits": 999999,
        "engine": engine_used
    }

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

@router.get("/flux/status")
async def get_flux_status():
    """Lấy trạng thái sẵn sàng và tiến trình tải của mô hình FLUX.1-Fill GGUF"""
    from flux_engine import FluxFillDownloadManager
    mgr = FluxFillDownloadManager.get_instance()
    return mgr.get_status_dict()

@router.post("/flux/preload")
async def preload_flux():
    """Kích hoạt tải trước mô hình FLUX.1-Fill GGUF trên background thread"""
    from flux_engine import FluxFillDownloadManager
    mgr = FluxFillDownloadManager.get_instance()
    return mgr.start_download()

@router.get("/flux/progress")
async def stream_flux_progress():
    """Stream SSE tiến độ tải mô hình FLUX thời gian thực"""
    import json
    from fastapi.responses import StreamingResponse
    from flux_engine import FluxFillDownloadManager
    mgr = FluxFillDownloadManager.get_instance()

    async def event_generator():
        try:
            while True:
                status_data = mgr.get_status_dict()
                yield f"data: {json.dumps(status_data, ensure_ascii=False)}\n\n"
                if status_data["status"] in ("ready", "error"):
                    break
                if status_data["status"] == "idle" and getattr(mgr, "is_cancelled", False):
                    break
                await asyncio.sleep(0.5)
        except (asyncio.CancelledError, GeneratorExit):
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("/flux/cancel")
async def cancel_flux():
    """Hủy tiến trình tải mô hình FLUX.1-Fill GGUF"""
    from flux_engine import FluxFillDownloadManager
    mgr = FluxFillDownloadManager.get_instance()
    return mgr.cancel_download()

@router.get("/joycaption/status")
async def get_joycaption_status():
    """Lấy trạng thái sẵn sàng và tiến trình tải của mô hình JoyCaption Beta One"""
    from joycaption_engine import JoyCaptionDownloadManager
    mgr = JoyCaptionDownloadManager.get_instance()
    return mgr.get_status_dict()

@router.post("/joycaption/preload")
async def preload_joycaption():
    """Kích hoạt tải trước mô hình JoyCaption trên background thread"""
    from joycaption_engine import JoyCaptionDownloadManager
    mgr = JoyCaptionDownloadManager.get_instance()
    return mgr.start_download()

@router.post("/joycaption/cancel")
async def cancel_joycaption():
    """Hủy tiến trình tải mô hình JoyCaption"""
    from joycaption_engine import JoyCaptionDownloadManager
    mgr = JoyCaptionDownloadManager.get_instance()
    return mgr.cancel_download()

@router.get("/joycaption/progress")
async def stream_joycaption_progress():
    """Stream SSE tiến độ tải mô hình JoyCaption thời gian thực"""
    import json
    from fastapi.responses import StreamingResponse
    from joycaption_engine import JoyCaptionDownloadManager
    mgr = JoyCaptionDownloadManager.get_instance()

    async def event_generator():
        try:
            while True:
                status_data = mgr.get_status_dict()
                yield f"data: {json.dumps(status_data, ensure_ascii=False)}\n\n"
                if status_data["status"] in ("ready", "error"):
                    break
                if status_data["status"] == "idle" and getattr(mgr, "is_cancelled", False):
                    break
                await asyncio.sleep(0.5)
        except (asyncio.CancelledError, GeneratorExit):
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

import shutil
import uuid
import re
from fastapi import UploadFile, File, Request
from dependencies import get_current_user_id

@router.post("/upload-raw")
async def upload_raw(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id)
):
    """Upload raw image directly to workspace for editing"""
    safe_name = os.path.basename(file.filename or "upload.png").replace("..", "").replace("/", "").replace("\\", "")
    os.makedirs("workspace", exist_ok=True)
    save_path = os.path.join("workspace", f"Clean_{uuid.uuid4().hex}_{safe_name}")
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "filename": safe_name}

@router.put("/upload-file")
async def upload_file(path: str, request: Request):
    """Worker direct file sync endpoint"""
    try:
        clean_path = os.path.normpath(path).replace("\\", "/")
        if not clean_path.startswith("workspace/"):
            raise HTTPException(status_code=400, detail="Invalid path destination")
        
        full_path = os.path.abspath(clean_path)
        base_dir = os.path.abspath("workspace")
        if os.path.commonpath([full_path, base_dir]) != base_dir:
            raise HTTPException(status_code=403, detail="Access Denied: Path Traversal detected")

        body = await request.body()
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(body)
        return {"status": "success", "path": clean_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

class RedrawPromptPayload(BaseModel):
    vietnameseText: str
    selectedTags: Optional[list] = []
    mode: Optional[str] = "manga"

UNIVERSAL_APPEND_MANGA = ", (masterpiece, best quality, highres:1.2), monochrome, greyscale, screentones, precise lineart, heavy hatching, high contrast, manga style, traditional media, ink"
UNIVERSAL_APPEND_WEBTOON = ", (masterpiece, best quality, highres:1.2), webtoon style, manhwa style, cel shading, flat colors, vibrant palette, dynamic lighting, clean crisp lines, highly detailed"
UNIVERSAL_NEGATIVE = "(text, signature, watermark, logo, speech bubble:1.4), (worst quality, low quality, bad quality, draft:1.4), (bad anatomy, deformed, disfigured, mutated hands, missing fingers, extra digits, fused fingers:1.3), blurry, out of focus, jpeg artifacts, realistic, photorealistic, 3d, cg, 2.5d, depth of field, noisy lines, messy sketch, simple background"

@router.post("/redraw-prompt")
async def process_redraw_prompt(
    payload: RedrawPromptPayload,
    request: Request,
    user_id: str = Depends(get_current_user_id)
):
    """Chuyển đổi prompt tiếng Việt thành prompt vẽ lại tiếng Anh tối ưu"""
    val = (payload.vietnameseText or "").strip()
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    translated_tags = val
    if api_key and val:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
            resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "You are a specialized translation assistant. Translate natural descriptions of illustration elements into clean comma-separated English anime/danbooru tags. Return ONLY the English tags."},
                    {"role": "user", "content": val}
                ],
                max_tokens=60,
                temperature=0.3
            )
            translated_tags = resp.choices[0].message.content.strip()
        except Exception:
            pass

    positive_components = []
    if translated_tags:
        positive_components.append(translated_tags)
    if payload.selectedTags:
        positive_components.append(", ".join(payload.selectedTags))

    style_suffix = UNIVERSAL_APPEND_MANGA if payload.mode == 'manga' else UNIVERSAL_APPEND_WEBTOON
    final_positive = ", ".join(positive_components) + style_suffix if positive_components else style_suffix.lstrip(", ")
    final_positive = re.sub(r',\s*,', ',', final_positive).strip(" ,")

    return {
        "finalPositivePrompt": final_positive,
        "finalNegativePrompt": UNIVERSAL_NEGATIVE
    }

class CopilotRequest(BaseModel):
    japanese: str
    text: str
    action: str
    custom_prompt: Optional[str] = ""

@router.post("/copilot/chat")
async def copilot_chat(
    req: CopilotRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Trợ lý AI dịch thuật ngữ cảnh theo phong cách giao tiếp"""
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        return {"result": req.text}

    system_prompt = "Bạn là chuyên gia dịch thuật Manga. Tuân thủ TUYỆT ĐỐI: 1. Chỉ trả về kết quả dịch cuối cùng. 2. KHÔNG giải thích. 3. KHÔNG dùng ngoặc kép."
    if req.action == "aggressive":
        user_prompt = f"Viết lại câu sau cho thật cục cằn, hầm hố, giang hồ (giữ nguyên nghĩa). Tiếng Nhật: {req.japanese}. Bản dịch cũ: {req.text}"
    elif req.action == "natural":
        user_prompt = f"Viết lại câu sau cho mượt mà, tự nhiên, giống văn phong giao tiếp GenZ Việt Nam. Tiếng Nhật: {req.japanese}. Bản dịch cũ: {req.text}"
    elif req.action == "shorten":
        user_prompt = f"Rút gọn câu sau cho ngắn nhất có thể để nhét vừa khung thoại nhỏ (không làm mất nghĩa). Tiếng Nhật: {req.japanese}. Bản dịch cũ: {req.text}"
    elif req.action == "explain":
        system_prompt = "Bạn là từ điển sống về văn hóa Nhật Bản. Giải thích cực kỳ ngắn gọn (dưới 40 từ)."
        user_prompt = f"Giải thích ý nghĩa, sắc thái hoặc chơi chữ (nếu có) của câu tiếng Nhật này: {req.japanese}"
    else:
        user_prompt = f"Tiếng Nhật: {req.japanese}. Bản dịch: {req.text}. Yêu cầu riêng: {req.custom_prompt}"

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
        resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=150,
            temperature=0.3
        )
        return {"result": resp.choices[0].message.content.strip()}
    except Exception as e:
        return {"result": req.text, "error": str(e)}



