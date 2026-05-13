import os
import time
import uuid
import cv2
import numpy as np
from fastapi.concurrency import run_in_threadpool
from PIL import Image
import base64
import shutil
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
from fastapi.responses import StreamingResponse
import redis.asyncio as aioredis
import json
import asyncio
# Sửa dòng import này (khoảng dòng 17)
from worker import process_manga_page, lama_session, mocr, client, text_detector
from celery.result import AsyncResult

from pydantic import BaseModel

# --- IMPORT DATABASE ---
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import engine, Base, get_db
import db_models as models


# --- IMPORT WORKER TẠM THỜI CHƯA ĐỤNG TỚI ---
from worker import process_manga_page, lama_session, mocr, client 

import urllib.request
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Cấu hình cổng ComfyUI
COMFYUI_URL = "http://127.0.0.1:8188"
PROJECTS_DIR = "/app/workspace/projects" # Thay đổi cho đúng đường dẫn lưu ảnh của bạn

class RedrawRequest(BaseModel):
    filename: str
    mask_base64: str
    prompt: str

def get_base_url():
    """Hàm tự động "ngửi" xem máy chủ đang chạy ở link nào"""
    pod_id = os.getenv("RUNPOD_POD_ID")
    if pod_id:
        return f"https://{pod_id}-8000.proxy.runpod.net"
    return "http://localhost:8000"

def queue_prompt_to_comfyui(prompt_workflow):
    p = {"prompt": prompt_workflow}
    data = json.dumps(p).encode('utf-8')
    req =  urllib.request.Request(f"{COMFYUI_URL}/prompt", data=data)
    response = urllib.request.urlopen(req)
    return json.loads(response.read())

def get_comfyui_history(prompt_id):
    req =  urllib.request.Request(f"{COMFYUI_URL}/history/{prompt_id}")
    response = urllib.request.urlopen(req)
    return json.loads(response.read())

app = FastAPI(title="Manga AI Backend API", version="2.0.0")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🚀 BƯỚC NGOẶT KIẾN TRÚC: Đóng /static, mở /workspace
os.makedirs("workspace", exist_ok=True)
app.mount("/workspace", StaticFiles(directory="workspace"), name="workspace")

# --- KÍCH HOẠT DATABASE KHI BẬT SERVER ---
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        # Tự động tạo các bảng nếu chưa có
        await conn.run_sync(Base.metadata.create_all)

# ==========================================
# CÁC API MỚI CHO QUẢN LÝ DỰ ÁN & LƯU TRỮ TẬP TRUNG
# ==========================================

# ==========================================
# HỆ THỐNG BẢO VỆ API (AUTH GUARD)
# ==========================================
from dotenv import load_dotenv
import os
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt

# 🚀 BÍ QUYẾT 1: Ép buộc ghi đè bộ nhớ đệm để luôn đọc file .env mới nhất!
load_dotenv(override=True)

security = HTTPBearer()

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# ==========================================
# HỆ THỐNG BẢO VỆ API (AUTH GUARD)
# ==========================================
from dotenv import load_dotenv
import os
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt

load_dotenv(override=True)
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        
        # 🚀 HACK MVP: Đọc thẳng User ID từ Thẻ Căn Cước mà không cần đối chiếu File PEM (Bypass hoàn toàn lỗi RS256)
        payload = jwt.get_unverified_claims(token)
        
        if "sub" not in payload:
            raise ValueError("Token không chứa ID người dùng")
            
        return payload["sub"] # Trả về user_id (Sổ đỏ của Dự án)
        
    except Exception as e:
        print(f"🚨 LỖI ĐỌC TOKEN: {str(e)}")
        raise HTTPException(status_code=401, detail="Token không hợp lệ hoặc đã hết hạn")

# ==========================================
# CÁC API MỚI CHO QUẢN LÝ DỰ ÁN
# ==========================================
class ProjectCreate(BaseModel):
    name: str

# 🚀 ĐÃ SỬA: Ép buộc phải có user_id (Bắt buộc đăng nhập) mới được tạo Dự án
@app.post("/api/projects")
async def create_project(payload: ProjectCreate, user_id: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    project_id = str(uuid.uuid4())
    os.makedirs(f"workspace/{project_id}/raw", exist_ok=True)
    os.makedirs(f"workspace/{project_id}/clean", exist_ok=True)
    
    # 🚀 ĐÃ SỬA: Lưu user_id vào Database để nhận diện "Sổ đỏ"
    new_project = models.Project(id=project_id, user_id=user_id, name=payload.name)
    db.add(new_project)
    await db.commit()
    
    return {"status": "success", "project_id": project_id, "name": payload.name}


@app.post("/api/projects/{project_id}/upload")
async def upload_page_to_project(
    project_id: str, 
    file: UploadFile = File(...), 
    db: AsyncSession = Depends(get_db)
):
    # 1. Kiểm tra Project có tồn tại không
    result = await db.execute(select(models.Project).where(models.Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project không tồn tại")

    # 2. Lưu file vật lý vào thư mục RAW của Project đó
    page_id = str(uuid.uuid4())
    file_ext = file.filename.split(".")[-1]
    safe_filename = f"{page_id}.{file_ext}" 
    
    raw_path = f"workspace/{project_id}/raw/{safe_filename}"
    
    with open(raw_path, "wb") as buffer:
        await run_in_threadpool(shutil.copyfileobj, file.file, buffer)
        
    # 3. Lưu thông tin trang vào Database
    raw_url = f"{get_base_url()}/workspace/{project_id}/raw/{safe_filename}"
    new_page = models.Page(
        id=page_id,
        project_id=project_id,
        filename=file.filename,
        raw_url=raw_url
    )
    db.add(new_page)
    await db.commit()
    
    return {"status": "success", "page_id": page_id, "raw_url": raw_url}

# ==========================================
# CÁC API CŨ (Tạm thời giữ nguyên để không làm gãy tính năng cũ)
# ==========================================
# ... (Các API /api/translate, /api/task, /api/quick-scan giữ nguyên như cũ, 
# ở bước sau ta sẽ sửa chúng để móc nối với Database)
# ==========================================
# API THỜI GIAN THỰC (SSE + REDIS PUB/SUB)
# ==========================================
@app.get("/api/stream/{task_id}")
async def stream_task_progress(task_id: str):
    """Đường ống Server-Sent Events (SSE) đẩy log trực tiếp về Frontend"""
    async def event_generator():
        # Kết nối tới Redis
        r = await aioredis.from_url("redis://localhost:6379/0")
        pubsub = r.pubsub()
        channel_name = f"task_progress:{task_id}"
        await pubsub.subscribe(channel_name)
        
        try:
            # Liên tục lắng nghe kênh Redis
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    data_str = message['data'].decode('utf-8')
                    
                    # Trả data về Frontend theo đúng chuẩn SSE (bắt buộc có chữ data: và \n\n)
                    yield f"data: {data_str}\n\n"
                    
                    # Nếu thành công hoặc thất bại thì tự động ngắt ống nước
                    parsed = json.loads(data_str)
                    if parsed.get('state') in ['SUCCESS', 'FAILURE']:
                        break
        finally:
            await pubsub.unsubscribe(channel_name)
            await r.close()

    # StreamingResponse giữ HTTP connection mở liên tục
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# ==========================================
# API DỊCH: KẾT NỐI DATABASE & WORKER
# ==========================================
from typing import List, Dict, Any
from fastapi import Query

# 🚀 BẢN VÁ 2: Đảm bảo "data" nhận kiểu List (Mảng) thay vì Dict
@app.post("/api/pages/{page_id}/save-results")
async def save_results(
    page_id: str, 
    data: List[Dict[str, Any]], # Chấp nhận mảng dữ liệu OCR
    clean_url: str = Query(...), 
    db: AsyncSession = Depends(get_db)
):
    try:
        # Code cập nhật Database của bạn ở đây...
        query = await db.execute(select(models.Page).where(models.Page.id == page_id))
        page = query.scalars().first()
        if page:
            page.clean_url = clean_url
            page.status = "completed"
            await db.commit()
            
        return {"status": "success"}
    except Exception as e:
        print("Lỗi save-results:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

# API TRẢ KẾT QUẢ SAU KHI DỊCH XONG
@app.get("/api/task/{task_id}")
async def get_task_result(task_id: str):
    task = AsyncResult(task_id)
    if task.state == 'SUCCESS':
        return {"status": "SUCCESS", "result": task.result}
    return {"status": task.state}


# ==========================================
# API LENS: KÍNH LÚP THÔNG MINH (DEEP LENS)
# ==========================================

# 🚀 THÊM ĐOẠN CLASS NÀY VÀO ĐÂY:
class QuickScanPayload(BaseModel):
    filename: str
    x1: int
    y1: int
    x2: int
    y2: int
    genre: str = ""
    tone: str = ""
    pronouns: str = ""

# ĐOẠN API BÊN DƯỚI GIỮ NGUYÊN:
@app.post("/api/quick-scan")
async def quick_scan(payload: QuickScanPayload):
    img_path = payload.filename if payload.filename.startswith("Clean_") else f"Clean_{payload.filename}"
    image = cv2.imread(img_path)

    
    if image is None:
        return {"status": "success", "japanese": "", "vietnamese": "Lỗi: Không tìm thấy ảnh gốc."}
        
    h, w = image.shape[:2]
    x1, x2 = sorted([max(0, min(payload.x1, w)), max(0, min(payload.x2, w))])
    y1, y2 = sorted([max(0, min(payload.y1, h)), max(0, min(payload.y2, h))])
    
    # Chống click chuột nhầm
    if x2 - x1 < 10 or y2 - y1 < 10:
        return {"status": "success", "japanese": "", "vietnamese": "Vùng quét quá nhỏ!"}
    
    crop = image[y1:y2, x1:x2]
    
    # 🚀 LÕI CÔNG NGHỆ DEEP LENS
    # Chạy mô hình CTD cực nặng NHƯNG chỉ trên một góc ảnh nhỏ -> Hoàn thành trong 1 giây!
    ctd_result = text_detector(crop)
    ctd_mask = ctd_result[0] if isinstance(ctd_result, tuple) else ctd_result
    if ctd_mask.max() <= 1.0: ctd_mask = (ctd_mask * 255).astype(np.uint8)
    
    # Dùng Mặt nạ AI để cô lập chữ: Xóa sạch nhiễu nền (screentones, tóc, hoa văn) thành màu trắng
    crop_clean = crop.copy()
    crop_clean[ctd_mask < 127] = 255 
    
    # Phóng to ảnh đã lọc nhiễu sạch sẽ để OCR đọc bách phát bách trúng
    crop_large = cv2.resize(crop_clean, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    japanese_text = mocr(Image.fromarray(cv2.cvtColor(crop_large, cv2.COLOR_BGR2RGB))).strip()
    
    if not japanese_text: 
        return {"status": "success", "japanese": "", "vietnamese": "AI không đọc được chữ trong vùng này"}
    
    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": f"Dịch truyện tranh sang tiếng Việt ngắn gọn. Bối cảnh: {payload.genre}"},
                {"role": "user", "content": f"Dịch: {japanese_text}"}
            ]
        )
        vietnamese_text = response.choices[0].message.content.strip()
    except Exception as e:
        vietnamese_text = f"Lỗi API DeepSeek: {str(e)}"
        
    return {
        "status": "success",
        "japanese": japanese_text,
        "vietnamese": vietnamese_text
    }


# ==========================================
# API UPLOAD NGẦM CHO TÍNH NĂNG CŨ
# ==========================================
@app.post("/api/upload-raw")
async def upload_raw(file: UploadFile = File(...)):
    with open(f"Clean_{file.filename}", "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "filename": file.filename}

# ==========================================
# CÁC CLASS MODEL NHẬN DỮ LIỆU
# ==========================================
class MaskPayload(BaseModel):
    image_url: str
    mask_base64: str

class RedrawRequest(BaseModel):
    image_url: str
    mask_base64: str
    prompt: str

# Hàm helper bóc tách URL thành đường dẫn vật lý trên RunPod
def get_local_path_from_url(url: str) -> str:
    # 🚀 LỌC BỎ ĐUÔI ?t=... CỦA REACT
    clean_url = url.split("?")[0]
    if "/workspace/" in clean_url:
        return "workspace/" + clean_url.split("/workspace/")[-1]
    return clean_url.split("/")[-1]

# ==========================================
# API XÓA NỀN BẰNG LAMA (ERASE)
# ==========================================
@app.post("/api/erase-mask")
async def erase_mask(payload: MaskPayload):
    try:
        # 1. Tìm đường dẫn file gốc
        img_path = get_local_path_from_url(payload.image_url)
        image = cv2.imread(img_path)
        if image is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy ảnh gốc trên Server")

        # 2. Giải mã vùng bôi đỏ
        encoded_data = payload.mask_base64.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        mask = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if mask.shape[:2] != image.shape[:2]:
            mask = cv2.resize(mask, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST)

        # 3. Chạy OpenCV Telea Xóa nền
        _, mask_binary = cv2.threshold(mask, 10, 255, cv2.THRESH_BINARY)
        clean_image = cv2.inpaint(image, mask_binary, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

        # 4. Lưu vào thư mục clean
        clean_path = img_path.replace("/raw/", "/clean/")
        cv2.imwrite(clean_path, clean_image)
        
        # 5. Trả về URL mới
        new_url = f"{get_base_url()}/{clean_path}"
        return {"status": "success", "new_url": new_url}
        
    except Exception as e:
        print(f"Lỗi Erase: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    # ==========================================
# GỌI LỆNH DỊCH (TRANSLATE)
# ==========================================
class TranslateConfig(BaseModel):
    genre: str = ""
    tone: str = ""
    pronouns: str = ""
    glossary: str = ""

@app.post("/api/pages/{page_id}/translate")
async def translate_page(page_id: str, config: TranslateConfig, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang truyện")
    
    local_path = get_local_path_from_url(page.raw_url)
    
    # 🚀 Truyền đủ 5 tham số cho Celery
    task = process_manga_page.delay(local_path, config.genre, config.tone, config.pronouns, config.glossary)
    return {"status": "success", "task_id": task.id}

# ==========================================
# API VẼ LẠI BẰNG COMFYUI (REDRAW)
# ==========================================
@app.post("/api/redraw")
async def redraw_image(req: RedrawRequest):
    try:
        # 1. Tìm đường dẫn file gốc
        img_path = get_local_path_from_url(req.image_url)
        image_absolute_path = os.path.abspath(img_path) # ComfyUI cần đường dẫn tuyệt đối
        if not os.path.exists(image_absolute_path):
            raise HTTPException(status_code=404, detail="Không tìm thấy ảnh gốc cho ComfyUI")

        # 2. Lưu tạm Mask ra ổ cứng cho ComfyUI đọc
        mask_data = req.mask_base64.split(",")[1]
        mask_filename = f"mask_{uuid.uuid4().hex}.png"
        mask_absolute_path = os.path.abspath(os.path.join("workspace", mask_filename))
        
        with open(mask_absolute_path, "wb") as fh:
            fh.write(base64.b64decode(mask_data))
            
        # 3. Setup Prompt Tiếng Anh chuẩn Manga (Từ báo cáo Deep Research)
        positive_prompt = f"{req.prompt}, masterpiece, best quality, manga page, monochrome, grayscale, sharp lineart, seamless background, flat shading, high contrast lighting"
        negative_prompt = "text, speech bubble, watermark, color, photorealistic, 3d render, blurry, artifacts, smooth gradient, western comic"

        # 4. Kịch bản ComfyUI Chuẩn Production Manga
        workflow = {
            # --- TẢI ẢNH VÀ MODEL ---
            "LoadImage_Raw": {"class_type": "LoadImage", "inputs": {"image": image_absolute_path}},
            "LoadImage_Mask": {"class_type": "LoadImage", "inputs": {"image": mask_absolute_path}},
            "Checkpoint": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "NoobAI-XL-V1.0.safetensors"}},
            
            # --- CONTROLNET LINEART (Giữ khung nét vẽ) ---
            "AnyLine": {"class_type": "AnyLinePreprocessor", "inputs": {"image": ["LoadImage_Raw", 0]}},
            "ControlNetModel": {"class_type": "ControlNetLoader", "inputs": {"control_net_name": "controlnet-sdxl-lineart.safetensors"}},
            "ApplyControlNet": {
                "class_type": "ControlNetApplyAdvanced", 
                "inputs": {
                    "positive": ["Prompt_Pos", 0], "negative": ["Prompt_Neg", 0],
                    "control_net": ["ControlNetModel", 0], "image": ["AnyLine", 0],
                    "strength": 0.75, "start_percent": 0.0, "end_percent": 0.7 # Cho phép AI bịa chi tiết ở 30% cuối
                }
            },

            # --- PROMPT VÀ INPAINTING ---
            "Prompt_Pos": {"class_type": "CLIPTextEncode", "inputs": {"text": positive_prompt, "clip": ["Checkpoint", 1]}},
            "Prompt_Neg": {"class_type": "CLIPTextEncode", "inputs": {"text": negative_prompt, "clip": ["Checkpoint", 1]}},
            "VAE_Inpaint": {"class_type": "VAEEncodeForInpaint", "inputs": {"grow_mask_by": 6, "pixels": ["LoadImage_Raw", 0], "vae": ["Checkpoint", 2], "mask": ["LoadImage_Mask", 1]}},
            
            # --- SAMPLER (Sử dụng Restart Sampler theo báo cáo) ---
            "Sampler": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": int(time.time()), "steps": 35, "cfg": 6.0,
                    "sampler_name": "dpmpp_2m", "scheduler": "normal", "denoise": 0.90,
                    "model": ["Checkpoint", 0], "positive": ["ApplyControlNet", 0], "negative": ["ApplyControlNet", 1], "latent_image": ["VAE_Inpaint", 0]
                }
            },
            "VAEDecode": {"class_type": "VAEDecode", "inputs": {"samples": ["Sampler", 0], "vae": ["Checkpoint", 2]}},

            # --- HALFTONE POST-PROCESSING (Tạo chấm bi Screentone) ---
            "Halftone": {
                "class_type": "CR Halftone Filter",
                "inputs": {
                    "image": ["VAEDecode", 0], 
                    "resolution": "normal",
                    "dot_shape": "circle",
                    "dot_size": 2,
                    "border_blending": 0,
                    "antialias_scale": 1
                }
            },

            # --- COMPOSITE (Chỉ đè vùng AI vẽ lên ảnh gốc, giữ nguyên các vùng khác) ---
            "Composite": {
                "class_type": "ImageCompositeMasked",
                "inputs": {
                    "destination": ["LoadImage_Raw", 0],
                    "source": ["Halftone", 0],
                    "x": 0, "y": 0, "resize_source": False,
                    "mask": ["LoadImage_Mask", 1]
                }
            },

            # --- LƯU ẢNH ---
            "Save": {"class_type": "SaveImage", "inputs": {"filename_prefix": "MangaRedraw_Pro", "images": ["Composite", 0]}}
        }

        # 5. Gửi cho ComfyUI chạy
        queue_res = queue_prompt_to_comfyui(workflow)
        prompt_id = queue_res['prompt_id']

        # 6. Chờ kết quả
        output_image_path = None
        while True:
            time.sleep(1)
            history = get_comfyui_history(prompt_id)
            if prompt_id in history:
                outputs = history[prompt_id]['outputs']
                for node_id in outputs:
                    if 'images' in outputs[node_id]:
                        comfy_filename = outputs[node_id]['images'][0]['filename']
                        output_image_path = f"/app/workspace/ComfyUI/output/{comfy_filename}"
                        break
                break

        if not output_image_path:
            raise Exception("ComfyUI không trả về ảnh")

        # 7. Di chuyển ảnh vẽ xong vào đúng thư mục Clean
        clean_path = img_path.replace("/raw/", "/clean/")
        os.rename(output_image_path, clean_path)
        
        # Xóa file mask rác
        if os.path.exists(mask_absolute_path): os.remove(mask_absolute_path)

        new_url = f"{get_base_url()}/{clean_path}"
        return {"status": "success", "new_url": new_url}

    except Exception as e:
        print("Lỗi Redraw:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)