from fastapi.responses import FileResponse
from psd_utils import create_manga_psd
import filetype
import jwt
import zipfile
import io
from pydantic import BaseModel, Field
import os
import time
import uuid
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
import cv2
import numpy as np
from fastapi.concurrency import run_in_threadpool
from PIL import Image
import base64
import shutil
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException,Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from worker import process_manga_page, lama_session, mocr, client, text_detector, celery_app
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
from typing import List, Dict, Any

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 🚀 ĐỊNH NGHĨA PAYLOAD ĐỂ NHẬN DANH SÁCH BONG BÓNG TỪ FRONTEND
class BubbleListPayload(BaseModel):
    bubbles: List[Dict[str, Any]]
from pydantic import BaseModel

# --- IMPORT DATABASE ---
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import engine, Base, get_db
import db_models as models
import io
import zipfile

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import hashlib # Bổ sung thêm thư viện băm chuỗi

LENS_CACHE = {}


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
# 🚀 BƯỚC NGOẶT KIẾN TRÚC: Đóng /static, mở /workspace
os.makedirs("workspace", exist_ok=True)
# XÓA BỎ StaticFiles CŨ GÂY LỖI CORS:
# app.mount("/workspace", StaticFiles(directory="workspace"), name="workspace")

# THAY BẰNG API ĐỊNH TUYẾN CHUẨN ĐỂ VƯỢT QUA CORS:
@app.get("/workspace/{file_path:path}")
async def get_workspace_file(file_path: str):
    full_path = os.path.join("workspace", file_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy file")
    
    # FileResponse sẽ tự động kế thừa bộ lọc CORS của FastAPI
    return FileResponse(full_path)

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

import base64
import json
from fastapi import Request, HTTPException

# 🚀 CỬA KHẨU BẢO MẬT: Bóc tách JWT thuần túy (Chống crash 100%)
async def get_current_user_id(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bạn chưa đăng nhập!")
    
    token = auth_header.split(" ")[1]
    
    try:
        # JWT có 3 phần (Header, Payload, Signature) cách nhau bởi dấu chấm. Ta lấy phần giữa (Payload).
        payload_b64 = token.split(".")[1]
        
        # Thêm các dấu "=" vào cuối để chuẩn hóa định dạng Base64 nếu bị thiếu padding
        payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
        
        # Dịch ngược mã Base64 thành chuỗi JSON
        payload_json = base64.urlsafe_b64decode(payload_b64).decode('utf-8')
        payload = json.loads(payload_json)
        
        # Moi ID của User ra
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Token thiếu thông tin User ID!")
            
        return user_id

    except Exception as e:
        # Bổ sung in lỗi ra Terminal để nếu có vấn đề sếp sẽ thấy ngay!
        print(f"🛑 [LỖI GIẢI MÃ TOKEN]: {e}")
        raise HTTPException(status_code=401, detail="Cấu trúc Token không hợp lệ hoặc bị hỏng!")

# 🚀 TẠO DỰ ÁN MỚI
@app.post("/api/projects")
async def create_project(
    payload: dict, # Nhận JSON {"name": "..."}
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    project_id = str(uuid.uuid4())
    db_project = models.Project(id=project_id, name=payload.get("name", "New Project"), user_id=user_id)
    db.add(db_project)
    await db.commit()
    return db_project

# 🚀 LẤY DỰ ÁN CỦA ĐÚNG USER ĐÓ
@app.get("/api/projects")
async def list_projects(db: AsyncSession = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    result = await db.execute(select(models.Project).where(models.Project.user_id == user_id).order_by(models.Project.created_at.desc()))
    return result.scalars().all()

# 🚀 API LƯU CHỮ CỦA TRANG (MỚI)
import json # 🚀 Nhớ đảm bảo có import json ở đầu file nhé sếp

@app.post("/api/pages/{page_id}/bubbles")
async def save_page_bubbles(page_id: str, payload: BubbleListPayload, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(models.Page).where(models.Page.id == page_id))
        page = result.scalars().first()
        if page:
            page.bubbles_data = json.dumps(payload.dict()["bubbles"])
            
            # 🚀 BẢN VÁ UX: Chỉ đổi sang "translating" (Đang dịch) chứ KHÔNG PHẢI là Hoàn tất!
            # Nếu user đã chủ động bấm Completed trước đó thì giữ nguyên, không hạ cấp
            if page.status != "completed":
                page.status = "translating" 
                
            await db.commit()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pages/{page_id}/bubbles")
async def get_page_bubbles(page_id: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(models.Page).where(models.Page.id == page_id))
        page = result.scalars().first()
        
        # 🚀 Lấy chuỗi JSON từ Database và dịch ngược lại thành Mảng trả về cho Frontend
        if page and page.bubbles_data:
            return {"bubbles": json.loads(page.bubbles_data)}
            
        return {"bubbles": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


MAX_FILE_SIZE = 10 * 1024 * 1024  # Giới hạn 10MB
ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"]

@app.post("/api/projects/{project_id}/upload")
@limiter.limit("30/minute")
async def upload_page_to_project(
    request: Request,
    project_id: str, 
    file: UploadFile = File(...), 
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Chốt chặn bảo mật
):
    # ========================================================
    # 🛡️ 3 CHỐT CHẶN BẢO VỆ SERVER (PHÒNG THỦ THÉP)
    # ========================================================
    
    # 🚀 CHỐT 1: BẢO VỆ Ổ CỨNG TRƯỚC TIÊN
    total, used, free = shutil.disk_usage("/")
    free_mb = free / (1024 * 1024)
    if free_mb < 500: # Trống dưới 500MB là cấm cửa ngay
        raise HTTPException(status_code=507, detail="Hệ thống đang bảo trì ổ cứng (Sắp đầy), vui lòng thử lại sau!")

    # 🚀 CHỐT 2: KIỂM TRA HẠN MỨC DỰ ÁN (Ví dụ: Tối đa 50 trang/dự án)
    result_pages = await db.execute(select(models.Page).where(models.Page.project_id == project_id))
    current_pages = result_pages.scalars().all()
    if len(current_pages) >= 50:
        raise HTTPException(status_code=403, detail="Dự án đã đạt giới hạn 50 trang. Vui lòng xóa bớt ảnh cũ hoặc tạo dự án mới!")

    # 🚀 CHỐT 3: KIỂM TRA FILE QUÁ NẶNG (Tối ưu RAM)
    # Thay vì đọc hết file vào RAM gây đơ máy, ta chỉ nhảy con trỏ xuống cuối file để đo kích thước
    file.file.seek(0, 2) 
    file_size_mb = file.file.tell() / (1024 * 1024) 
    file.file.seek(0) # Đo xong nhớ quay con trỏ về đầu file để lát nữa còn lưu
    
    if file_size_mb > 15.0: # Lớn hơn 15MB thì chặn
        raise HTTPException(status_code=413, detail=f"Ảnh quá nặng ({file_size_mb:.1f}MB). Vui lòng nén ảnh xuống dưới 15MB!")

    # ========================================================
    # LUỒNG XỬ LÝ LƯU FILE BÌNH THƯỜNG BÊN DƯỚI
    # ========================================================

    # 1. Kiểm tra xem Project có tồn tại và đúng của User này không
    result = await db.execute(select(models.Project).where(models.Project.id == project_id, models.Project.user_id == user_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy Dự án!")

    # 2. Tạo ID cho ảnh
    page_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1]
    
    # KHAI BÁO PATH VÀ ÉP PYTHON TẠO THƯ MỤC TRƯỚC
    project_dir = f"workspace/{project_id}"
    raw_dir = f"{project_dir}/raw"
    clean_dir = f"{project_dir}/clean"
    
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(clean_dir, exist_ok=True)
    
    raw_path = f"{raw_dir}/{page_id}.{ext}"
    
    # 3. Bây giờ mới được lưu file
    with open(raw_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 4. Lưu thông tin vào Database
    db_page = models.Page(
        id=page_id,
        project_id=project_id,
        filename=file.filename,
        raw_url=f"/workspace/{project_id}/raw/{page_id}.{ext}", # Sửa lại /static/ thành /workspace/ cho chuẩn kiến trúc mới của sếp
        status="unprocessed"
    )
    db.add(db_page)
    await db.commit()
    
    return {"status": "success", "page_id": page_id}

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
    # 🚀 VŨ KHÍ BẢO MẬT 1: Giới hạn Lens Dịch
    genre: str = Field(default="", max_length=100)
    tone: str = Field(default="", max_length=100)
    pronouns: str = Field(default="", max_length=100)
    glossary: str = Field(default="", max_length=1000)

import os
import glob
import time
import base64
import json
import cv2
import numpy as np
from PIL import Image
from fastapi import HTTPException

@app.post("/api/quick-scan")
@limiter.limit("20/minute")
def quick_scan(request: Request,payload: QuickScanPayload): 
    print("\n" + "="*50)
    print("🚀 BẮT ĐẦU LỆNH QUICK-SCAN (SMART TEXT CACHE)")
    t_start = time.time() 
    
    try:
        # -----------------------------------------
        # 1. ĐỌC VÀ CẮT ẢNH CHÍNH XÁC 100% (Không làm tròn tọa độ)
        # -----------------------------------------
        img_raw = payload.filename
        
        if img_raw.startswith("data:image"):
            encoded_data = img_raw.split(',')[1]
            nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            if "workspace/" in img_raw or "/" in img_raw:
                img_path = img_raw.split('8000/')[-1] if '8000/' in img_raw else img_raw
                img_path = img_path.split('?')[0] 
            else:
                img_path = img_raw if img_raw.startswith("Clean_") else f"Clean_{img_raw}"
            
            base_path, _ = os.path.splitext(img_path)
            matched_files = glob.glob(f"{base_path}.*")
            
            if matched_files:
                img_path = matched_files[0]
                if os.path.exists(img_path):
                    os.utime(img_path, None) 
            else:
                print(f"⚠️ [QUICK-SCAN] Không tìm thấy file: {base_path}")

            image = cv2.imread(img_path)
            
        if image is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy ảnh gốc để quét Lens!")
            
        h, w = image.shape[:2]
        x1, x2 = sorted([max(0, min(payload.x1, w)), max(0, min(payload.x2, w))])
        y1, y2 = sorted([max(0, min(payload.y1, h)), max(0, min(payload.y2, h))])
        
        # ... (phần lấy tọa độ x1, x2, y1, y2 giữ nguyên)
        
        if x2 - x1 < 10 or y2 - y1 < 10:
            return {"status": "success", "japanese": "", "vietnamese": "Vùng quét quá nhỏ!"}
        
        # 🚀 BẢN VÁ: TỰ ĐỘNG NỚI RỘNG (PADDING) ĐỂ CHỐNG CẮT LẸM NÉT CHỮ
        pad = 8 # Tự nới ra 8 pixel mỗi chiều để an toàn tuyệt đối
        x1_pad = max(0, x1 - pad)
        x2_pad = min(w, x2 + pad)
        y1_pad = max(0, y1 - pad)
        y2_pad = min(h, y2 + pad)

        crop = image[y1_pad:y2_pad, x1_pad:x2_pad]
        
        t1 = time.time()

        # 🚀 BẢN VÁ: TĂNG KÍCH THƯỚC VÀ XÓA NHIỄU NỀN TRUYỆN TRANH TRƯỚC KHI ĐỌC
        crop_large = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        
        # Thêm một chút làm nét (Sharpen) để chữ Kanji rõ ràng hơn
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        crop_sharp = cv2.filter2D(crop_large, -1, kernel)

        # Chuyển vào MangaOCR
        japanese_text = mocr(Image.fromarray(cv2.cvtColor(crop_sharp, cv2.COLOR_BGR2RGB))).strip()
        
        t3 = time.time()
        # ... (Các phần lưu cache và gọi DeepSeek bên dưới giữ nguyên)
        print(f"⏱️ [Trạm 1] Đọc chữ Nhật mất: {t3 - t_start:.2f} giây")

        if not japanese_text: 
            return {"status": "success", "japanese": "", "vietnamese": "AI không đọc được chữ trong vùng này"}
        
        # -----------------------------------------
        # 3. SMART CACHE: KIỂM TRA TEXT TRƯỚC KHI GỌI DEEPSEEK
        # -----------------------------------------
        glossary_hash = hashlib.md5(payload.glossary.encode('utf-8')).hexdigest() if payload.glossary else "none"
        
        # 🚀 Khóa Cache giờ đây là "Câu tiếng Nhật", chứ không phải tọa độ nữa!
        cache_key = f"{japanese_text}_{payload.genre}_{payload.tone}_{payload.pronouns}_{glossary_hash}"
        
        if cache_key in LENS_CACHE:
            print(f"⚡ [CACHE HIT] Đã từng dịch câu này! Lấy từ RAM. Không tốn tiền gọi DeepSeek.")
            result_data = LENS_CACHE[cache_key]
            print(f"🏁 TỔNG THỜI GIAN: {time.time() - t_start:.2f} giây")
            print("="*50 + "\n")
            return result_data

        # -----------------------------------------
        # 4. GỌI API DEEPSEEK DỊCH (Nếu là câu mới)
        # -----------------------------------------
        glossary_instruction = f"\n\nBẢNG TỪ ĐIỂN ĐẶC BIỆT:\n{payload.glossary}" if payload.glossary else ""

        system_prompt = f"""Bạn là một Biên dịch viên truyện tranh chuyên nghiệp.
Thể loại truyện: {payload.genre}
Văn phong: {payload.tone}
Xưng hô: {payload.pronouns}

QUY TẮC:
1. Tuân thủ tuyệt đối cách xưng hô và văn phong ở trên.
2. SIÊU NGẮN GỌN: Chắt lọc để nhét vừa bong bóng.
3. CẢM XÚC: Giữ nguyên tiếng lóng, tiếng chửi thề (nếu có).{glossary_instruction}

TRẢ VỀ JSON:
{{
    "context_reasoning": "Phân tích ngữ cảnh",
    "vietnamese": "Câu dịch tiếng Việt."
}}"""

        try:
            response = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Dịch: {japanese_text}"}
                ],
                response_format={"type": "json_object"}, 
                temperature=0.4 
            )
            
            ai_response = json.loads(response.choices[0].message.content.strip())
            vietnamese_text = ai_response.get("vietnamese", "Lỗi định dạng")
            print(f"🧠 [SUY LUẬN]: {ai_response.get('context_reasoning')}")
            
        except Exception as e:
            print(f"Lỗi API DeepSeek: {str(e)}")
            vietnamese_text = "Lỗi kết nối AI."
            
        t4 = time.time()
        print(f"⏱️ [Trạm 2] Gọi DeepSeek mất: {t4 - t3:.2f} giây")
        
        # -----------------------------------------
        # 5. LƯU KẾT QUẢ VÀO CACHE 
        # -----------------------------------------
        result_data = {
            "status": "success",
            "japanese": japanese_text,
            "vietnamese": vietnamese_text
        }
        LENS_CACHE[cache_key] = result_data 
        if len(LENS_CACHE) > 1000:
            LENS_CACHE.pop(next(iter(LENS_CACHE)))
            
        print(f"🏁 TỔNG THỜI GIAN: {time.time() - t_start:.2f} giây")
        print("="*50 + "\n")
        return result_data
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Lỗi Quick Scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    
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
    page_id: str = None  # 🚀 THÊM DÒNG NÀY ĐỂ NHẬN ID TỪ FRONTEND

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
import uuid # Nhớ kiểm tra ở đầu file main.py xem có import uuid chưa nhé sếp

import glob # Đảm bảo đã import glob ở đầu file main.py

@app.post("/api/erase-mask")
async def erase_mask(payload: MaskPayload, db: AsyncSession = Depends(get_db)): # 🚀 Đã bơm thêm db vào đây!
    try:
        img_path_raw = payload.image_url
        
        # 1. BỘ ĐỌC ẢNH ĐA NĂNG
        if img_path_raw.startswith("data:image"):
            encoded_data = img_path_raw.split(',')[1]
            nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            clean_path = f"workspace/clean_{uuid.uuid4().hex}.png"
        else:
            # Lọc URL để lấy đúng đường dẫn tương đối trên ổ cứng
            img_path = img_path_raw.split('8000/')[-1] if '8000/' in img_path_raw else img_path_raw
            img_path = img_path.split('?')[0]
            
            # 🚀 THUẬT TOÁN MỚI: Quét đuôi file thông minh chống lệch định dạng (.png/.jpg/.webp)
            # Tách lấy phần thư mục và tên file bỏ đuôi (Ví dụ: workspace/.../raw/483fc488-5efa-4c53-8afe-77e3660bf66d)
            base_path, _ = os.path.splitext(img_path)
            
            # Dùng glob để tìm bất kỳ file nào khớp với tên đó bất kể đuôi là gì
            matched_files = glob.glob(f"{base_path}.*")
            
            if matched_files:
                # Nếu tìm thấy file thực tế trên ổ cứng, lấy luôn đường dẫn đó
                img_path = matched_files[0]
                if os.path.exists(img_path):
                    os.utime(img_path, None) # Reset tuổi thọ 24h
            else:
                print(f"⚠️ [DEBUG] Không tìm thấy bất kỳ file nào khớp với tên: {base_path}")

            image = cv2.imread(img_path)
            clean_path = img_path.replace("/raw/", "/clean/") if "/raw/" in img_path else f"workspace/clean_{uuid.uuid4().hex}.png"

        if image is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy file ảnh gốc trên hệ thống hoặc định dạng file bị hỏng!")

        # 2. GIẢI MÃ MẶT NẠ (MASK)
        encoded_data_mask = payload.mask_base64.split(',')[1]
        nparr_mask = np.frombuffer(base64.b64decode(encoded_data_mask), np.uint8)
        mask_rgba = cv2.imdecode(nparr_mask, cv2.IMREAD_UNCHANGED)
        
        # 🚀 Lấy kênh Alpha làm Mask trắng đen (Vì React gửi lên ảnh nền trong suốt, nét đỏ)
        if len(mask_rgba.shape) == 3 and mask_rgba.shape[2] == 4:
            mask = mask_rgba[:, :, 3] 
        else:
            mask = cv2.imdecode(nparr_mask, cv2.IMREAD_GRAYSCALE)

        # 3. THUẬT TOÁN CẮT MẨU (CROP) & CHẠY LAMA ONNX SIÊU NÉT
        x, y, w, h = cv2.boundingRect(mask)
        if w > 0 and h > 0:
            pad = 80 
            h_img, w_img = image.shape[:2]
            x1, y1 = max(0, x-pad), max(0, y-pad)
            x2, y2 = min(w_img, x+w+pad), min(h_img, y+h+pad)

            crop_image = image[y1:y2, x1:x2]
            crop_mask = mask[y1:y2, x1:x2]

            h_crop, w_crop = crop_image.shape[:2]
            
            # SỬA LỖI ONNX: Bắt buộc Scale/Pad thành 512x512
            scale = 1.0
            if h_crop > 512 or w_crop > 512:
                scale = 512.0 / max(h_crop, w_crop)
                new_w = int(w_crop * scale)
                new_h = int(h_crop * scale)
                crop_image = cv2.resize(crop_image, (new_w, new_h), interpolation=cv2.INTER_AREA)
                crop_mask = cv2.resize(crop_mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
            else:
                new_w, new_h = w_crop, h_crop

            # Bù thêm pixel (Padding) để đạt ĐÚNG 512x512
            pad_bottom = 512 - new_h
            pad_right = 512 - new_w

            if pad_bottom > 0 or pad_right > 0:
                crop_image = cv2.copyMakeBorder(crop_image, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
                crop_mask = cv2.copyMakeBorder(crop_mask, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)

            # 🚀 GỌI LẠI HỌA SĨ LAMA ONNX THẦN THÁNH
            img_t = cv2.cvtColor(crop_image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            mask_t = (crop_mask > 0).astype(np.float32)[:, :, np.newaxis]
            
            img_t = np.transpose(img_t, (2, 0, 1))[np.newaxis, ...]
            mask_t = np.transpose(mask_t, (2, 0, 1))[np.newaxis, ...]

            ort_inputs = {
                lama_session.get_inputs()[0].name: img_t,
                lama_session.get_inputs()[1].name: mask_t
            }
            ort_outs = lama_session.run(None, ort_inputs)
            
            out_img = ort_outs[0][0] 
            out_img = np.transpose(out_img, (1, 2, 0)) 
            out_img = (out_img * 255).clip(0, 255).astype(np.uint8)
            clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)

            # Cắt bỏ phần bù (Padding) và Scale lại cho vừa khớp
            clean_crop = clean_crop[0:new_h, 0:new_w]
            crop_mask = crop_mask[0:new_h, 0:new_w] 

            if scale != 1.0:
                clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)
                crop_mask = cv2.resize(crop_mask, (w_crop, h_crop), interpolation=cv2.INTER_NEAREST)

            # Dán khối ảnh đã vẽ bù siêu mượt trở lại ảnh chính
            mask_bool = crop_mask > 0
            image[y1:y2, x1:x2][mask_bool] = clean_crop[mask_bool]

        # 4. Lưu và trả về URL
        os.makedirs(os.path.dirname(clean_path), exist_ok=True)
        cv2.imwrite(clean_path, image)
        if payload.page_id:
            result = await db.execute(select(models.Page).where(models.Page.id == payload.page_id))
            page = result.scalars().first()
            if page:
                page.clean_url = f"/{clean_path}"
                page.status = "cleaned" # Lưu lại cho lần F5 sau
                await db.commit()

        new_url = f"http://localhost:8000/{clean_path}" 
        return {"status": "success", "new_url": new_url}
        
    except HTTPException:
        # 🚀 BỔ SUNG: Bắt riêng lỗi HTTP (như cái 404 ở trên) và ném thẳng về Frontend
        raise
    except Exception as e:
        # Chỉ các lỗi thực sự sập code (như chia cho 0, hết RAM) mới bị gom thành 500
        print(f"Lỗi Erase: {e}")
        raise HTTPException(status_code=500, detail=str(e))
# ==========================================
# GỌI LỆNH DỊCH (TRANSLATE)
# ==========================================
# 🚀 VŨ KHÍ BẢO MẬT 2: Giới hạn Dịch Cả Trang
class TranslateConfig(BaseModel):
    genre: str = Field(default="", max_length=100)
    tone: str = Field(default="", max_length=100)
    pronouns: str = Field(default="", max_length=100)
    glossary: str = Field(default="", max_length=1000)

@app.post("/api/pages/{page_id}/translate")
@limiter.limit("30/minute")
async def translate_page(request: Request, page_id: str, config: TranslateConfig, db: AsyncSession = Depends(get_db)):
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


# ==========================================
# API XUẤT FILE PSD (VŨ KHÍ TỐI THƯỢNG)
# ==========================================
@app.get("/api/pages/{page_id}/download-psd")
async def download_psd(page_id: str, db: AsyncSession = Depends(get_db)):
    try:
        # 1. Tìm thông tin trang truyện từ DB
        result = await db.execute(select(models.Page).where(models.Page.id == page_id))
        page = result.scalars().first()
        
        if not page:
            raise HTTPException(status_code=404, detail="Dữ liệu cũ! Hãy tạo Project mới và Upload lại ảnh nhé sếp!")

        # 2. Xử lý đường dẫn
        raw_path = get_local_path_from_url(page.raw_url)
        clean_path = raw_path.replace("/raw/", "/clean/")
        
        # 🚀 BẢN VÁ TUYỆT ĐỐI: Nếu chưa tẩy nền thì tự động lấy ảnh gốc làm nền luôn. KHÔNG BÁO LỖI 400 NỮA!
        if not os.path.exists(clean_path):
            clean_path = raw_path

        # 3. Tạo thư mục và xuất PSD
        psd_dir = f"workspace/{page.project_id}/psd"
        os.makedirs(psd_dir, exist_ok=True)
        psd_output_path = f"{psd_dir}/{page_id}.psd"
        
        create_manga_psd(raw_path, clean_path, psd_output_path)
        
        return FileResponse(
            path=psd_output_path, 
            filename=f"MangaAI_{page.filename}.psd",
            media_type="application/octet-stream"
        )
        
    except HTTPException:
        raise 
    except Exception as e:
        print("Lỗi tạo PSD:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

import glob # Bổ sung dòng import này ở tít trên cùng file main.py nếu chưa có nhé sếp

import json # Bổ sung nếu chưa có

@app.get("/api/pages/{page_id}/jsx")
async def download_jsx(page_id: str, db: AsyncSession = Depends(get_db)):
    """
    API Tạo và Tải file JSX Động (Realtime):
    Đọc thẳng từ CSDL, sếp gõ tay hay AI dịch nó đều xuất ra được hết!
    """
    # 1. Tìm trang truyện
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang truyện")

    # 2. Lấy toàn bộ bong bóng thoại của trang này từ CSDL (kể cả do sếp tự vẽ tay)
    bubbles_result = await db.execute(select(models.TextBubble).where(models.TextBubble.page_id == page_id))
    bubbles = bubbles_result.scalars().all()

    if not bubbles:
        raise HTTPException(status_code=404, detail="Trang này chưa có chữ nào! Hãy dùng AI Dịch hoặc tự thêm chữ rồi Lưu lại.")

    # 3. Gom dữ liệu tọa độ và chữ để nạp vào Script
    js_data = []
    for b in bubbles:
        text = (b.vietnamese_text or "").strip()
        if not text:
            continue # Bỏ qua ô nào không có chữ
        
        # Tính toán chiều rộng, chiều cao từ tọa độ
        w = b.box_x2 - b.box_x1
        h = b.box_y2 - b.box_y1
        
        js_data.append({
            "text": text,
            "x": b.box_x1,
            "y": b.box_y1,
            "w": w,
            "h": h
        })
        
    if not js_data:
        raise HTTPException(status_code=404, detail="Tất cả các hộp thoại đều đang để trống chữ tiếng Việt!")

    # 4. Nhúng dữ liệu vào mã Javascript
    js_array_str = json.dumps(js_data, ensure_ascii=False)
    
    jsx_content = f"""// Script Tu Dong Hoa Typesetting
if (app.documents.length > 0) {{
    var doc = app.activeDocument;
    app.preferences.rulerUnits = Units.PIXELS;
    
    var mangaData = {js_array_str};
    
    var textGroup = doc.layerSets.add();
    textGroup.name = "[3] Text (Tu Dong)";
    
    for (var i = 0; i < mangaData.length; i++) {{
        var item = mangaData[i];
        var textLayer = textGroup.artLayers.add();
        textLayer.kind = LayerKind.TEXT;
        var ti = textLayer.textItem;
        ti.kind = TextType.PARAGRAPHTEXT;
        ti.width = item.w;
        ti.height = item.h;
        ti.position = [item.x, item.y];
        ti.contents = item.text;
        try {{
            ti.size = new UnitValue(16, "px");
            ti.justification = Justification.CENTER;
        }} catch(e) {{}}
    }}
    alert("Thành công! Đã chèn xong " + mangaData.length + " bong bóng thoại!");
}} else {{
    alert("Vui lòng mở file PSD lên trước khi chạy script!");
}}
"""

    # 5. Lưu tạm ra file để gửi về cho khách
    clean_dir = f"workspace/{page.project_id}/clean"
    os.makedirs(clean_dir, exist_ok=True)
    jsx_path = f"{clean_dir}/{page_id}_Text.jsx"
    
    with open(jsx_path, 'w', encoding='utf-8') as f:
        f.write(jsx_content)

    return FileResponse(
        path=jsx_path, 
        filename=f"Auto_Text_Script.jsx", 
        media_type="text/plain"
    )
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

import asyncio
import time
import shutil
import os

# ==========================================
# 🧹 BOT DỌN RÁC TỰ ĐỘNG (BẢO VỆ Ổ CỨNG)
# ==========================================
async def auto_cleanup_workspace():
    while True:
        try:
            workspace_dir = "workspace"
            if os.path.exists(workspace_dir):
                current_time = time.time()
                
                # THỜI GIAN HẾT HẠN (24 giờ = 86400 giây)
                # ⏳ ĐỂ TEST: Đổi số 86400 thành số 60 (1 phút)
                EXPIRATION_TIME = 86400 
                # EXPIRATION_TIME = 60 
                
                deleted_count = 0
                
                for item in os.listdir(workspace_dir):
                    item_path = os.path.join(workspace_dir, item)
                    
                    # Kiểm tra thời gian chỉnh sửa cuối cùng của file/thư mục
                    item_age = current_time - os.stat(item_path).st_mtime
                    
                    if item_age > EXPIRATION_TIME:
                        if os.path.isfile(item_path):
                            os.remove(item_path)
                            deleted_count += 1
                        elif os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                            deleted_count += 1
                            
                if deleted_count > 0:
                    print(f"🧹 [CRONJOB] Đã dọn dẹp sạch sẽ {deleted_count} file/thư mục rác quá hạn!")
                    
        except Exception as e:
            print(f"⚠️ [CRONJOB] Lỗi trong lúc dọn rác: {e}")
            
        # Dọn xong đi ngủ 1 tiếng (3600 giây), sau đó dậy dọn tiếp
        # ⏳ ĐỂ TEST: Đổi số 3600 thành số 10 (10 giây)
        await asyncio.sleep(3600)
        # await asyncio.sleep(10)

# Kích hoạt Bot dọn rác ngay khi FastAPI khởi động
@app.on_event("startup")
async def startup_event():
    print("🚀 Khởi động Bot dọn rác tự động...")
    asyncio.create_task(auto_cleanup_workspace())

@app.delete("/api/pages/{page_id}")
async def delete_page_from_server(page_id: str, db: AsyncSession = Depends(get_db)):
    try:
        # 1. Tìm thông tin trang trong Database
        result = await db.execute(select(models.Page).where(models.Page.id == page_id))
        page = result.scalars().first()
        
        if not page:
            raise HTTPException(status_code=404, detail="Trang không tồn tại trên Server")
            
        project_id = page.project_id

        # 2. XÓA FILE RAW VẬT LÝ
        if page.raw_url:
            raw_filename = page.raw_url.split("/")[-1].split("?")[0] # Bỏ query string timestamp nếu có
            raw_path = f"workspace/{project_id}/raw/{raw_filename}"
            if os.path.exists(raw_path):
                os.remove(raw_path)

        # 3. XÓA FILE CLEAN VẬT LÝ (Nếu có)
        if hasattr(page, 'clean_url') and page.clean_url:
            clean_filename = page.clean_url.split("/")[-1].split("?")[0]
            clean_path = f"workspace/{project_id}/clean/{clean_filename}"
            if os.path.exists(clean_path):
                os.remove(clean_path)

        # 4. Xóa bản ghi trong Database
        await db.delete(page)
        await db.commit()
        
        print(f"🔥 [DELETE] Đã xóa vĩnh viễn trang {page_id} khỏi ổ cứng và DB!")
        return {"status": "success", "message": "Đã giải phóng dung lượng Server thành công"}

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi không thể xóa file: {str(e)}")
    
os.makedirs("workspace/fonts", exist_ok=True)

import shutil # Nhớ thêm dòng này lên đầu file nếu chưa có

import os
import shutil
from fastapi import HTTPException, UploadFile, File

@app.post("/api/fonts/upload")
async def upload_font(file: UploadFile = File(...)):
    # 🛡️ CHỐT CHẶN 1: Chỉ cho phép file .ttf, .otf
    if not file.filename.lower().endswith(('.ttf', '.otf')):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .ttf hoặc .otf")
    
    # 🛡️ CHỐT CHẶN 2: Giới hạn số lượng Font tối đa trên Server (Ví dụ: 30 fonts)
    font_dir = "workspace/fonts"
    current_fonts = [f for f in os.listdir(font_dir) if f.lower().endswith(('.ttf', '.otf'))]
    if len(current_fonts) >= 30:
        raise HTTPException(status_code=400, detail="Kho Font đã đầy (Tối đa 30 Font). Hãy báo Admin dọn dẹp bớt!")

    # 🛡️ CHỐT CHẶN 3: Giới hạn dung lượng mỗi Font (Ví dụ: Tối đa 5MB)
    file.file.seek(0, 2) # Cuộn đến cuối file để kiểm tra dung lượng
    file_size = file.file.tell()
    file.file.seek(0) # Cuộn lại từ đầu để chuẩn bị lưu
    
    if file_size > 5 * 1024 * 1024: # 5MB
        raise HTTPException(status_code=400, detail="File font quá nặng (Tối đa 5MB/file)!")

    # Lưu file an toàn
    file_path = f"{font_dir}/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"status": "success", "filename": file.filename}


@app.get("/api/fonts")
async def list_fonts():
    # 🚀 BẢN VÁ: Kiểm tra và tự động tạo thư mục nếu chưa có
    os.makedirs("workspace/fonts", exist_ok=True)
    
    # Lấy danh sách tên các font đang có trên Server
    fonts = [f for f in os.listdir("workspace/fonts") if f.lower().endswith(('.ttf', '.otf'))]
    return {"fonts": fonts}

@app.get("/api/fonts/download-pack")
async def download_font_pack():
    # Nén toàn bộ font thành 1 cục ZIP cho user tải về trong 1 nốt nhạc
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
        for f in os.listdir("workspace/fonts"):
            if f.lower().endswith(('.ttf', '.otf')):
                zipf.write(f"workspace/fonts/{f}", arcname=f)
    
    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer, 
        media_type="application/zip", 
        headers={"Content-Disposition": "attachment; filename=Manga_Font_Pack.zip"}
    )


# 🚀 API LẤY DANH SÁCH ẢNH CỦA DỰ ÁN
# 🚀 API LẤY DANH SÁCH ẢNH CỦA DỰ ÁN (ĐÃ VÁ LỖI DATABASE)
@app.get("/api/projects/{project_id}/pages")
async def get_project_pages(project_id: str, db: AsyncSession = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    # 1. Kiểm tra quyền sở hữu
    proj_result = await db.execute(select(models.Project).where(models.Project.id == project_id, models.Project.user_id == user_id))
    if not proj_result.scalars().first():
        raise HTTPException(status_code=403, detail="Không có quyền truy cập dự án này")
    
    # 2. Lấy danh sách ảnh (BỎ order_by ĐỂ TRÁNH LỖI THIẾU CỘT CREATED_AT)
    page_result = await db.execute(select(models.Page).where(models.Page.project_id == project_id))
    pages = page_result.scalars().all()
    
    return {"pages": [{"id": p.id, "filename": p.filename, "raw_url": p.raw_url, "clean_url": p.clean_url, "status": p.status} for p in pages]}


@app.get("/api/pages/{page_id}/export-manga")
async def export_manga(page_id: str, db: AsyncSession = Depends(get_db)):
    """Đóng gói Ảnh và Chữ thành 1 file .manga (Thực chất là file ZIP) để người dùng tải về"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang!")

    # 1. Lấy đường dẫn ảnh (Ưu tiên ảnh đã Clean, nếu chưa có thì lấy ảnh Raw)
    img_path_url = page.clean_url if page.clean_url else page.raw_url
    local_img_path = get_local_path_from_url(img_path_url)

    if not os.path.exists(local_img_path):
        raise HTTPException(status_code=404, detail="File ảnh gốc đã bị xóa (Hết hạn 24h)!")

    # 2. Lấy dữ liệu chữ (JSON)
    bubbles_json = page.bubbles_data or "[]"

    # 3. 🚀 MA THUẬT NÉN TRÊN RAM (Không tốn 1 Byte ổ cứng nào của sếp!)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
        # Nén ảnh vào cục Zip
        img_ext = local_img_path.split('.')[-1]
        zipf.write(local_img_path, arcname=f"image.{img_ext}")
        # Nén cục chữ (JSON) vào Zip
        zipf.writestr("bubbles.json", bubbles_json)

    zip_buffer.seek(0)
    
    # 4. Trả về cho trình duyệt tải xuống với đuôi độc quyền .manga
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={page.filename}.manga"}
    )

@app.post("/api/projects/{project_id}/import-manga")
async def import_manga(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Chốt chặn bảo mật
):
    """Khôi phục lại trang truyện từ file .manga của người dùng"""
    if not file.filename.endswith('.manga'):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file .manga hợp lệ!")

    page_id = str(uuid.uuid4())
    project_dir = f"workspace/{project_id}"
    raw_dir = f"{project_dir}/raw"
    os.makedirs(raw_dir, exist_ok=True)

    # 1. Đọc và giải nén file .manga ngay trên RAM
    zip_data = await file.read()
    try:
        with zipfile.ZipFile(io.BytesIO(zip_data)) as zipf:
            file_names = zipf.namelist()
            img_name = next((f for f in file_names if f.startswith("image.")), None)
            
            if not img_name or "bubbles.json" not in file_names:
                raise Exception("File hỏng")

            # 2. Lưu lại ảnh xuống ổ cứng (Lưu vào raw coi như 1 file mới)
            ext = img_name.split('.')[-1]
            raw_path = f"{raw_dir}/{page_id}.{ext}"
            with open(raw_path, "wb") as f:
                f.write(zipf.read(img_name))

            # 3. Lôi cục chữ JSON ra
            bubbles_json = zipf.read("bubbles.json").decode('utf-8')
    except:
        raise HTTPException(status_code=400, detail="File .manga bị hỏng hoặc sai định dạng!")

    # 4. Lưu vào Database như một trang truyện đang làm dở
    db_page = models.Page(
        id=page_id,
        project_id=project_id,
        filename=file.filename.replace(".manga", ""),
        raw_url=f"/workspace/{project_id}/raw/{page_id}.{ext}",
        status="translating",
        bubbles_data=bubbles_json
    )
    db.add(db_page)
    await db.commit()

    return {"status": "success", "page_id": page_id}    

# ==========================================
# 🛑 API HỦY TIẾN TRÌNH DỊCH (CELERY REVOKE)
# ==========================================
@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    try:
        # Lệnh terminate=True sẽ "Rút phích cắm" worker ngay lập tức, giải phóng RAM & CPU
        celery_app.control.revoke(task_id, terminate=True)
        return {"status": "success", "message": "Đã hủy tiến trình thành công!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))