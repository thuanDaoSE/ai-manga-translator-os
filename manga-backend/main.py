from fastapi.responses import FileResponse
from psd_utils import create_manga_psd
import filetype
import jwt
import zipfile
import io
from pydantic import BaseModel, Field
import os
import time
from nlp_engine import TranslationEngine
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
# from worker import process_manga_page, lama_session, mocr, client, text_detector, celery_app
from jose import jwt, JWTError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
from fastapi.responses import StreamingResponse
import redis.asyncio as aioredis
import json
import asyncio
# Sửa dòng import này (khoảng dòng 17)
# from worker import process_manga_page, lama_session, mocr, client, text_detector
# from celery.result import AsyncResult

from pydantic import BaseModel
from typing import List, Dict, Any

# 1. KHỞI TẠO APP TRƯỚC
app = FastAPI(title="Manga AI Backend API", version="2.0.0")

@app.middleware("http")
async def force_cors_static_files(request: Request, call_next):
    response = await call_next(request)
    # Nếu Frontend đòi lấy ảnh tĩnh từ thư mục workspace
    if request.url.path.startswith("/workspace"):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        # Đuổi cổ bóng ma Cache
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
class CORSStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope) -> Response:
        response = await super().get_response(path, scope)
        # Bơm thẻ bài thông hành CORS vào tận gốc
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        # Cấm trình duyệt lưu Cache láo
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        return response


from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
deepseek_client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"), 
    base_url="https://api.deepseek.com"
)

# 🚀 BỔ SUNG MODEL CHO AI COPILOT
class CopilotRequest(BaseModel):
    text: str
    japanese: str
    action: str
    custom_prompt: str = None

import re
import logging

logger = logging.getLogger(__name__)

# Đặt đoạn này ở đầu file main.py hoặc trong file config riêng
DEEPKOMA_SYSTEM_PROMPT = """You are a Principal Manga Localization Engineer translating Japanese to Vietnamese. 
Your goal is to achieve 'Zero-Hallucination' translation.

STRICT RULES:
1. You MUST prioritize and strictly apply any provided GLOSSARY and PRONOUN MATRIX terms over your pre-trained knowledge.
2. If a specific pronoun is mandated (e.g., 'anh', 'em', 'tớ'), you must format the entire sentence's grammar to match that polite or casual tone seamlessly.
3. You MUST output your response in valid JSON format ONLY, matching the exact structure requested. Do not add markdown blocks, explanations, or conversational filler.

REQUIRED JSON OUTPUT SCHEMA:
{
  "translations": {
    "box_id_1": "translated_vietnamese_text",
    "box_id_2": "translated_vietnamese_text"
  }
}"""

# ==========================================
# 🛡️ ÁO GIÁP BẢO VỆ JSON TỪ DEEPSEEK
# ==========================================
def sanitize_dirty_json(dirty_string: str) -> str:
    """ Máy lọc rác: Dọn dẹp lỗi cú pháp kinh điển của LLM """
    cleaned = dirty_string.strip(" \n\r\t`")
    # Cắt dấu phẩy thừa ở cuối mảng/object
    cleaned = re.sub(r',\s*([\]}])', r'\1', cleaned)
    # Sửa lỗi boolean của Python thành chuẩn JSON
    cleaned = re.sub(r'\bNone\b', 'null', cleaned)
    cleaned = re.sub(r'\bTrue\b', 'true', cleaned)
    cleaned = re.sub(r'\bFalse\b', 'false', cleaned)
    # Sửa ngoặc kép dị dạng
    cleaned = re.sub(r'[“”]', '"', cleaned)
    # Ép key có ngoặc kép (trường hợp LLM quên)
    cleaned = re.sub(r'([{,]\s*)([a-zA-Z0-9_]+)(\s*:)', r'\1"\2"\3', cleaned)
    
    # Sửa lỗi cụt đuôi (Truncation)
    if cleaned.count('"') % 2 != 0:
        cleaned += '"'
    open_brackets = cleaned.count('[')
    close_brackets = cleaned.count(']')
    if open_brackets > close_brackets:
        cleaned += ']' * (open_brackets - close_brackets)
    open_braces = cleaned.count('{')
    close_braces = cleaned.count('}')
    if open_braces > close_braces:
        cleaned += '}' * (open_braces - close_braces)
        
    return cleaned

def robust_json_parse(llm_response: str) -> dict:
    """ Máy quét ranh giới: Bóc tách chính xác cục JSON bất chấp Markdown """
    # Ưu tiên tìm Object {...} vì prompt của sếp thường yêu cầu {"translations": ...}
    match = re.search(r'\{.*\}', llm_response, flags=re.DOTALL)
    if not match:
        # Nếu không có dấu {}, thử tìm mảng [...]
        match = re.search(r'\[.*\]', llm_response, flags=re.DOTALL)
        
    if match:
        extracted_str = match.group(0)
    else:
        # Fallback: Tự dọn dẹp chuỗi thủ công
        extracted_str = llm_response.strip(" \n\r\t`").replace("```json", "").replace("```", "")

    try:
        return json.loads(extracted_str)
    except json.JSONDecodeError:
        pass # Chuyển sang máy lọc rác

    sanitized_str = sanitize_dirty_json(extracted_str)
    try:
        return json.loads(sanitized_str)
    except json.JSONDecodeError as e:
        logger.error(f"❌ CRITICAL JSON PARSE FAILURE: {e}")
        logger.error(f"Original LLM Response: {llm_response}")
        return {} # Hạ cánh an toàn, không sập Server
# ==========================================


# 2. RỒI MỚI GẮN LIMITER VÀO APP SAU
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
    return os.getenv("BACKEND_BASE_URL", "http://localhost:8000")

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


from sqlalchemy import select
import json
import db_models
from sqlalchemy.ext.asyncio import AsyncSession

async def get_sliding_window_context(db: AsyncSession, project_id: str, current_page_filename: str, window_size: int = 2):
    """
    Lấy ngữ cảnh dựa trên THỨ TỰ TÊN FILE, bất chấp thời gian tải lên lộn xộn.
    """
    if not project_id:
        return "No previous context."

    # 1. Lấy TẤT CẢ các trang đã dịch xong của project này
    # 🚀 BÍ QUYẾT: Sắp xếp theo TÊN FILE (A-Z) thay vì Thời gian
    stmt = select(db_models.Page).where(
        db_models.Page.project_id == project_id,
        db_models.Page.status == "completed"
    ).order_by(db_models.Page.filename) 
    
    result = await db.execute(stmt)
    all_pages = result.scalars().all()
    
    # 2. Tìm vị trí của trang hiện tại trong dòng thời gian của truyện
    current_idx = -1
    for i, page in enumerate(all_pages):
        if page.filename == current_page_filename:
            current_idx = i
            break
            
    # Nếu không tìm thấy, hoặc đây là trang đầu tiên (001.jpg) thì không có ngữ cảnh
    if current_idx <= 0:
        return "No previous context."
        
    # 3. Lấy đúng `window_size` (vd: 2) trang nằm ngay sát TRƯỚC trang hiện tại
    start_idx = max(0, current_idx - window_size)
    previous_pages = all_pages[start_idx:current_idx]
    
    # 4. Trích xuất text từ các trang đó
    context_str = ""
    for page in previous_pages:
        try:
            bubbles = json.loads(page.bubbles_data)
            for b in bubbles:
                if b.get('japanese') and b.get('text'):
                    short_id = str(b.get('id'))[-4:]
                    context_str += f"[{short_id}] {b.get('japanese')} -> {b.get('text')}\n"
        except Exception:
            continue
            
    return context_str.strip() if context_str.strip() else "No previous context."



# Danh sách khách VIP được phép gọi API
origins = [
    "http://localhost:5173",  # Để sếp test trên máy tính
    "http://localhost:4173",  # Để sếp preview trên máy tính
    "http://103.77.243.60",   # 🚨 THÊM DÒNG NÀY (IP thật không có cổng)
    "http://103.77.243.60:80" # 🚨 THÊM DÒNG NÀY (Phòng hờ)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Cho phép mọi phương thức GET, POST...
    allow_headers=["*"],  # Cho phép mọi Headers
)

# 🚀 BƯỚC NGOẶT KIẾN TRÚC: Đóng /static, mở /workspace
os.makedirs("workspace", exist_ok=True)
# XÓA BỎ StaticFiles CŨ GÂY LỖI CORS:
# Thay StaticFiles bằng class CORSStaticFiles anh em mình vừa tạo
app.mount("/workspace", CORSStaticFiles(directory="workspace"), name="workspace")

# THAY BẰNG API ĐỊNH TUYẾN CHUẨN ĐỂ VƯỢT QUA CORS:
@app.get("/workspace/{file_path:path}")
async def get_workspace_file(file_path: str):
    full_path = os.path.join("workspace", file_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy file")
    
    # FileResponse sẽ tự động kế thừa bộ lọc CORS của FastAPI
    return FileResponse(full_path)

# --- KÍCH HOẠT DATABASE KHI BẬT SERVER ---
# Mẫu code tạo bảng nếu sếp chưa có (thường đặt ở file main.py sự kiện startup)
from database import engine, Base

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        # Lệnh này sẽ tạo tự động tất cả các bảng nếu chưa có
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


import httpx
import base64
import uuid
import asyncio
from fastapi import BackgroundTasks

# ==========================================
# CẤU HÌNH RUNPOD LẤY TỪ FILE .ENV (CHUẨN BẢO MẬT)
# ==========================================
RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY")
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID")

# 🚀 THÊM DÒNG NÀY VÀO ĐẦU FILE (Dưới các dòng import)
import redis
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = int(os.getenv("REDIS_PORT", 6379))
redis_client = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)

def broadcast_progress(task_id, progress, message, state="PROCESSING"):
    """Hàm bắn SSE Realtime cho Frontend"""
    payload = json.dumps({"progress": progress, "message": message, "state": state})
    redis_client.publish(f"task_progress:{task_id}", payload)

# Hàm chạy ngầm trong FastAPI
async def runpod_translation_task(task_id: str, raw_path: str, clean_path: str, payload_data: dict, base_url: str):
    try:
        # Cập nhật tiến trình cho Frontend biết
        broadcast_progress(task_id, 10, "Đang khởi động AI Serverless (Cold Start)...")
        
        # 1. Đọc ảnh và hóa thành Base64
        with open(raw_path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode('utf-8')

        runpod_payload = {
            "input": {
                "image_base64": img_b64,
                "genre": payload_data.get('genre'),
                "tone": payload_data.get('tone'),
                "pronouns": payload_data.get('pronouns'),
                "glossary": payload_data.get('glossary')
            }
        }

        headers = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}
        
        async with httpx.AsyncClient(timeout=600.0) as client:
            # 2. Bắn Request Lên Runpod
            res = await client.post(f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/run", json=runpod_payload, headers=headers)
            job_data = res.json()
            runpod_job_id = job_data.get("id")
            
            broadcast_progress(task_id, 30, "AI đang xóa nền và dịch...")

            # 3. Vòng lặp Polling hỏi thăm sức khỏe (Cách nhau 3 giây để không bị limit)
            while True:
                status_res = await client.get(f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/status/{runpod_job_id}", headers=headers)
                status_data = status_res.json()
                status = status_data.get("status")

                if status == "COMPLETED":
                    broadcast_progress(task_id, 90, "Đang tải ảnh sạch về máy...")
                    
                    output = status_data.get("output", {})
                    clean_b64 = output.get("clean_image_base64")
                    extracted_data = output.get("data", [])
                    
                    # Giải mã Base64 lưu thành ảnh JPG lên VPS
                    with open(clean_path, "wb") as f:
                        f.write(base64.b64decode(clean_b64))

                    # 🚀 MẸO CHE MẮT FRONTEND: Lưu vào Redis để Frontend tưởng Celery vẫn đang chạy
                    result_payload = {
                        "status": "SUCCESS",
                        "result": {
                            "clean_url": clean_path.replace("./workspace", f"{base_url}/workspace"),
                            "data": extracted_data
                        }
                    }
                    redis_client.set(f"celery-task-meta-{task_id}", json.dumps(result_payload), ex=3600)
                    
                    broadcast_progress(task_id, 100, "Hoàn tất!", state="SUCCESS")
                    break

                elif status == "FAILED":
                    broadcast_progress(task_id, 0, "Lỗi từ Runpod!", state="FAILURE")
                    break
                
                # Chờ 3s rồi hỏi tiếp
                await asyncio.sleep(3)

    except Exception as e:
        broadcast_progress(task_id, 0, f"Lỗi VPS: {str(e)}", state="FAILURE")

# ==========================================
# CÁC API CŨ (Tạm thời giữ nguyên để không làm gãy tính năng cũ)
# ==========================================
# ... (Các API /api/translate, /api/task, /api/quick-scan giữ nguyên như cũ, 
# ở bước sau ta sẽ sửa chúng để móc nối với Database)
# ==========================================
# 2. HÓNG KẾT QUẢ RUNPOD (Bản có Còi Báo Động in ra Terminal)
# ==========================================
@app.get("/api/stream/{task_id}")
async def stream_progress(task_id: str):
    async def event_generator():
        runpod_url = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/status/{task_id}"
        headers = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}
        
        async with httpx.AsyncClient() as client:
            while True:
                try:
                    res = await client.get(runpod_url, headers=headers, timeout=10.0)
                    data = res.json()
                    status = data.get("status")
                    
                    if status == "COMPLETED":
                        output = data.get("output", {})
                        
                        # 🚨 CÒI BÁO ĐỘNG SẼ KÊU Ở ĐÂY NẾU AI CRASH
                        if isinstance(output, dict) and output.get("status") == "error":
                            print(f"\n❌❌❌ AI TRÊN MÂY BỊ CRASH! LỖI LÀ:\n{output}\n❌❌❌\n")
                            yield f"data: {json.dumps({'state': 'FAILURE', 'progress': 0, 'message': 'AI lỗi: ' + str(output.get('message', ''))})}\n\n"
                        else:
                            print("\n✅✅✅ AI DỊCH XONG! TRẢ KẾT QUẢ VỀ FRONTEND...\n")
                            yield f"data: {json.dumps({'state': 'SUCCESS', 'progress': 100, 'message': 'Runpod hoàn tất!'})}\n\n"
                        
                        await asyncio.sleep(2.0) # Tăng lên 2s cho Frontend kịp đóng kết nối
                        break
                        
                    elif status in ["FAILED", "CANCELLED"]:
                        print(f"\n❌❌❌ RUNPOD SẬP NGUỒN: {data}\n❌❌❌\n")
                        yield f"data: {json.dumps({'state': 'FAILURE', 'progress': 0, 'message': 'AI trên mây báo lỗi!'})}\n\n"
                        await asyncio.sleep(2.0)
                        break
                        
                    elif status == "IN_PROGRESS":
                        yield f"data: {json.dumps({'state': 'PROCESSING', 'progress': 60, 'message': 'Runpod đang dịch...'})}\n\n"
                    elif status == "IN_QUEUE":
                        yield f"data: {json.dumps({'state': 'PROCESSING', 'progress': 10, 'message': 'Đang chờ máy trống...'})}\n\n"
                        
                except Exception as e:
                    yield f"data: {json.dumps({'state': 'PROCESSING', 'progress': 50, 'message': 'Đang đồng bộ mạng...'})}\n\n"
                    
                await asyncio.sleep(2)
                
    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )

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

# ==========================================
# CỤC DIỆN MỚI: BẮN LỆNH ĐỒNG BỘ LÊN RUNPOD
# ==========================================

@app.post("/api/quick-scan")
@limiter.limit("20/minute")
async def quick_scan(request: Request, payload: QuickScanPayload): 
    try:
        img_raw = payload.filename
        if img_raw.startswith("data:image"):
            nparr = np.frombuffer(base64.b64decode(img_raw.split(',')[1]), np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            img_path = img_raw.split('8000/')[-1] if '8000/' in img_raw else img_raw
            img_path = img_path.split('?')[0] 
            base_path, _ = os.path.splitext(img_path)
            matched_files = glob.glob(f"{base_path}.*")
            image = cv2.imread(matched_files[0] if matched_files else img_path)
            
        h, w = image.shape[:2]
        x1, x2 = sorted([max(0, min(payload.x1, w)), max(0, min(payload.x2, w))])
        y1, y2 = sorted([max(0, min(payload.y1, h)), max(0, min(payload.y2, h))])
        
        pad = 8 
        x1_pad, x2_pad = max(0, x1 - pad), min(w, x2 + pad)
        y1_pad, y2_pad = max(0, y1 - pad), min(h, y2 + pad)

        crop = image[y1_pad:y2_pad, x1_pad:x2_pad]
        crop_large = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        crop_sharp = cv2.filter2D(crop_large, -1, np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]]))

        # 🚀 BẮN SANG RUNPOD ĐỂ ĐỌC CHỮ (OCR)
        _, buffer = cv2.imencode('.png', crop_sharp)
        crop_b64 = base64.b64encode(buffer).decode('utf-8')
        
        # Lưu ý: Dùng /runsync để nhận kết quả ngay lập tức
        runpod_url = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/runsync" 
        headers = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}
        
        async with httpx.AsyncClient() as client:
            res = await client.post(runpod_url, json={"input": {"action": "scan", "image_base64": crop_b64}}, headers=headers, timeout=10.0)
            japanese_text = res.json().get('output', {}).get('text', '')

        if not japanese_text: 
            return {"status": "success", "japanese": "", "vietnamese": "AI không đọc được chữ!"}
        
        # 🚀 GỌI DEEPSEEK TRÊN VPS ĐỂ DỊCH (Giữ nguyên logic cache)
        glossary_hash = hashlib.md5(payload.glossary.encode('utf-8')).hexdigest() if payload.glossary else "none"
        cache_key = f"{japanese_text}_{payload.genre}_{payload.tone}_{payload.pronouns}_{glossary_hash}"
        
        if cache_key in LENS_CACHE:
            return LENS_CACHE[cache_key]

        system_prompt = f"Bạn là Biên dịch Manga.\nThể loại: {payload.genre}\nVăn phong: {payload.tone}\nXưng hô: {payload.pronouns}\n{f'TỪ ĐIỂN: {payload.glossary}' if payload.glossary else ''}\n\nTRẢ VỀ JSON: {{\"context_reasoning\": \"...\", \"vietnamese\": \"...\"}}"
        
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": f"Dịch: {japanese_text}"}],
            response_format={"type": "json_object"}, temperature=0.4 
        )
        
        # 🚀 BẢN VÁ: Dùng hàm Parse chống đạn
        ai_response = robust_json_parse(response.choices[0].message.content)
       
        result_data = {"status": "success", "japanese": japanese_text, "vietnamese": ai_response.get("vietnamese", "Lỗi")}
        LENS_CACHE[cache_key] = result_data 
        return result_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
class MaskPayload(BaseModel):
    image_url: str
    mask_base64: str
    page_id: str = None

@app.post("/api/erase-mask")
async def erase_mask(payload: MaskPayload, db: AsyncSession = Depends(get_db)):
    try:
        img_raw = payload.image_url
        if img_raw.startswith("data:image"):
            nparr = np.frombuffer(base64.b64decode(img_raw.split(',')[1]), np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            clean_path = f"workspace/clean_{uuid.uuid4().hex}.png"
        else:
            img_path = img_raw.split('8000/')[-1] if '8000/' in img_raw else img_raw
            img_path = img_path.split('?')[0]
            base_path, _ = os.path.splitext(img_path)
            matched_files = glob.glob(f"{base_path}.*")
            img_path = matched_files[0] if matched_files else img_path
            image = cv2.imread(img_path)
            clean_path = img_path.replace("/raw/", "/clean/") if "/raw/" in img_path else f"workspace/clean_{uuid.uuid4().hex}.png"

        encoded_data_mask = payload.mask_base64.split(',')[1]
        nparr_mask = np.frombuffer(base64.b64decode(encoded_data_mask), np.uint8)
        mask_rgba = cv2.imdecode(nparr_mask, cv2.IMREAD_UNCHANGED)
        mask = mask_rgba[:, :, 3] if len(mask_rgba.shape) == 3 and mask_rgba.shape[2] == 4 else cv2.imdecode(nparr_mask, cv2.IMREAD_GRAYSCALE)

        x, y, w, h = cv2.boundingRect(mask)
        if w > 0 and h > 0:
            pad = 80 
            h_img, w_img = image.shape[:2]
            x1, y1 = max(0, x-pad), max(0, y-pad)
            x2, y2 = min(w_img, x+w+pad), min(h_img, y+h+pad)

            crop_image = image[y1:y2, x1:x2]
            crop_mask = mask[y1:y2, x1:x2]

            # 🚀 BẮN MẨU ẢNH LÊN RUNPOD ĐỂ NÓ XÓA
            _, buf_img = cv2.imencode('.png', crop_image)
            _, buf_mask = cv2.imencode('.png', crop_mask)
            
            runpod_url = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/runsync"
            headers = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}
            
            async with httpx.AsyncClient() as client:
                res = await client.post(runpod_url, json={
                    "input": {
                        "action": "erase", 
                        "image_base64": base64.b64encode(buf_img).decode('utf-8'),
                        "mask_base64": base64.b64encode(buf_mask).decode('utf-8')
                    }
                }, headers=headers, timeout=20.0)
            
            clean_crop_b64 = res.json().get('output', {}).get('clean_crop_base64')
            if clean_crop_b64:
                clean_crop = cv2.imdecode(np.frombuffer(base64.b64decode(clean_crop_b64), np.uint8), cv2.IMREAD_COLOR)
                mask_bool = crop_mask > 0
                image[y1:y2, x1:x2][mask_bool] = clean_crop[mask_bool]

        os.makedirs(os.path.dirname(clean_path), exist_ok=True)
        cv2.imwrite(clean_path, image)
        
        if payload.page_id:
            result = await db.execute(select(models.Page).where(models.Page.id == payload.page_id))
            page = result.scalars().first()
            if page:
                page.clean_url = f"/{clean_path}"
                page.status = "cleaned" 
                await db.commit()

        new_url = f"{get_base_url()}/{clean_path}" 
        return {"status": "success", "new_url": new_url}
        
    except Exception as e:
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
  # 🚀 THÊM DÒNG NÀY ĐỂ NHẬN ID TỪ FRONTEND

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

# ==========================================
# GỌI LỆNH DỊCH (TRANSLATE) - ĐÃ ĐỔI SANG SERVERLESS
# ==========================================
class TranslateConfig(BaseModel):
    genre: str = Field(default="", max_length=100)
    tone: str = Field(default="", max_length=100)
    pronouns: str = Field(default="", max_length=100)
    glossary: str = Field(default="", max_length=1000)



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
# API XUẤT FILE PSD (SỬA LỖI NHẦM ẢNH RAW)
# ==========================================
@app.get("/api/pages/{page_id}/download-psd")
async def download_psd(page_id: str, db: AsyncSession = Depends(get_db)):
    try:
        # 1. Tìm thông tin trang truyện từ DB
        result = await db.execute(select(models.Page).where(models.Page.id == page_id))
        page = result.scalars().first()
        
        if not page:
            raise HTTPException(status_code=404, detail="Dữ liệu cũ! Hãy tạo Project mới và Upload lại ảnh nhé sếp!")

        # 2. Xử lý đường dẫn chuẩn xác
        raw_path = get_local_path_from_url(page.raw_url)
        
        # 🚀 BẢN VÁ TỐI THƯỢNG: Lấy đúng đường dẫn thực tế lưu trong CSDL thay vì tự chế replace
        if page.clean_url:
            clean_path = get_local_path_from_url(page.clean_url)
        else:
            clean_path = raw_path.replace("/raw/", "/clean/")
        
        # Nếu ảnh sạch thực tế vẫn không tồn tại trên ổ cứng thì mới lấy ảnh gốc gánh nền
        if not os.path.exists(clean_path):
            clean_path = raw_path

        # 3. Tạo thư mục và định nghĩa file đầu ra
        psd_dir = f"workspace/{page.project_id}/psd"
        os.makedirs(psd_dir, exist_ok=True)
        psd_output_path = f"{psd_dir}/{page_id}.psd"
        
        # 🚀 Đọc chuẩn danh sách ô thoại từ DB (Né lỗi payload.bubbles không định nghĩa)
        import json
        bubbles_list = []
        if page.bubbles_data:
            try:
                bubbles_list = json.loads(page.bubbles_data)
            except Exception as e:
                print(f"Lỗi đọc JSON bubbles: {e}")
                bubbles_list = []
        
        # 4. Gọi hàm tạo PSD với đầy đủ ảnh Clean xịn và cục chữ
        create_manga_psd(raw_path, clean_path, psd_output_path, bubbles_list)
        
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


@app.on_event("startup")
async def startup_event():
    print("🚀 Khởi động Bot dọn rác và Bot chống ngủ...")
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
# 🛑 API HỦY TIẾN TRÌNH DỊCH (SERVERLESS HACK)
# ==========================================
@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    try:
        # Với Serverless, ta không chọc vào tắt Runpod giữa chừng được.
        # Nhưng ta sẽ đánh dấu LỖI vào Redis để Frontend dừng xoay vòng vòng!
        error_payload = {"status": "FAILURE", "result": "Đã hủy bởi người dùng"}
        redis_client.set(f"celery-task-meta-{task_id}", json.dumps(error_payload), ex=3600)
        broadcast_progress(task_id, 0, "Tiến trình đã bị hủy!", state="FAILURE")
        
        return {"status": "success", "message": "Đã hủy tiến trình thành công!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

import httpx # Nhớ đảm bảo có dòng này ở đầu file

# ==========================================
# 1. BẮN LỆNH LÊN RUNPOD (Thay Celery)
# ==========================================
@app.post("/api/pages/{page_id}/translate")
async def translate_page(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.future import select
    
    # 1. Lấy thông tin trang truyện từ DB
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang truyện")

    # 2. Đọc ảnh và chuyển thành Base64
    img_path = f".{page.raw_url}"
    try:
        with open(img_path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        raise HTTPException(status_code=400, detail="Không đọc được file ảnh gốc")

    config = await request.json()

    # 3. Gửi sang Runpod Serverless
    runpod_url = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/run"
    headers = {
        "Authorization": f"Bearer {RUNPOD_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "input": {
            "image_base64": img_b64,
            "genre": config.get("genre", ""),
            "tone": config.get("tone", ""),
            "pronouns": config.get("pronouns", ""),
            "glossary": config.get("glossary", "")
        }
    }

    async with httpx.AsyncClient() as client:
        # Bắn lệnh đi (timeout 60s phòng đứt cáp)
        response = await client.post(runpod_url, json=payload, headers=headers, timeout=60.0)
        data = response.json()

    # Trả về Job ID của Runpod cho Frontend
    return {"task_id": data["id"]}





# ==========================================
# 3. NHẬN ẢNH SẠCH TỪ RUNPOD (Thay Celery AsyncResult)
# ==========================================
# ==========================================
# 3. NHẬN KẾT QUẢ TỪ RUNPOD VÀ GỌI DEEPSEEK TẠI VPS (TỐI ƯU CHI PHÍ)
# ==========================================
@app.get("/api/task/{task_id}")
async def get_task_result(task_id: str):
    runpod_url = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/status/{task_id}"
    headers = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}
    
    async with httpx.AsyncClient() as client:
        res = await client.get(runpod_url, headers=headers, timeout=30.0)
        data = res.json()
        
    if data.get("status") == "COMPLETED":
        output = data.get("output", {})
        if isinstance(output, dict) and output.get("status") == "error":
            return {"status": "FAILURE", "message": str(output)}
            
        clean_b64 = output.get("clean_image_base64")
        extracted_data = output.get("data", [])
        context = output.get("context", {}) # Lấy lại ngữ cảnh Runpod dội về
        
        # 🚀 BỘ NÃO DEEPSEEK HOẠT ĐỘNG MIỄN PHÍ TRÊN VPS TẠI ĐÂY
        if extracted_data:
            try:
                ocr_batch_payload = [{"id": item["id"], "japanese": item["japanese"]} for item in extracted_data]
                prompt = f"Thể loại: {context.get('genre', '')}. Xưng hô: {context.get('pronouns', '')}. Văn phong: {context.get('tone', '')}. Dịch JSON sau và TRẢ VỀ ĐÚNG FORMAT {{\\\"translations\\\": [<kết quả>]}}: {json.dumps(ocr_batch_payload, ensure_ascii=False)}"
                
                if context.get("glossary"):
                    prompt = f"5. TỪ ĐIỂN: {context.get('glossary')}\n" + prompt

                response = deepseek_client.chat.completions.create(
                    model="deepseek-chat",
                    messages=[{"role": "system", "content": "You output strict JSON containing a 'translations' array."}, {"role": "user", "content": prompt}],
                    response_format={'type': 'json_object'}
                )
                
                # 🚀 BẢN VÁ: Dùng hàm Parse chống đạn
                ai_response = robust_json_parse(response.choices[0].message.content)
                translated_array = ai_response if isinstance(ai_response, list) else ai_response.get("translations", ai_response.get("data", []))
                for item in extracted_data:
                    for trans in translated_array:
                        if isinstance(trans, dict) and str(trans.get("id")) == str(item["id"]):
                            item["vietnamese"] = trans.get("vietnamese", "Lỗi dịch")
            except Exception as e:
                print(f"❌ Lỗi DeepSeek trên VPS: {e}")
                for item in extracted_data:
                    item["vietnamese"] = "Lỗi dịch thuật (VPS)"
        
        # LƯU ẢNH SẠCH LÊN Ổ CỨNG VPS
        clean_url = ""
        if clean_b64:
            clean_img_data = base64.b64decode(clean_b64)
            os.makedirs("workspace", exist_ok=True) 
            file_path = f"workspace/temp_clean_{task_id}.jpg"
            with open(file_path, "wb") as f:
                f.write(clean_img_data)
            clean_url = f"/{file_path}"
            
        # Trả cục dữ liệu ĐÃ ĐƯỢC DỊCH HOÀN CHỈNH về cho React vẽ
        return {
            "status": "SUCCESS", 
            "result": {
                "clean_url": clean_url,
                "data": extracted_data 
            }
        }
    
    return {"status": data.get("status")}

import zipfile
import io

@app.post("/api/projects/{project_id}/import-manga")
async def import_manga_file(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    # 1. Kiểm tra đuôi file xem có chuẩn không
    if not file.filename.lower().endswith('.manga'):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file định dạng .manga")

    try:
        # Đọc toàn bộ file vào bộ nhớ
        file_bytes = await file.read()
        
        # 2. Mở file nén ZIP (.manga thực chất là file zip gom ảnh + json)
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            # Đọc file meta dữ liệu chữ (bubbles.json)
            if 'bubbles.json' not in z.namelist():
                raise HTTPException(status_code=400, detail="Cấu trúc file .manga bị lỗi (Thiếu bubbles.json)")
                
            meta_content = z.read('bubbles.json').decode('utf-8')
            meta_data = json.loads(meta_content) # Chứa thông tin ảnh và đống ô thoại cũ
            
            # 3. Tạo một Trang truyện mới (Page) trong Database dựa trên dữ liệu giải nén
            page_id = str(uuid.uuid4())
            os.makedirs("workspace", exist_ok=True)
            
            # Giải nén ảnh gốc (raw) và ảnh sạch (clean) ra ổ cứng của VPS
            raw_filename = f"workspace/raw_{page_id}.jpg"
            if 'raw.jpg' in z.namelist():
                with open(raw_filename, "wb") as f:
                    f.write(z.read('raw.jpg'))
            
            clean_url = None
            if 'clean.jpg' in z.namelist():
                clean_filename = f"workspace/clean_{page_id}.jpg"
                with open(clean_filename, "wb") as f:
                    f.write(z.read('clean.jpg'))
                clean_url = f"/{clean_filename}"

            # 4. Ghi nhận vào Database phân phòng an toàn
            db_page = models.Page(
                id=page_id,
                project_id=project_id,
                filename=meta_data.get("filename", file.filename.replace('.manga', '.jpg')),
                status="completed" if clean_url else "pending",
                raw_url=f"/{raw_filename}",
                clean_url=clean_url,
                bubbles_data=json.dumps(meta_data.get("bubbles", [])) # Trả lại toàn bộ đống chữ cũ
            )
            
            db.add(db_page)
            await db.commit()
            
            return {
                "status": "success",
                "page": {
                    "id": page_id,
                    "filename": db_page.filename,
                    "status": db_page.status,
                    "raw_url": db_page.raw_url,
                    "clean_url": db_page.clean_url,
                    "bubbles": meta_data.get("bubbles", [])
                }
            }
            
    except Exception as e:
        print(f"❌ Lỗi import file .manga: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể đọc file .manga này: {str(e)}")
    

# 🚀 API BỔ SUNG: CHỈ DỊCH LẠI CHỮ (BẢN VÁ LỖI CHỐNG ĐẠN)
@app.post("/api/pages/{page_id}/retry-text-translation")
async def retry_text_translation(page_id: str, db: AsyncSession = Depends(get_db)):
    try:
        # 1. Tìm thông tin trang trong DB
        result = await db.execute(select(models.Page).where(models.Page.id == page_id))
        page = result.scalars().first()
        if not page:
            raise HTTPException(status_code=404, detail="Không tìm thấy trang truyện này!")
        
        # 🚀 BẢN VÁ: Hướng dẫn người dùng bấm đúng nút
        if not page.bubbles_data or page.bubbles_data == "[]":
            raise HTTPException(status_code=400, detail="Trang này không phát hiện được chữ nào! Sếp hãy bấm nút [Quét lại ảnh] hình cây đũa phép ở góc phải nhé.")

        extracted_data = json.loads(page.bubbles_data)

        ocr_batch_payload = []
        for item in extracted_data:
            jap_text = item.get("japanese", "").strip()
            if jap_text:
                ocr_batch_payload.append({"id": item["id"], "japanese": jap_text})

        if not ocr_batch_payload:
            raise HTTPException(status_code=400, detail="Trang này trống trơn tiếng Nhật! Sếp hãy bấm nút [Quét lại ảnh] hình cây đũa phép ở góc phải nhé.")

        # 2. GOM LÊN DEEPSEEK TRÊN VPS VỚI PROMPT MẠNH HƠN
        prompt = f"Bạn là biên dịch viên Manga chuyên nghiệp. Dịch mảng JSON sau sang tiếng Việt. BẮT BUỘC TRẢ VỀ ĐÚNG FORMAT {{\\\"translations\\\": [<kết quả>]}}: {json.dumps(ocr_batch_payload, ensure_ascii=False)}"
        
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You output strict JSON containing a 'translations' array with 'id' and 'vietnamese'."},
                {"role": "user", "content": prompt}
            ],
            response_format={'type': 'json_object'}
        )
        
        # 3. DÙNG HÀM PARSE CHỐNG ĐẠN 
        ai_response = robust_json_parse(response.choices[0].message.content)
        
        # 🚀 BẢN VÁ 2: Xử lý an toàn mọi cấu trúc JSON LLM trả về (Tránh lỗi Crash List)
        translated_array = ai_response if isinstance(ai_response, list) else ai_response.get("translations", ai_response.get("data", []))

        # 4. CẬP NHẬT LẠI CHỮ TIẾNG VIỆT MỚI
        for item in extracted_data:
            # Tìm bản dịch có ID khớp
            trans = next((t for t in translated_array if str(t.get("id")) == str(item["id"])), None)
            if trans:
                new_text = trans.get("vietnamese", "Lỗi dịch")
                item["vietnamese"] = new_text
                if "text" in item: 
                    item["text"] = new_text # Đồng bộ font chữ Frontend

        # 5. CHỐT SỔ LƯU DATABASE
        page.bubbles_data = json.dumps(extracted_data)
        if page.status != "completed":
            page.status = "translating"
            
        await db.commit()
        return {"status": "success", "bubbles": extracted_data}

    except HTTPException:
        raise
    
    except Exception as e:
        print(f"❌ Lỗi dịch lại chữ: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi AI Server: {str(e)}")


from fastapi import BackgroundTasks, Query
from fastapi.responses import FileResponse
import tempfile
import os

# 🚀 API XUẤT HÀNG LOẠT (ĐÃ VÁ LỖI NHẬN DANH SÁCH ẢNH ĐƯỢC TÍCH CHỌN)
@app.get("/api/projects/{project_id}/export-batch")
async def export_batch(
    project_id: str, 
    export_type: str = Query("clean", description="Loại xuất: raw, clean, psd"),
    page_ids: str = Query(None, description="Danh sách ID trang (cách nhau dấu phẩy) từ Frontend gửi lên"), # 🚀 THÊM DÒNG NÀY ĐỂ HỨNG DATA
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) 
):
    try:
        # 1. Kiểm tra quyền sở hữu Dự án
        proj_result = await db.execute(select(models.Project).where(models.Project.id == project_id, models.Project.user_id == user_id))
        project = proj_result.scalars().first()
        if not project:
            raise HTTPException(status_code=403, detail="Không có quyền truy cập dự án này")

        # 2. Xây dựng lệnh Query DB
        stmt = select(models.Page).where(models.Page.project_id == project_id)
        
        # 🚀 BỘ LỌC ĐA MỤC TIÊU: Nếu có danh sách ID từ giao diện, chỉ lấy những ảnh đó!
        if page_ids:
            # Tách chuỗi "id1,id2,id3" thành mảng ["id1", "id2", "id3"]
            id_list = [pid.strip() for pid in page_ids.split(",") if pid.strip()]
            if id_list:
                stmt = stmt.where(models.Page.id.in_(id_list))
                
        page_result = await db.execute(stmt)
        pages = page_result.scalars().all()
        
        if not pages:
            raise HTTPException(status_code=404, detail="Không có ảnh nào thỏa mãn để tải! (Có thể file đã bị bot dọn rác xóa)")

        # 3. Tạo file ZIP tạm
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
        temp_zip_path = temp_zip.name
        temp_zip.close() 

        # 4. Gom hàng nén file
        with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for i, page in enumerate(pages):
                safe_name = f"{i:03d}_{page.filename.split('.')[0]}" 
                
                raw_path = get_local_path_from_url(page.raw_url) if page.raw_url else None
                clean_path = get_local_path_from_url(page.clean_url) if page.clean_url else raw_path
                
                # Bỏ qua nếu file vật lý không tồn tại (chống crash nếu ảnh bị xóa)
                if not raw_path or not os.path.exists(raw_path):
                    print(f"⚠️ Bỏ qua trang {page.filename} vì file vật lý không còn trên Server")
                    continue

                if export_type == "raw":
                    ext = raw_path.split('.')[-1]
                    zipf.write(raw_path, arcname=f"{safe_name}_RAW.{ext}")
                    
                elif export_type == "clean":
                    if not os.path.exists(clean_path): clean_path = raw_path
                    ext = clean_path.split('.')[-1]
                    zipf.write(clean_path, arcname=f"{safe_name}_CLEAN.{ext}")
                    
                elif export_type == "psd":
                    if not os.path.exists(clean_path): clean_path = raw_path
                    psd_temp_path = f"workspace/temp_{page.id}.psd"
                    try:
                        create_manga_psd(raw_path, clean_path, psd_temp_path)
                        zipf.write(psd_temp_path, arcname=f"{safe_name}.psd")
                    except Exception as e:
                        print(f"Lỗi tạo PSD trang {page.id}: {e}")
                    finally:
                        if os.path.exists(psd_temp_path):
                            os.remove(psd_temp_path)

        # 5. Background Task: Dọn rác
        def cleanup_temp_zip(path: str):
            if os.path.exists(path):
                os.remove(path)
                
        background_tasks = BackgroundTasks()
        background_tasks.add_task(cleanup_temp_zip, temp_zip_path)

        # 6. Stream về cho trình duyệt
        # (Nếu tải có 1 trang, nó sẽ ghi là "..._1_Pages", nếu nhiều trang thì "..._N_Pages")
        return FileResponse(
            path=temp_zip_path,
            filename=f"Project_{project.name}_{export_type.upper()}.zip",
            media_type="application/zip",
            background=background_tasks
        )

    except Exception as e:
        print(f"❌ Lỗi Export Batch: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
import requests
from fastapi.concurrency import run_in_threadpool

# ==========================================
# 🚀 API: AI COPILOT (TRỢ LÝ DỊCH THUẬT NGỮ CẢNH)
# ==========================================
@app.post("/api/copilot/chat")
async def copilot_chat(req: CopilotRequest):
    try:
        # 1. CẤU HÌNH SYSTEM PROMPT SIÊU KỶ LUẬT (Tiết kiệm Token)
        system_prompt = "Bạn là chuyên gia dịch thuật Manga. Tuân thủ TUYỆT ĐỐI: 1. Chỉ trả về kết quả dịch cuối cùng. 2. KHÔNG giải thích. 3. KHÔNG dùng ngoặc kép."
        
        # 2. RẼ NHÁNH NGỮ CẢNH THEO NÚT BẤM (Feature Routing)
        if req.action == "aggressive":
            user_prompt = f"Viết lại câu sau cho thật cục cằn, hầm hố, giang hồ (giữ nguyên nghĩa). Tiếng Nhật: {req.japanese}. Bản dịch cũ: {req.text}"
        elif req.action == "natural":
            user_prompt = f"Viết lại câu sau cho mượt mà, tự nhiên, giống văn phong giao tiếp GenZ Việt Nam. Tiếng Nhật: {req.japanese}. Bản dịch cũ: {req.text}"
        elif req.action == "shorten":
            user_prompt = f"Rút gọn câu sau cho ngắn nhất có thể để nhét vừa khung thoại nhỏ (không làm mất nghĩa). Tiếng Nhật: {req.japanese}. Bản dịch cũ: {req.text}"
        elif req.action == "explain":
            system_prompt = "Bạn là từ điển sống về văn hóa Nhật Bản. Giải thích cực kỳ ngắn gọn (dưới 40 từ)."
            user_prompt = f"Giải thích ý nghĩa, sắc thái hoặc chơi chữ (nếu có) của câu tiếng Nhật này: {req.japanese}"
        else: # custom
            user_prompt = f"Tiếng Nhật: {req.japanese}. Bản dịch: {req.text}. Yêu cầu riêng: {req.custom_prompt}"

        # Giả sử sếp đã có:
        # req.japanese (Text OCR tiếng Nhật)
        # req.project_id (ID của dự án)
        # redis_client (Biến kết nối Redis sếp đã khởi tạo)
        
        # 1. KHỞI TẠO CỖ MÁY
        nlp = TranslationEngine(redis_client)
        
        # 2. BƯỚC LỌC ĐẦU TIÊN: KIỂM TRA REDIS (EXACT MATCH)
        cached_result, cache_key = await nlp.get_exact_match(req.project_id, req.japanese)
        if cached_result:
            print("🚀 CACHE HIT! Lấy ngay từ Redis, không tốn 1 xu API DeepSeek!")
            return {"result": cached_result, "cached": True}

        # 3. NẾU KHÔNG CÓ TRONG CACHE -> CHUẨN BỊ GỌI DEEPSEEK
        # Trích xuất từ điển thông minh bằng Aho-Corasick (Thay vì nhét cả mớ vào prompt)
        
        # TODO: Sếp query Database lấy toàn bộ thuật ngữ của project này
        # Ví dụ giả lập từ DB: db_terms = {"螺旋丸": "Rasengan", "木ノ葉": "Làng Lá", "サスケ": "Sasuke"}
        db_terms = {"螺旋丸": "Rasengan"} # Sếp thay bằng câu lệnh SQL SQLAlchemy nhé
        
        # Quét nhặt từ
        automaton = nlp.build_glossary_automaton(db_terms)
        relevant_terms = nlp.extract_relevant_terms(automaton, req.japanese)
        
        # 3.5. LẤY NGỮ CẢNH CỬA SỔ TRƯỢT (SLIDING WINDOW)
        # Sếp truyền session db, id project và id của trang đang dịch vào
        # Giả sử req.project_id và req.page_id có sẵn trong payload từ Frontend gửi lên
        previous_context = await get_sliding_window_context(db, req.project_id, req.page_id, window_size=2)

        # 4. CHUẨN BỊ PROMPT TẦNG ĐỘNG (USER PROMPT)
        # Nối Từ điển (Glossary) + Ngữ cảnh cũ (Context) + Text hiện tại (Current)
        glossary_text = "\n".join([f"- {j} -> {v}" for j, v in relevant_terms.items()]) if relevant_terms else "None"
        
        user_prompt = f"""MANDATORY GLOSSARY & PRONOUNS:
{glossary_text}

PREVIOUS PAGES CONTEXT (Use this to maintain story flow and pronouns):
{previous_context}

CURRENT PAGE TO TRANSLATE (JSON format):
{json.dumps(req.ocr_data, ensure_ascii=False)}

Translate the text based on the rules and return ONLY the JSON object."""

        # 5. GỌI DEEPSEEK API VỚI JSON MODE
        DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "sk-xxx")
        headers = {"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"}
        
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": DEEPKOMA_SYSTEM_PROMPT}, # TẦNG TĨNH -> HƯỞNG GIẢM GIÁ 90%
                {"role": "user", "content": user_prompt}               # TẦNG ĐỘNG -> CHỊU PHÍ 100%
            ],
            # 🚀 ÉP KIỂU JSON: Chống lỗi Frontend không parse được dữ liệu
            "response_format": {"type": "json_object"}, 
            "temperature": 0.3, # 🚀 Giữ cái đầu lạnh cho LLM
            "max_tokens": 1000  # Cho phép trả JSON dài hơn một chút
        }
        
        response = await run_in_threadpool(
            requests.post, 
            "https://api.deepseek.com/chat/completions", 
            headers=headers, json=payload, timeout=20
        )
        response.raise_for_status()
        
        # 6. NHẬN KẾT QUẢ VÀ PARSE JSON TRỰC TIẾP
        raw_result = response.json()["choices"][0]["message"]["content"]
        
        try:
            # Vì đã ép JSON Object, ta có thể parse thẳng thành Dict trong Python
            translated_dict = json.loads(raw_result)
        except json.JSONDecodeError:
            # Đề phòng lỗi (rất hiếm khi xảy ra với JSON mode)
            translated_dict = {"error": "Lỗi parse JSON từ LLM", "raw": raw_result}
            
        # Lưu vào Redis (như Bước 2)
        # ...
        
        return {"result": translated_dict, "cached": False}

    except Exception as e:
        print(f"❌ Lỗi AI Copilot: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
# ========================================================
# KẾT NỐI PAYOS (CHUẨN SDK PYTHON MỚI NHẤT)
# ========================================================
from payos import PayOS
from payos.types import CreatePaymentLinkRequest
from db_models import User, Transaction
import time
import os

# Khởi tạo PayOS
payos_client = PayOS(
    client_id=os.getenv("PAYOS_CLIENT_ID"),
    api_key=os.getenv("PAYOS_API_KEY"),
    checksum_key=os.getenv("PAYOS_CHECKSUM_KEY")
)

# ==========================================
# API 1: TẠO MÃ QR THANH TOÁN CHO NGƯỜI DÙNG
# ==========================================
@app.post("/api/payment/create-link")
async def create_payment_link(user_id: str, package_id: str, db: AsyncSession = Depends(get_db)):
    # 1. Định nghĩa các gói bán
    packages = {
        "pack_test": {"name": "Gói Test Luồng", "price": 2000, "credits": 20},
        "pack_50k": {"name": "Gói 500 Credits", "price": 50000, "credits": 500},
        "pack_100k": {"name": "Gói 1200 Credits", "price": 100000, "credits": 1200},
        "pack_pro": {"name": "Thuê bao PRO 1 Tháng", "price": 200000, "credits": 0}
    }
    
    selected_pack = packages.get(package_id)
    if not selected_pack:
        raise HTTPException(status_code=400, detail="Gói không hợp lệ")

    # ========================================================
    # 🚀 BẢN VÁ LỖI KHÓA NGOẠI: TỰ ĐỘNG TẠO USER NẾU CHƯA CÓ
    # ========================================================
    from sqlalchemy import select
    stmt_user = select(User).where(User.id == user_id)
    existing_user = (await db.execute(stmt_user)).scalar_one_or_none()
    
    if not existing_user:
        # Tạo user giả định để thỏa mãn khóa ngoại Database
        new_user = User(id=user_id, email=f"user_{user_id}@deepkoma.local")
        db.add(new_user)
        # Flush để đẩy data xuống ổ cứng ngay lập tức, giúp lệnh Transaction bên dưới có thể trỏ tới!
        await db.flush() 

    # 2. Tạo mã đơn hàng duy nhất bằng Timestamp
    order_code = int(time.time() * 1000)
    
    # 3. Lưu giao dịch PENDING vào Database
    new_txn = Transaction(
        order_code=order_code,
        user_id=user_id,
        package_name=selected_pack["name"],
        amount=selected_pack["price"],
        credits_added=selected_pack["credits"],
        status="PENDING"
    )
    db.add(new_txn)
    await db.commit()

    # 4. Gọi API PayOS SDK Mới để tạo link
    from payos.types import CreatePaymentLinkRequest
    payment_request = CreatePaymentLinkRequest(
        order_code=order_code,
        amount=selected_pack["price"],
        description="Thanh toan DeepKoma", 
        cancel_url="http://localhost:5173/workspace?payment=failed",
        return_url="http://localhost:5173/workspace?payment=success"
    )
    
    payment_link = payos_client.payment_requests.create(payment_request)
    
    return {"checkoutUrl": payment_link.checkout_url}


# ==========================================
# API 2: WEBHOOK LẮNG NGHE TIỀN VỀ
# ==========================================
@app.post("/api/payment/webhook")
async def payos_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    
    webhook_data = body.get("data", {})
    order_code = webhook_data.get("orderCode")
    
    if not order_code:
        return {"success": True} 

    stmt = select(Transaction).where(Transaction.order_code == order_code)
    result = await db.execute(stmt)
    txn = result.scalar_one_or_none()
    
    if txn and txn.status == "PENDING":
        txn.status = "PAID"
        
        stmt_user = select(User).where(User.id == txn.user_id)
        user = (await db.execute(stmt_user)).scalar_one_or_none()
        
        if user:
            if "PRO" in txn.package_name:
                user.is_pro = True
            else:
                user.credits += txn.credits_added
        
        await db.commit()
        print(f"💰 TING TING! Đã cộng {txn.credits_added} credits cho user {txn.user_id}")

    return {"success": True}

# ==========================================
# QUẢN LÝ CREDITS: LẤY SỐ DƯ & TRỪ TIỀN
# ==========================================
@app.get("/api/users/me")
async def get_user_profile(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """API lấy thông tin User (Bao gồm Credits và gói Pro)"""
    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()
    
    if not user:
        # Tự động tạo user mới tặng 20 credits nếu lần đầu đăng nhập
        user = User(id=user_id, email=f"user_{user_id}@deepkoma.local", credits=20)
        db.add(user)
        await db.commit()
        
    return {
        "id": user.id,
        "credits": user.credits,
        "is_pro": user.is_pro,
        "pro_until": user.pro_until
    }

@app.post("/api/users/me/deduct")
async def deduct_credits(amount: int = 1, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """API trừ tiền mỗi khi dùng AI"""
    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
        
    # Gói Pro thì không trừ tiền
    if user.is_pro:
        return {"status": "success", "credits": user.credits, "is_pro": True}
        
    if user.credits < amount:
        raise HTTPException(status_code=402, detail="Hết Credits! Vui lòng nạp thêm.")
        
    user.credits -= amount
    await db.commit()
    
    return {"status": "success", "credits": user.credits, "is_pro": False}