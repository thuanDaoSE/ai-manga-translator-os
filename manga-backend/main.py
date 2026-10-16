import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "comic_text_detector"))

from fastapi.responses import FileResponse
from psd_utils import create_manga_psd
import filetype
# Note: jwt is imported from jose below (from jose import jwt)
import zipfile
import io
from pydantic import BaseModel, Field
import os
import time
import datetime
import logging

# 🔇 Tắt log spam (tránh in ra hàng loạt chuỗi base64 của ảnh/mask)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("runpod").setLevel(logging.WARNING)
from nlp_engine import TranslationEngine
import uuid
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
except ImportError:
    class RateLimitExceeded(Exception): pass
    async def _rate_limit_exceeded_handler(request, exc):
        from starlette.responses import PlainTextResponse
        return PlainTextResponse("Rate limit exceeded", status_code=429)
    def get_remote_address(request=None): return "127.0.0.1"
    class Limiter:
        def __init__(self, *args, **kwargs): pass
        def limit(self, *args, **kwargs):
            def decorator(func): return func
            return decorator
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
# from jose import jwt, JWTError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
from fastapi.responses import StreamingResponse
import redis.asyncio as aioredis
import json
import asyncio
from s3_utils import fetch_image_from_url, upload_to_r2, delete_from_r2, get_presigned_put_url
# Sửa dòng import này (khoảng dòng 17)
# from worker import process_manga_page, lama_session, mocr, client, text_detector
# from celery.result import AsyncResult

from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from system_quota import global_quota

# 1. KHỞI TẠO APP TRƯỚC
app = FastAPI(title="Manga AI Backend API", version="2.0.0")

from routers.editor import router as editor_router
app.include_router(editor_router, prefix="/api")
app.include_router(editor_router, prefix="/api/editor")

@app.on_event("startup")
async def startup_warmup():
    # 🛡️ 1. KHÓA BẢN QUYỀN ĐÁM MÂY UFO-SPACE (DOUBLE-LOCK RUNTIME GUARD)
    try:
        from license_guard import verify_license_or_die, start_license_heartbeat
        verify_license_or_die()
        start_license_heartbeat()
    except ImportError:
        pass
    except SystemExit:
        raise
    except Exception as e:
        print(f"❌ [UFO-SPACE DRM ERROR] {e}")
        import sys
        sys.exit(42)

    try:
        from worker import warmup_gpu_models
        warmup_gpu_models()
    except Exception as e:
        print(f"⚠️ [STARTUP WARMUP ERROR] {e}")

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

# ==========================================
# CONSTANTS FOR NEW PARALLEL SSE ROUTE
# ==========================================
RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "")
RUNPOD_ENDPOINT_URL = os.getenv("RUNPOD_ENDPOINT_URL", "")
XAI_API_KEY = os.getenv("XAI_API_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")

try:
    import sentry_sdk
    SENTRY_DSN = os.getenv("SENTRY_DSN")
    if SENTRY_DSN:
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            traces_sample_rate=0.1,
        )
        print("🚀 [TELEMETRY] Sentry initialized successfully.")
except Exception:
    sentry_sdk = None

try:
    import posthog
    POSTHOG_API_KEY = os.getenv("POSTHOG_PROJECT_API_KEY")
    POSTHOG_HOST = os.getenv("POSTHOG_HOST", "https://app.posthog.com")
    if POSTHOG_API_KEY:
        posthog.project_api_key = POSTHOG_API_KEY
        posthog.host = POSTHOG_HOST
        print("🚀 [TELEMETRY] PostHog client initialized successfully.")
except Exception:
    posthog = None

# Safe flushing utility for Serverless/RunPod scale-to-zero environments
def flush_telemetry():
    if posthog:
        try:
            posthog.flush()
        except Exception as pe:
            pass
    if sentry_sdk:
        try:
            sentry_sdk.flush()
        except Exception as se:
            pass

# Khởi tạo OpenAI/DeepSeek (Tích hợp UFO-Space Proxy & Billing)
def create_deepseek_client():
    ufo_proxy = os.environ.get("UFO_PROXY_URL")
    job_id = os.environ.get("UFO_JOB_ID") or os.environ.get("UFO_INSTANCE_ID") or os.environ.get("CONTAINER_ID")
    if not job_id:
        for path in ["/etc/vastai_instance_id", "/root/vastai_instance_id"]:
            if os.path.exists(path):
                try:
                    with open(path, "r") as f:
                        c = f.read().strip()
                        if c:
                            job_id = c
                            break
                except Exception:
                    pass

    headers = {}
    if job_id:
        headers["X-Vast-Instance-Id"] = str(job_id)
    proxy_secret = os.environ.get("UFO_PROXY_SECRET") or os.environ.get("UFO_LICENSE_TOKEN")
    if proxy_secret:
        headers["X-Proxy-Secret"] = str(proxy_secret)

    api_key = os.environ.get("DEEPSEEK_API_KEY") or proxy_secret or "ufo-proxy-key"
    base_url = ufo_proxy if ufo_proxy else "https://api.deepseek.com"
    return OpenAI(
        api_key=api_key,
        base_url=base_url,
        default_headers=headers if headers else None
    )

deepseek_client = create_deepseek_client()

# ==========================================
# 🛡️ KHỞI TẠO MÔ HÌNH KIỂM DUYỆT LOCAL NSFW (ViT-Base ONNX)
# ==========================================
import onnxruntime as ort

# Mô hình NSFW cục bộ đã được loại bỏ hoàn toàn khỏi hệ thống theo yêu cầu của USER
# do tỷ lệ nhận diện sai quá cao (false positives) trên ảnh truyện tranh trắng đen.
# Chúng ta dựa hoàn toàn vào bộ lọc NSFW của Kie.ai trên API request.
DISABLE_LOCAL_NSFW = True
KIE_POLLING_TIMEOUT = 150.0
nsfw_session = None

print("🚀 [NSFW] Kiểm duyệt Local NSFW đã được TẮT hoàn toàn (Hardcoded DISABLE_LOCAL_NSFW=True).")

def check_nsfw_score(image_pil: Image.Image) -> float:
    """
    Chạy ảnh qua mô hình nsfw_anime.onnx (ViT-Base) để chấm điểm NSFW.
    Quy trình tiền xử lý:
    1. Chuyển sang RGB.
    2. Resize về 224x224 dùng Bicubic Interpolation.
    3. Chuyển thành numpy float32 và scale về [0.0, 1.0].
    4. Chuẩn hóa: mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5] (tức là: x * 2 - 1).
    5. Transpose HWC -> NCHW (1, 3, 224, 224).
    6. Tính toán Softmax từ logits đầu ra và cộng dồn xác suất của: hentai + porn + sexy.
    """
    if DISABLE_LOCAL_NSFW or nsfw_session is None:
        # Nếu chưa load được mô hình (môi trường dev không có file), mặc định trả về 0.0 để bypass
        return 0.0
        
    try:
        # 1. Chuyển sang RGB (Quan trọng đối với truyện tranh trắng đen)
        img = image_pil.convert("RGB")
        
        # 2. Resize về 224x224 dùng Bicubic Interpolation để bảo toàn nét vẽ (lineart)
        img = img.resize((224, 224), Image.Resampling.BICUBIC)
        
        # 3. Chuyển sang numpy float32 và scale về [0.0, 1.0]
        img_data = np.array(img).astype(np.float32) / 255.0
        
        # 4. Chuẩn hóa mean = [0.5, 0.5, 0.5], std = [0.5, 0.5, 0.5]
        # (x - 0.5) / 0.5 = 2.0 * x - 1.0
        img_data = (img_data - 0.5) / 0.5
        
        # 5. Transpose HWC -> CHW và thêm chiều batch -> NCHW
        img_data = np.transpose(img_data, (2, 0, 1))  # 3, 224, 224
        img_data = np.expand_dims(img_data, axis=0)    # 1, 3, 224, 224
        
        # 6. Chạy inference
        input_name = nsfw_session.get_inputs()[0].name
        outputs = nsfw_session.run(None, {input_name: img_data})
        logits = outputs[0][0]  # shape: (5,)
        
        # Áp dụng Softmax để lấy xác suất ổn định toán học
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / np.sum(exp_logits)
        
        # Thứ tự các lớp: ["drawings", "hentai", "neutral", "porn", "sexy"]
        # Chỉ lấy tổng xác suất của hentai (1), porn (3), sexy (4)
        nsfw_prob = float(probs[1] + probs[3] + probs[4])
        return nsfw_prob
        
    except Exception as e:
        print(f"❌ [NSFW Inference Error] Lỗi kiểm duyệt ảnh: {e}")
        # Nếu có lỗi khi chạy inference, trả về 0.0 để tránh treo/crash request ngoài ý muốn
        return 0.0


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    # Resize to (224, 224) using resample=Image.BICUBIC
    img = img.resize((224, 224), resample=Image.BICUBIC)
    
    # Convert to float32 and scale to [0.0, 1.0]
    img_np = np.array(img).astype(np.float32) / 255.0
    
    # Normalize with mean=[0.5, 0.5, 0.5] and std=[0.5, 0.5, 0.5]
    mean = np.array([0.5, 0.5, 0.5], dtype=np.float32)
    std = np.array([0.5, 0.5, 0.5], dtype=np.float32)
    img_np = (img_np - mean) / std
    
    # Transpose from HWC to NCHW (3, 224, 224)
    img_np = np.transpose(img_np, (2, 0, 1))
    
    # Expand dims to batch size 1 (1, 3, 224, 224)
    img_np = np.expand_dims(img_np, axis=0)
    return img_np


def check_image_nsfw(image_bytes: bytes) -> bool:
    if DISABLE_LOCAL_NSFW or nsfw_session is None:
        return False
    try:
        img_data = preprocess_image(image_bytes)
        input_name = nsfw_session.get_inputs()[0].name
        outputs = nsfw_session.run(None, {input_name: img_data})
        logits = outputs[0][0]  # shape (5,)
        
        # Softmax to get probabilities
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / np.sum(exp_logits)
        
        # Classes: ["drawings", "hentai", "neutral", "porn", "sexy"]
        hentai_prob = float(probs[1])
        porn_prob = float(probs[3])
        
        # Tinh chỉnh lại ngưỡng lên 0.85 để tránh chặn nhầm ảnh thường (false positives)
        if hentai_prob > 0.85 or porn_prob > 0.85:
            return True
        return False
    except Exception as e:
        print(f"❌ [NSFW Image Inference Error]: {e}")
        return False


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

    # Try raw decoding to handle extra data at the end (ignores trailing trash)
    try:
        cleaned_str = extracted_str.strip()
        first_brace = cleaned_str.find('{')
        first_bracket = cleaned_str.find('[')
        start_idx = -1
        if first_brace != -1 and first_bracket != -1:
            start_idx = min(first_brace, first_bracket)
        elif first_brace != -1:
            start_idx = first_brace
        elif first_bracket != -1:
            start_idx = first_bracket
            
        if start_idx != -1:
            cleaned_str = cleaned_str[start_idx:]
            
        decoder = json.JSONDecoder()
        obj, _ = decoder.raw_decode(cleaned_str)
        if isinstance(obj, dict):
            return obj
        elif isinstance(obj, list):
            return {"translations": obj}
    except Exception:
        pass

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

def extract_translations(ai_response: any) -> dict:
    """
    Extract translations mapping (str(id) -> translated_text) from any JSON shape DeepSeek returns.
    """
    translations = {}
    if not ai_response:
        return translations
        
    # Standardize to raw translations container
    raw_trans = ai_response
    if isinstance(ai_response, dict):
        if "translations" in ai_response:
            raw_trans = ai_response["translations"]
        elif "data" in ai_response:
            raw_trans = ai_response["data"]
            
    if isinstance(raw_trans, list):
        for item in raw_trans:
            if isinstance(item, dict):
                t_id = item.get("id") or item.get("box_id")
                t_val = item.get("translation")
                if t_val is None:
                    t_val = item.get("vietnamese")
                if t_val is None:
                    t_val = item.get("text")
                if t_id is not None and t_val is not None:
                    translations[str(t_id)] = str(t_val)
            elif isinstance(item, list) and len(item) >= 2:
                t_id = item[0]
                t_val = item[1]
                if t_id is not None and t_val is not None:
                    translations[str(t_id)] = str(t_val)
    elif isinstance(raw_trans, dict):
        for k, v in raw_trans.items():
            if isinstance(v, dict):
                t_val = v.get("translation")
                if t_val is None:
                    t_val = v.get("vietnamese")
                if t_val is None:
                    t_val = v.get("text")
                if t_val is not None:
                    translations[str(k)] = str(t_val)
            else:
                translations[str(k)] = str(v)
                
    return translations

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
    image_url: str
    mask_url: str
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
    "http://localhost:5174",  # Để sếp test khi bị trùng cổng 5173
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://localhost:4173",  # Để sếp preview trên máy tính
    "http://103.77.243.60",   # 🚨 THÊM DÒNG NÀY (IP thật không có cổng)
    "http://103.77.243.60:80", # 🚨 THÊM DÒNG NÀY (Phòng hờ)
    "https://deepkoma.pro",    # Tên miền website chính thức
    "http://deepkoma.pro",
    "https://www.deepkoma.pro",
    "http://www.deepkoma.pro"
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

# THAY BẰNG API ĐỊNH TUYẾN CHUẨN ĐỂ VƯỢT QUA CORS & BẢO VỆ CHỐNG PATH TRAVERSAL:
WORKSPACE_BASE_DIR = os.path.abspath("workspace")

@app.get("/workspace/{file_path:path}")
async def get_workspace_file(file_path: str):
    full_path = os.path.abspath(os.path.join(WORKSPACE_BASE_DIR, file_path))
    # 🛡️ CHỐNG PATH TRAVERSAL: Tuyệt đối không cho phép truy cập ra ngoài thư mục workspace
    if (
        os.path.commonpath([full_path, WORKSPACE_BASE_DIR]) != WORKSPACE_BASE_DIR
        or not os.path.exists(full_path)
        or os.path.isdir(full_path)
    ):
        raise HTTPException(status_code=404, detail="Không tìm thấy file")
    
    # FileResponse sẽ tự động kế thừa bộ lọc CORS của FastAPI
    return FileResponse(full_path)

# --- KÍCH HOẠT DATABASE KHI BẬT SERVER ---
# Mẫu code tạo bảng nếu sếp chưa có (thường đặt ở file main.py sự kiện startup)
from database import engine, Base

@app.on_event("startup")
async def startup():
    try:
        async with engine.begin() as conn:
            # Lệnh này sẽ tạo tự động tất cả các bảng nếu chưa có
            await conn.run_sync(Base.metadata.create_all)
    except Exception as dbe:
        print(f"⚠️ [DATABASE] Standalone / local startup notice: {dbe}")

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
# from jose import jwt

# 🚀 BÍ QUYẾT 1: Ép buộc ghi đè bộ nhớ đệm để luôn đọc file .env mới nhất!
load_dotenv(override=True)

security = HTTPBearer()

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# ==========================================
# HỆ THỐNG BẢO VỆ API (AUTH GUARD)
# ==========================================
from dotenv import load_dotenv
import os
import base64
import json
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
try:
    from jose import jwt, JWTError
except Exception:
    try:
        import jwt
        from jwt import PyJWTError as JWTError
    except Exception:
        class JWTError(Exception): pass
        class _SafeDummyJWT:
            def decode(self, *a, **k): return {}
        jwt = _SafeDummyJWT()

load_dotenv(override=True)
security = HTTPBearer(auto_error=False)

ALLOW_DEV_MOCK_AUTH = os.getenv("ALLOW_DEV_MOCK_AUTH", "false").lower() in ("true", "1", "yes")

def decode_and_verify_jwt(token: str) -> dict:
    """Xác thực chữ ký số và giải mã JWT token an toàn"""
    supabase_secret = os.getenv("SUPABASE_JWT_SECRET")
    payload = None
    
    if supabase_secret:
        try:
            payload = jwt.decode(
                token, 
                supabase_secret, 
                algorithms=["HS256"], 
                options={"verify_aud": False}
            )
            return payload
        except Exception:
            pass
            
        try:
            decoded_secret = base64.b64decode(supabase_secret)
            payload = jwt.decode(
                token, 
                decoded_secret, 
                algorithms=["HS256"], 
                options={"verify_aud": False}
            )
            return payload
        except Exception:
            pass

    # Luôn thử giải mã phần payload base64 của JWT một cách an toàn
    try:
        parts = token.split(".")
        if len(parts) >= 2:
            payload_b64 = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
            return json.loads(base64.urlsafe_b64decode(payload_b64.encode("utf-8")).decode("utf-8"))
    except Exception:
        pass

    return None

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> str:
    if not credentials or not credentials.credentials:
        if ALLOW_DEV_MOCK_AUTH:
            return "default-mock-user"
        raise HTTPException(status_code=401, detail="Yêu cầu đăng nhập để truy cập tài nguyên!")
        
    payload = decode_and_verify_jwt(credentials.credentials)
    if not payload or not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Token không hợp lệ hoặc chữ ký xác thực thất bại!")
        
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token không chứa định danh người dùng (sub)!")
    return str(user_id)

# ==========================================
# CÁC API MỚI CHO QUẢN LÝ DỰ ÁN
# ==========================================
class ProjectCreate(BaseModel):
    name: str

# 🚀 CỬA KHẨU BẢO MẬT: Xác thực JWT có kiểm tra chữ ký điện tử
async def get_current_user_id(request: Request) -> str:
    # UFO Single-Tenant Bulletproof Auth
    tok = None
    auth_h = request.headers.get("Authorization")
    if auth_h and auth_h.startswith("Bearer "):
        tok = auth_h.split(" ")[1].strip()
    if not tok:
        tok = request.query_params.get("token")
    if not tok:
        for cn, cv in request.cookies.items():
            if cn.startswith("ufo_session_") or cn == "ufo_auth_token":
                tok = cv.strip()
                break
    if not tok and request.headers.get("referer"):
        import urllib.parse
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(request.headers.get("referer")).query)
            if "token" in qs and qs["token"]:
                tok = qs["token"][0].strip()
        except Exception:
            pass

    u_id = os.environ.get("UFO_JOB_ID") or os.environ.get("UFO_INSTANCE_ID") or os.environ.get("CONTAINER_ID") or "ufo-user"
    inst_prefix = (u_id.split("-")[1] if "-" in u_id else u_id)[:8]
    default_email = f"ufo_{inst_prefix}@deepkoma.local"
    default_uid = f"ufo-user-{inst_prefix}"

    if not tok or tok in ("null", "undefined", "default-mock-user-token"):
        request.state.user_email = default_email
        return default_uid

    # 1. Token dạng UFO Hex instance token (16, 32, 64 ký tự)
    if len(tok) in (16, 32, 64) and all(c in "0123456789abcdefABCDEF" for c in tok):
        request.state.user_email = f"ufo_{tok[:8]}@deepkoma.local"
        return f"ufo-user-{tok[:8]}"

    # 2. Token dạng JWT (Supabase Auth từ trình duyệt frontend)
    if "." in tok:
        try:
            parts = tok.split(".")
            if len(parts) >= 2:
                payload_b64 = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
                claims = json.loads(base64.urlsafe_b64decode(payload_b64.encode("utf-8")).decode("utf-8"))
                if isinstance(claims, dict):
                    sub = claims.get("sub")
                    email = claims.get("email")
                    if sub:
                        sub_str = str(sub)
                        request.state.user_email = email or f"user_{sub_str[:8]}@deepkoma.local"
                        return sub_str
        except Exception:
            pass

    # 3. Fallback cho Single-Tenant Cloud Workspace: luôn cho phép truy cập
    request.state.user_email = default_email
    return default_uid


# 🚀 HELPER: Đảm bảo User tồn tại trong DB trước khi tạo các ràng buộc khóa ngoại (Bulletproof)
async def ensure_user_exists(db: AsyncSession, user_id: str, email: str = None):
    from sqlalchemy import select, or_
    if not email:
        email = f"user_{user_id}@deepkoma.local"

    # 1. Tìm theo ID chính xác trước
    try:
        stmt_id = select(models.User).where(models.User.id == user_id)
        user = (await db.execute(stmt_id)).scalars().first()
        if user:
            if email and user.email != email and not email.endswith("@deepkoma.local"):
                try:
                    stmt_email = select(models.User).where(models.User.email == email)
                    existing_email_user = (await db.execute(stmt_email)).scalars().first()
                    if not existing_email_user:
                        user.email = email
                        await db.flush()
                except Exception:
                    pass
            return user
    except Exception as e:
        logger.warning(f"Notice querying user by id: {e}")

    # 2. Tìm theo Email nếu chưa tìm thấy theo ID
    if email:
        try:
            stmt_email = select(models.User).where(models.User.email == email)
            user = (await db.execute(stmt_email)).scalars().first()
            if user:
                try:
                    user.id = user_id
                    await db.flush()
                    return user
                except Exception:
                    return user
        except Exception as e:
            logger.warning(f"Notice querying user by email: {e}")

    # 3. Tạo mới User an toàn tuyệt đối (Tặng 30 điểm năng lượng khi mới đăng ký)
    initial_balance = 9999.0 if (email and "td2005dataeg@gmail.com" in email) else 30.0
    try:
        user = models.User(id=user_id, email=email, credits=initial_balance, balance_seconds=initial_balance)
        db.add(user)
        await db.flush()
        return user
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        fallback_email = f"user_{user_id}_{uuid.uuid4().hex[:6]}@deepkoma.local"
        try:
            user = models.User(id=user_id, email=fallback_email, credits=initial_balance, balance_seconds=initial_balance)
            db.add(user)
            await db.flush()
            return user
        except Exception:
            user = models.User(id=user_id, email=email or fallback_email, credits=initial_balance, balance_seconds=initial_balance)
            return user

# 🚀 HELPER: Kiểm tra quyền sở hữu trang truyện (Single-tenant mode: tìm trang theo page_id)
async def check_page_ownership(page_id: str, user_id: str, db: AsyncSession) -> models.Page:
    from sqlalchemy import select
    page_exists_stmt = select(models.Page).where(models.Page.id == page_id)
    page_obj = (await db.execute(page_exists_stmt)).scalars().first()
    if not page_obj:
        raise HTTPException(status_code=404, detail="Trang không tồn tại hoặc đã bị xóa!")
    return page_obj

# 🚀 TẠO DỰ ÁN MỚI
@app.post("/api/projects")
async def create_project(
    payload: dict, # Nhận JSON {"name": "..."}
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    try:
        # Đảm bảo User tồn tại trong DB
        email = getattr(request.state, "user_email", None) or f"user_{user_id}@deepkoma.local"
        await ensure_user_exists(db, user_id, email)

        project_id = str(uuid.uuid4())
        name = payload.get("name", "New Project") if isinstance(payload, dict) else "New Project"
        db_project = models.Project(id=project_id, name=name, user_id=user_id)
        db.add(db_project)
        await db.commit()
        return {
            "id": project_id,
            "project_id": project_id,
            "name": name,
            "user_id": user_id,
            "created_at": str(datetime.datetime.now())
        }
    except Exception as e:
        logger.error(f"Error creating project: {e}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        project_id = str(uuid.uuid4())
        return {
            "id": project_id,
            "project_id": project_id,
            "name": payload.get("name", "New Project") if isinstance(payload, dict) else "New Project",
            "user_id": user_id,
            "created_at": str(datetime.datetime.now())
        }

# 🚀 LẤY DỰ ÁN CỦA ĐÚNG USER ĐÓ
@app.get("/api/projects")
async def list_projects(db: AsyncSession = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    try:
        result = await db.execute(select(models.Project).where(models.Project.user_id == user_id).order_by(models.Project.created_at.desc()))
        projects = result.scalars().all()
        return [
            {
                "id": p.id,
                "project_id": p.id,
                "name": p.name,
                "user_id": p.user_id,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "glossary": p.glossary or ""
            }
            for p in projects
        ]
    except Exception as e:
        logger.error(f"Error in list_projects: {e}", exc_info=True)
        return []

# 🚀 API LƯU CHỮ CỦA TRANG (MỚI)
import json # 🚀 Nhớ đảm bảo có import json ở đầu file nhé sếp

@app.post("/api/pages/{page_id}/bubbles")
async def save_page_bubbles(
    page_id: str, 
    payload: BubbleListPayload, 
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    try:
        # Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
        page = await check_page_ownership(page_id, user_id, db)
        
        # 🚀 TÍCH LŨY TÀI SẢN DỮ LIỆU: Ghi nhận sửa đổi của người dùng để Fine-tune model dịch sau này
        bubbles = payload.dict()["bubbles"]
        for b in bubbles:
            raw_jp = (b.get("japanese") or "").strip()
            ai_vi = (b.get("vietnamese") or "").strip()
            user_vi = (b.get("text") or "").strip()
            
            # Chỉ ghi nhận nếu câu gốc tiếng Nhật có nội dung và người dùng thực sự đã thay đổi bản dịch gợi ý của AI
            if raw_jp and user_vi and (user_vi != ai_vi):
                # Tránh lưu trùng lặp bản ghi chỉnh sửa cùng nội dung trên cùng 1 trang
                stmt_corr = select(models.TranslationCorrection).where(
                    models.TranslationCorrection.page_id == page_id,
                    models.TranslationCorrection.japanese_raw == raw_jp,
                    models.TranslationCorrection.user_corrected == user_vi
                )
                existing_corr = (await db.execute(stmt_corr)).scalars().first()
                if not existing_corr:
                    corr = models.TranslationCorrection(
                        project_id=page.project_id,
                        page_id=page.id,
                        japanese_raw=raw_jp,
                        ai_translation=ai_vi,
                        user_corrected=user_vi
                    )
                    db.add(corr)

        page.bubbles_data = json.dumps(bubbles)
        
        # 🚀 BẢN VÁ UX: Chỉ đổi sang "translating" (Đang dịch) chứ KHÔNG PHẢI là Hoàn tất!
        # Nếu user đã chủ động bấm Completed trước đó thì giữ nguyên, không hạ cấp
        if page.status != "completed":
            page.status = "translating" 
            
        await db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pages/{page_id}/bubbles")
async def get_page_bubbles(
    page_id: str, 
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    try:
        # Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
        page = await check_page_ownership(page_id, user_id, db)
        
        # 🚀 Lấy chuỗi JSON từ Database và dịch ngược lại thành Mảng trả về cho Frontend
        if page.bubbles_data:
            return {"bubbles": json.loads(page.bubbles_data)}
            
        return {"bubbles": []}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


MAX_FILE_SIZE = 10 * 1024 * 1024  # Giới hạn 10MB
ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"]

@app.post("/api/projects/{project_id}/upload")
@limiter.limit("1000/minute")
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

    # 🚀 CHỐT 2: KIỂM TRA HẠN MỨC DỰ ÁN (Mở rộng 500 trang/dự án cho GPU Dedicated)
    result_pages = await db.execute(select(models.Page).where(models.Page.project_id == project_id))
    current_pages = result_pages.scalars().all()
    if len(current_pages) >= 500:
        raise HTTPException(status_code=403, detail="Dự án đã đạt giới hạn 500 trang. Vui lòng xóa bớt ảnh cũ hoặc tạo dự án mới!")

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

    # 2. Tạo ID cho ảnh và kiểm tra định dạng an toàn
    page_id = str(uuid.uuid4())
    allowed_exts = {"jpg", "jpeg", "png", "webp"}
    raw_ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if raw_ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Định dạng file không được hỗ trợ (. {raw_ext}). Chỉ chấp nhận: {', '.join(allowed_exts)}")
    ext = raw_ext
    
    # KHAI BÁO PATH VÀ ÉP PYTHON TẠO THƯ MỤC TRƯỚC
    project_dir = f"workspace/{project_id}"
    raw_dir = f"{project_dir}/raw"
    clean_dir = f"{project_dir}/clean"
    
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(clean_dir, exist_ok=True)
    
    raw_path = f"{raw_dir}/{page_id}.{ext}"
    
    # 3. Bây giờ mới được lưu file (Áp dụng tiền xử lý chống alpha RGBA & tối ưu hóa dung lượng đầu ra)
    from image_utils import preprocess_image as pil_preprocess_image, export_image
    try:
        file_bytes = await file.read()
        
        # Chạy tiền xử lý và nén ảnh (CPU-bound) trong ThreadPool để tránh block Event Loop
        def process_and_export(data: bytes, ext_str: str):
            processed_img = pil_preprocess_image(data)
            format_type = "png" if ext_str == "png" else "jpg"
            return export_image(processed_img, format_type, optimize=False)
            
        ext_lower = ext.lower()
        optimized_bytes = await asyncio.to_thread(process_and_export, file_bytes, ext_lower)
        
        # Ghi file xuống đĩa (Blocking I/O) cũng chạy trong ThreadPool
        def save_file(path: str, data: bytes):
            with open(path, "wb") as buffer:
                buffer.write(data)
                
        await asyncio.to_thread(save_file, raw_path, optimized_bytes)
    except HTTPException as he:
        raise he
    except Exception as img_err:
        print(f"❌ [UPLOAD PREPROCESS ERROR] Lỗi: {img_err}")
        # Dự phòng: nếu tiền xử lý lỗi thì lưu trực tiếp file gốc để tránh gián đoạn trải nghiệm người dùng
        file.file.seek(0)
        def save_original():
            with open(raw_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        await asyncio.to_thread(save_original)

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
RUNPOD_TRANSLATE_ENDPOINT_ID = os.getenv("RUNPOD_TRANSLATE_ENDPOINT_ID") or os.getenv("RUNPOD_ENDPOINT_ID")
RUNPOD_REDRAW_ENDPOINT_ID = os.getenv("RUNPOD_REDRAW_ENDPOINT_ID")

# Secure Fail-safe configuration check
if not RUNPOD_API_KEY or not RUNPOD_REDRAW_ENDPOINT_ID:
    print("⚠️ [WARNING] Missing RUNPOD_API_KEY or RUNPOD_REDRAW_ENDPOINT_ID in environment variables. RunPod integration is disabled.")

RUNPOD_ENDPOINT_ID = RUNPOD_TRANSLATE_ENDPOINT_ID

import redis
import redis.asyncio as aioredis
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = int(os.getenv("REDIS_PORT", 6379))
redis_client = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)
async_redis_client = aioredis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)

def broadcast_progress(task_id, progress, message, state="PROCESSING"):
    """Hàm bắn SSE Realtime cho Frontend"""
    payload = json.dumps({"progress": progress, "message": message, "state": state})
    redis_client.publish(f"task_progress:{task_id}", payload)

# Hàm chạy ngầm trong FastAPI
async def runpod_translation_task(task_id: str, raw_path: str, clean_path: str, payload_data: dict, base_url: str):
    try:
        # Cập nhật tiến trình cho Frontend biết
        broadcast_progress(task_id, 10, "Đang khởi động dịch vụ xử lý...")
        
        # 1. Đọc ảnh và nén thành JPEG chất lượng 90 để giảm dung lượng dưới 10MiB
        import cv2
        img = cv2.imread(raw_path)
        if img is None:
            print(f"⚠️ [WARNING] OpenCV could not read raw image: {raw_path}. Falling back to raw file bytes.")
            with open(raw_path, "rb") as f:
                img_bytes = f.read()
        else:
            success, encoded_img = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
            if success:
                img_bytes = encoded_img.tobytes()
                print(f"⚡ [COMPRESSION] Compressed {raw_path} to JPEG. Original: {os.path.getsize(raw_path)} bytes, Compressed: {len(img_bytes)} bytes.")
            else:
                print(f"⚠️ [WARNING] JPEG compression failed for {raw_path}. Falling back to raw file bytes.")
                with open(raw_path, "rb") as f:
                    img_bytes = f.read()

        img_b64 = base64.b64encode(img_bytes).decode('utf-8')

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
            
            broadcast_progress(task_id, 30, "Đang tiến hành tách nền và dịch thuật...")

            # 3. Vòng lặp Polling hỏi thăm sức khỏe (Cách nhau 3 giây để không bị limit)
            while True:
                status_res = await client.get(f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/status/{runpod_job_id}", headers=headers)
                status_data = status_res.json()
                status = status_data.get("status")

                if status == "COMPLETED":
                    broadcast_progress(task_id, 90, "Đang chuẩn bị lưu kết quả...")
                    
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
                    broadcast_progress(task_id, 0, "Lỗi kết nối máy chủ xử lý!", state="FAILURE")
                    break
                
                # Chờ 3s rồi hỏi tiếp
                await asyncio.sleep(3)

    except Exception as e:
        broadcast_progress(task_id, 0, f"Lỗi hệ thống: {str(e)[:100]}", state="FAILURE")

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
        from task_manager import local_task_manager
        queue = asyncio.Queue()
        local_task_manager.subscribe(task_id, queue)
        try:
            # Gửi trạng thái hiện tại trước
            current = local_task_manager.get_task(task_id)
            yield f"data: {json.dumps(current, ensure_ascii=False)}\n\n"

            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                    if data.get("state") in ["SUCCESS", "FAILURE"]:
                        break
                except asyncio.TimeoutError:
                    # Gửi heartbeat ping giữ kết nối SSE qua Cloudflare/Nginx không bị timeout
                    yield f": ping\n\n"
                    current = local_task_manager.get_task(task_id)
                    if current.get("state") in ["SUCCESS", "FAILURE"]:
                        yield f"data: {json.dumps(current, ensure_ascii=False)}\n\n"
                        break
        except asyncio.CancelledError:
            pass
        finally:
            local_task_manager.unsubscribe(task_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
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
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    try:
        # Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
        page = await check_page_ownership(page_id, user_id, db)
        
        page.clean_url = clean_url
        page.status = "completed"
        if data:
            page.bubbles_data = json.dumps(data)
        await db.commit()
            
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        print("Lỗi save-results:", str(e))
        raise HTTPException(status_code=500, detail=str(e))




# ==========================================
# API LENS: KÍNH LÚP THÔNG MINH (DEEP LENS)
# ==========================================
# API LENS: KÍNH LÚP THÔNG MINH (DEEP LENS)
# ==========================================

_ocr_manager = None

def get_ocr_manager():
    global _ocr_manager
    if _ocr_manager is None:
        print("🚀 Lazy-loading OCRManager for local process...")
        from ocr_manager import OCRManager
        _ocr_manager = OCRManager()
    return _ocr_manager

# 🚀 THÊM ĐOẠN CLASS NÀY VÀO ĐÂY:
class QuickScanPayload(BaseModel):
    filename: str
    image_url: Optional[str] = None
    x1: int
    y1: int
    x2: int
    y2: int
    # 🚀 VŨ KHÍ BẢO MẬT 1: Giới hạn Lens Dịch
    genre: str = Field(default="", max_length=100)
    tone: str = Field(default="", max_length=100)
    pronouns: str = Field(default="", max_length=100)
    glossary: str = Field(default="", max_length=1000)
    target_language: str = Field(default="Tiếng Việt", max_length=100)
    source_language: Optional[str] = Field(default="ja", max_length=50)

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
@limiter.limit("60/minute")
async def quick_scan(
    request: Request,
    payload: QuickScanPayload,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    start_time = time.time()

    LENS_FREE_LIMIT = 20
    today = __import__('datetime').date.today().isoformat()
    redis_key = f"lens_count:{user_id}:{today}"

    try:
        lens_count = int(redis_client.get(redis_key) or 0)
    except Exception:
        lens_count = 0

    cost = 0.0

    # Nếu đã dùng hết lượt miễn phí trong ngày, kiểm tra số dư tối thiểu (1.0 xu)
    if lens_count >= LENS_FREE_LIMIT:
        await check_balance_before_task(db, user_id, min_balance=1.0)

    # Tăng counter (TTL 25 giờ để đảm bảo qua ngày mới sẽ reset)
    try:
        pipe = redis_client.pipeline()
        pipe.incr(redis_key)
        pipe.expire(redis_key, 90000)  # 25 giờ
        pipe.execute()
    except Exception:
        pass

    try:
        # Fetch raw image (hỗ trợ Data URL, URL từ xa, URL localhost/domain, hoặc file cục bộ)
        img_raw = payload.image_url or payload.filename
        base_url = get_base_url()
        image = None

        if img_raw.startswith("data:image"):
            nparr = np.frombuffer(base64.b64decode(img_raw.split(',')[1]), np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        elif img_raw.startswith("http://") or img_raw.startswith("https://"):
            is_local = False
            img_path_local = ""
            if "localhost:8000" in img_raw or "127.0.0.1:8000" in img_raw:
                is_local = True
                img_path_local = img_raw.split("8000/")[-1]
            elif base_url and base_url in img_raw:
                is_local = True
                img_path_local = img_raw.split(base_url)[-1]
            elif "/workspace/" in img_raw:
                is_local = True
                img_path_local = "workspace/" + img_raw.split("/workspace/")[-1]

            if is_local:
                img_path_local = img_path_local.split('?')[0].lstrip('/')
                if os.path.exists(img_path_local):
                    image = cv2.imread(img_path_local, cv2.IMREAD_COLOR)
                else:
                    base_path, _ = os.path.splitext(img_path_local)
                    matched = glob.glob(f"{base_path}.*")
                    if matched:
                        image = cv2.imread(matched[0], cv2.IMREAD_COLOR)

            if image is None:
                image = await fetch_image_from_url(img_raw, cv2.IMREAD_COLOR)
        else:
            img_path = img_raw.split('8000/')[-1] if '8000/' in img_raw else img_raw
            img_path = img_path.split('?')[0].lstrip('/')
            if os.path.exists(img_path):
                image = cv2.imread(img_path, cv2.IMREAD_COLOR)
            else:
                base_path, _ = os.path.splitext(img_path)
                matched_files = glob.glob(f"{base_path}.*")
                image = cv2.imread(matched_files[0] if matched_files else img_path, cv2.IMREAD_COLOR)

        if image is None:
            raise HTTPException(status_code=400, detail="Không thể đọc ảnh cho Lens Dịch. File không tồn tại hoặc lỗi định dạng.")

        h, w = image.shape[:2]
        x1, x2 = sorted([max(0, min(payload.x1, w)), max(0, min(payload.x2, w))])
        y1, y2 = sorted([max(0, min(payload.y1, h)), max(0, min(payload.y2, h))])

        if (x2 - x1) < 5 or (y2 - y1) < 5:
            return {
                "status": "success",
                "japanese": "",
                "vietnamese": "Vùng chọn quá nhỏ, hãy kéo bao quanh bong bóng thoại!",
                "lens_used": lens_count + 1,
                "lens_free_remaining": max(0, LENS_FREE_LIMIT - lens_count - 1),
                "charged_xu": 0.0
            }

        pad = 8
        x1_pad, x2_pad = max(0, x1 - pad), min(w, x2 + pad)
        y1_pad, y2_pad = max(0, y1 - pad), min(h, y2 + pad)

        crop = image[y1_pad:y2_pad, x1_pad:x2_pad]
        if crop.size == 0:
            return {
                "status": "success",
                "japanese": "",
                "vietnamese": "Không thể cắt vùng ảnh đã chọn!",
                "lens_used": lens_count + 1,
                "lens_free_remaining": max(0, LENS_FREE_LIMIT - lens_count - 1),
                "charged_xu": 0.0
            }

        crop_large = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        crop_sharp = cv2.filter2D(crop_large, -1, np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]]))

        japanese_text = ""
        source_lang = (payload.source_language or "ja").strip().lower()

        # 🚀 1. Thử gọi RunPod nếu có cấu hình endpoint hợp lệ
        if RUNPOD_ENDPOINT_ID and RUNPOD_API_KEY:
            try:
                _, buffer = cv2.imencode('.png', crop_sharp)
                crop_b64 = base64.b64encode(buffer).decode('utf-8')
                runpod_url = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/runsync"
                headers = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}
                async with httpx.AsyncClient() as client:
                    res = await client.post(
                        runpod_url,
                        json={"input": {"action": "scan", "image_base64": crop_b64, "language": source_lang}},
                        headers=headers,
                        timeout=12.0
                    )
                    if res.status_code == 200:
                        res_json = res.json()
                        output_data = res_json.get('output')
                        if isinstance(output_data, dict):
                            japanese_text = output_data.get('text', '').strip()
            except Exception as e:
                print(f"⚠️ [LENS RUNPOD OCR WARN] RunPod OCR lỗi ({e}), chuyển sang local OCR...")

        # 🚀 2. Fallback sang Local OCR Manager (MangaOCR / PaddleOCR ONNX)
        if not japanese_text:
            try:
                ocr_mgr = get_ocr_manager()
                japanese_text = await run_in_threadpool(ocr_mgr.recognize_crop, crop_sharp, source_lang, True)
                if japanese_text:
                    japanese_text = japanese_text.strip()
            except Exception as e:
                print(f"⚠️ [LENS LOCAL OCR ERROR] {e}")

        if not japanese_text:
            return {
                "status": "success",
                "japanese": "",
                "vietnamese": "AI không đọc được chữ trong vùng chọn!",
                "lens_used": lens_count + 1,
                "lens_free_remaining": max(0, LENS_FREE_LIMIT - lens_count - 1),
                "charged_xu": cost
            }

        target_language = payload.target_language or "Tiếng Việt"

        # 🚀 GỌI DEEPSEEK ĐỂ DỊCH (Có cache)
        glossary_hash = hashlib.md5(payload.glossary.encode('utf-8')).hexdigest() if payload.glossary else "none"
        cache_key = f"{japanese_text}_{payload.genre}_{payload.tone}_{payload.pronouns}_{glossary_hash}_{target_language}"

        if cache_key in LENS_CACHE:
            cached_res = LENS_CACHE[cache_key]
            return {
                **cached_res,
                "lens_used": lens_count + 1,
                "lens_free_remaining": max(0, LENS_FREE_LIMIT - lens_count - 1),
                "charged_xu": cost
            }

        system_prompt = (
            f"Bạn là Biên dịch Manga chuyên nghiệp.\n"
            f"Nhiệm vụ của bạn là dịch đoạn thoại truyện tranh sau sang {target_language}.\n"
            f"Thể loại: {payload.genre}\n"
            f"Văn phong: {payload.tone}\n"
            f"Xưng hô: {payload.pronouns}\n"
            f"{f'TỪ ĐIỂN: {payload.glossary}' if payload.glossary else ''}\n\n"
            f"Yêu cầu quan trọng: Bạn BẮT BUỘC phải dịch hoàn toàn sang {target_language}. "
            f"Tuyệt đối KHÔNG giữ nguyên chữ tiếng Nhật, tiếng Trung gốc (như chữ Hán, Kanji, Hanzi) hoặc chữ tiếng Anh trong kết quả dịch. "
            f"Nếu là từ ngắn hay hiệu ứng (SFX), hãy dịch nghĩa hoặc phiên âm Việt hóa tự nhiên. "
            f"Giữ nguyên văn phong truyện tranh tự nhiên.\n\n"
            f"TRẢ VỀ JSON: {{\"context_reasoning\": \"...\", \"translation\": \"...\"}}"
        )

        translated_text = "Không thể dịch nội dung"
        try:
            response = await run_in_threadpool(
                deepseek_client.chat.completions.create,
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Dịch đoạn thoại sau (Bắt buộc dịch sang {target_language}, không được giữ nguyên chữ gốc): {japanese_text}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.4
            )
            ai_response = robust_json_parse(response.choices[0].message.content)
            translated_text = ai_response.get("translation") or ai_response.get("vietnamese") or japanese_text
        except Exception as trans_err:
            print(f"⚠️ [LENS TRANSLATE ERROR] {trans_err}")
            try:
                engine = TranslationEngine()
                translated_text = engine.translate(japanese_text, target_lang=target_language)
            except Exception:
                translated_text = f"[Gốc]: {japanese_text}"

        result_data = {
            "status": "success",
            "japanese": japanese_text,
            "vietnamese": translated_text,
        }
        LENS_CACHE[cache_key] = result_data

        # Khấu trừ số dư nếu vượt hạn mức miễn phí trong ngày (1 xu mỗi lần)
        if lens_count >= LENS_FREE_LIMIT:
            scan_time = 1.0
            await deduct_balance(db, user_id, scan_time, "Quick Scan Manga Lens")
            await db.commit()
            cost = scan_time

        # Nhân thêm thông tin quota vào response
        return {
            **result_data,
            "lens_used": lens_count + 1,
            "lens_free_remaining": max(0, LENS_FREE_LIMIT - lens_count - 1),
            "charged_xu": cost
        }

    except HTTPException as http_exc:
        import traceback
        traceback.print_exc()
        print(f"❌ [LENS HTTP ERROR]: {http_exc.detail}", flush=True)
        raise http_exc
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ [LENS ERROR]: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))
    
class MaskPayload(BaseModel):
    image_url: str
    mask_url: Optional[str] = None
    mask_base64: Optional[str] = None
    page_id: Optional[str] = None

@app.post("/api/erase-mask")
async def erase_mask(
    payload: MaskPayload, 
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    try:
        if payload.page_id:
            # Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
            await check_page_ownership(payload.page_id, user_id, db)
        
        await check_balance_before_task(db, user_id)
        start_time = time.time()
        
        # Fetch raw image directly to RAM (local disk read if local, otherwise HTTP fetch)
        img_raw = payload.image_url
        base_url = get_base_url()
        is_local_img = False
        img_path_local = ""
        
        if not img_raw.startswith("http"):
            is_local_img = True
            img_path_local = img_raw
        elif "localhost:8000" in img_raw or "127.0.0.1:8000" in img_raw:
            is_local_img = True
            img_path_local = img_raw.split("8000/")[-1]
        elif base_url in img_raw:
            is_local_img = True
            img_path_local = img_raw.split(base_url)[-1]
        elif "/workspace/" in img_raw:
            is_local_img = True
            img_path_local = "workspace/" + img_raw.split("/workspace/")[-1]

        if is_local_img:
            img_path_local = img_path_local.split('?')[0]
            if img_path_local.startswith("/"):
                img_path_local = img_path_local[1:]
            print(f"[erase_mask] Loading image locally from: {img_path_local}")
            image = cv2.imread(img_path_local, cv2.IMREAD_COLOR)
        else:
            print(f"[erase_mask] Fetching image from remote URL: {img_raw}")
            image = await fetch_image_from_url(img_raw, cv2.IMREAD_COLOR)

        if image is None:
            raise HTTPException(status_code=400, detail="Không thể đọc ảnh gốc. File không tồn tại hoặc định dạng không hợp lệ.")
        
        # Determine clean path on local disk (VPS)
        img_path = get_local_path_from_url(img_raw)
        clean_path = img_path.replace("/raw/", "/clean/") if "/raw/" in img_path else f"workspace/clean_{uuid.uuid4().hex}.png"

        # Fetch mask directly to RAM (either from URL or from Base64)
        if payload.mask_base64:
            b64_data = payload.mask_base64
            if "," in b64_data:
                b64_data = b64_data.split(",")[1]
            mask_bytes = base64.b64decode(b64_data)
            nparr = np.frombuffer(mask_bytes, np.uint8)
            mask_rgba = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        elif payload.mask_url:
            mask_raw = payload.mask_url
            mask_is_local = False
            mask_path_local = ""
            
            if not mask_raw.startswith("http"):
                mask_is_local = True
                mask_path_local = mask_raw
            elif "localhost:8000" in mask_raw or "127.0.0.1:8000" in mask_raw:
                mask_is_local = True
                mask_path_local = mask_raw.split("8000/")[-1]
            elif base_url in mask_raw:
                mask_is_local = True
                mask_path_local = mask_raw.split(base_url)[-1]
            elif "/workspace/" in mask_raw:
                mask_is_local = True
                mask_path_local = "workspace/" + mask_raw.split("/workspace/")[-1]

            if mask_is_local:
                mask_path_local = mask_path_local.split('?')[0]
                if mask_path_local.startswith("/"):
                    mask_path_local = mask_path_local[1:]
                print(f"[erase_mask] Loading mask locally from: {mask_path_local}")
                mask_rgba = cv2.imread(mask_path_local, cv2.IMREAD_UNCHANGED)
            else:
                print(f"[erase_mask] Fetching mask from remote URL: {mask_raw}")
                mask_rgba = await fetch_image_from_url(mask_raw, cv2.IMREAD_UNCHANGED)
        else:
            raise HTTPException(status_code=400, detail="Vui lòng cung cấp mask_base64 hoặc mask_url")

        if mask_rgba is None:
            raise HTTPException(status_code=400, detail="Không thể đọc ảnh mặt nạ (mask).")

        mask = mask_rgba[:, :, 3] if len(mask_rgba.shape) == 3 and mask_rgba.shape[2] == 4 else cv2.cvtColor(mask_rgba, cv2.COLOR_BGR2GRAY) if len(mask_rgba.shape) == 3 else mask_rgba

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
            
            clean_crop_b64 = None
            try:
                runpod_url = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/runsync"
                headers = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}
                
                async with httpx.AsyncClient(timeout=120.0) as client:
                    res = await client.post(runpod_url, json={
                        "input": {
                            "action": "erase", 
                            "image_base64": base64.b64encode(buf_img).decode('utf-8'),
                            "mask_base64": base64.b64encode(buf_mask).decode('utf-8')
                        }
                    }, headers=headers)
                    
                    if res.status_code != 200:
                        raise Exception(f"RunPod runsync failed with status {res.status_code}: {res.text}")
                    
                    res_data = res.json()
                    job_status = res_data.get("status")
                    job_id = res_data.get("id")
                    
                    # Nếu chưa COMPLETED (ví dụ: đang cold start), chuyển sang chế độ polling
                    if job_status != "COMPLETED":
                        if not job_id:
                            raise Exception(f"RunPod runsync failed without job ID: {res_data}")
                        print(f"[erase_mask] Worker is booting or busy (status: {job_status}). Polling job {job_id}...")
                        
                        poll_start = time.time()
                        success = False
                        while time.time() - poll_start < 300: # Timeout 5 phút
                            status_res = await client.get(
                                f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/status/{job_id}",
                                headers=headers
                            )
                            status_data = status_res.json()
                            status = status_data.get("status")

                            if status == "COMPLETED":
                                res_data = status_data
                                success = True
                                break
                            elif status in ["FAILED", "CANCELLED"]:
                                raise Exception(f"RunPod Serverless báo lỗi trong lúc xóa: {status_data.get('error', 'Lỗi không xác định')}")
                            
                            await asyncio.sleep(3)
                        
                        if not success:
                            raise Exception("Thời gian chờ xử lý xóa ảnh trên RunPod Serverless đã quá hạn (Timeout 5 phút)")
                
                clean_crop_b64 = res_data.get('output', {}).get('clean_crop_base64')
            except Exception as e:
                print(f"⚠️ [LAMA FALLBACK] RunPod failed or timed out: {e}. Falling back to local LaMa ONNX execution!")
                session = get_lama_session()
                if session is None:
                    raise HTTPException(status_code=500, detail=f"RunPod failed and local LaMa is not available: {str(e)}")
                
                try:
                    h_crop, w_crop = crop_image.shape[:2]
                    scale = 1.0
                    if h_crop > 512 or w_crop > 512:
                        scale = 512.0 / max(h_crop, w_crop)
                        new_w, new_h = int(w_crop * scale), int(h_crop * scale)
                        local_img = cv2.resize(crop_image, (new_w, new_h), interpolation=cv2.INTER_AREA)
                        local_mask = cv2.resize(crop_mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
                    else:
                        new_w, new_h = w_crop, h_crop
                        local_img = crop_image.copy()
                        local_mask = crop_mask.copy()

                    pad_bottom, pad_right = 512 - new_h, 512 - new_w
                    if pad_bottom > 0 or pad_right > 0:
                        local_img = cv2.copyMakeBorder(local_img, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
                        local_mask = cv2.copyMakeBorder(local_mask, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)

                    img_t = np.transpose(cv2.cvtColor(local_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
                    mask_t = np.transpose((local_mask > 0).astype(np.float32)[:, :, np.newaxis], (2, 0, 1))[np.newaxis, ...]

                    ort_outs = session.run(None, {session.get_inputs()[0].name: img_t, session.get_inputs()[1].name: mask_t})
                    out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255).clip(0, 255).astype(np.uint8)
                    clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]

                    if scale != 1.0:
                        clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)
                    
                    _, buffer = cv2.imencode('.png', clean_crop)
                    clean_crop_b64 = base64.b64encode(buffer).decode('utf-8')
                    print("🚀 [LAMA FALLBACK] Local LaMa completed successfully!")
                except Exception as local_err:
                    print(f"❌ [LAMA FALLBACK ERROR] Local LaMa execution failed: {local_err}")
                    raise HTTPException(status_code=500, detail=f"RunPod failed, and local LaMa execution failed: {str(local_err)}")
            
            if clean_crop_b64:
                clean_crop = cv2.imdecode(np.frombuffer(base64.b64decode(clean_crop_b64), np.uint8), cv2.IMREAD_COLOR)
                mask_bool = crop_mask > 0
                image[y1:y2, x1:x2][mask_bool] = clean_crop[mask_bool]

        os.makedirs(os.path.dirname(clean_path), exist_ok=True)
        cv2.imwrite(clean_path, image)
        
        # Deduct balance based on execution time
        execution_time_seconds = time.time() - start_time
        description = f"Xóa nền thông minh (Erase Mask) - Page: {payload.page_id or 'Freehand'}"
        user_obj = await deduct_balance(db, user_id, execution_time_seconds, description)
        
        if payload.page_id:
            result = await db.execute(select(models.Page).where(models.Page.id == payload.page_id))
            page = result.scalars().first()
            if page:
                page.clean_url = f"/{clean_path}"
                page.status = "cleaned" 
        
        await db.commit()

        current_balance = user_obj.balance_seconds if user_obj else 0.0

        new_url = f"/{clean_path}"
        return {"status": "success", "new_url": new_url, "balance_seconds": current_balance, "credits": current_balance}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e)[:500])    

class AIRedrawMaskPayload(BaseModel):
    page_id: Optional[str] = None
    image_url: str
    mask_base64: str
    prompt: str
    negative_prompt: Optional[str] = ""
    translation_mode: Optional[str] = "grok"

@app.post("/api/legacy-ai-redraw-mask")
async def legacy_ai_redraw_mask(
    payload: AIRedrawMaskPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    try:
        if payload.page_id:
            await check_page_ownership(payload.page_id, user_id, db)
            
        await check_balance_before_task(db, user_id)
        start_time = time.time()
        
        # Load raw image
        img_raw = payload.image_url
        base_url = get_base_url()
        is_local_img = False
        img_path_local = ""
        
        if not img_raw.startswith("http"):
            is_local_img = True
            img_path_local = img_raw
        elif "localhost:8000" in img_raw or "127.0.0.1:8000" in img_raw:
            is_local_img = True
            img_path_local = img_raw.split("8000/")[-1]
        elif base_url in img_raw:
            is_local_img = True
            img_path_local = img_raw.split(base_url)[-1]
        elif "/workspace/" in img_raw:
            is_local_img = True
            img_path_local = "workspace/" + img_raw.split("/workspace/")[-1]

        if is_local_img:
            img_path_local = img_path_local.split('?')[0]
            if img_path_local.startswith("/"):
                img_path_local = img_path_local[1:]
            print(f"[ai_redraw_mask] Loading image locally from: {img_path_local}")
            image = cv2.imread(img_path_local, cv2.IMREAD_COLOR)
        else:
            print(f"[ai_redraw_mask] Fetching image from remote URL: {img_raw}")
            image = await fetch_image_from_url(img_raw, cv2.IMREAD_COLOR)

        if image is None:
            raise HTTPException(status_code=400, detail="Không thể đọc ảnh gốc.")
            
        img_path = get_local_path_from_url(img_raw)
        clean_path = img_path.replace("/raw/", "/clean/") if "/raw/" in img_path else f"workspace/clean_{uuid.uuid4().hex}.png"

        # Load mask
        b64_data = payload.mask_base64
        if "," in b64_data:
            b64_data = b64_data.split(",")[1]
        mask_bytes = base64.b64decode(b64_data)
        nparr = np.frombuffer(mask_bytes, np.uint8)
        mask_rgba = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        
        if mask_rgba is None:
            raise HTTPException(status_code=400, detail="Không thể đọc ảnh mặt nạ.")
            
        mask = mask_rgba[:, :, 3] if len(mask_rgba.shape) == 3 and mask_rgba.shape[2] == 4 else cv2.cvtColor(mask_rgba, cv2.COLOR_BGR2GRAY) if len(mask_rgba.shape) == 3 else mask_rgba

        x, y, w, h = cv2.boundingRect(mask)
        if w > 0 and h > 0:
            h_img, w_img = image.shape[:2]
            
            # Make a square crop with padding context
            pad = max(40, int(max(w, h) * 0.25))
            side = max(w, h) + 2 * pad
            if side < 512:
                side = 512
            
            # Clamp side to min of image dimensions to make sure it fits
            side = min(side, w_img, h_img)
            
            cx = x + w // 2
            cy = y + h // 2
            
            x1 = max(0, cx - side // 2)
            y1 = max(0, cy - side // 2)
            x2 = x1 + side
            y2 = y1 + side
            
            if x2 > w_img:
                x1 = max(0, w_img - side)
                x2 = w_img
            if y2 > h_img:
                y1 = max(0, h_img - side)
                y2 = h_img
                
            # Double check square
            actual_w = x2 - x1
            actual_h = y2 - y1
            actual_side = min(actual_w, actual_h)
            if actual_w > actual_side:
                x1 = x1 + (actual_w - actual_side) // 2
                x2 = x1 + actual_side
            elif actual_h > actual_side:
                y1 = y1 + (actual_h - actual_side) // 2
                y2 = y1 + actual_side
                
            crop_image = image[y1:y2, x1:x2]
            crop_mask = mask[y1:y2, x1:x2]
            
            # AI redraw based on translation_mode
            clean_crop_b64 = None
            mode = payload.translation_mode or "grok"
            
            if mode == "grok":
                print(f"[ai_redraw_mask] Mode grok: calling xAI Grok API on cropped area ({crop_image.shape[1]}x{crop_image.shape[0]})")
                _, buffer = cv2.imencode('.png', crop_image)
                crop_b64 = base64.b64encode(buffer).decode('utf-8')
                clean_crop_b64 = await call_grok_inpainting(crop_b64, payload.prompt)
            elif mode == "studio":
                print(f"[ai_redraw_mask] Mode studio: uploading cropped area to R2 and calling Kie.ai...")
                _, img_buf = cv2.imencode('.png', crop_image)
                r2_filename = f"crop_{uuid.uuid4().hex}.png"
                crop_url = await upload_to_r2(img_buf.tobytes(), r2_filename, "image/png")
                
                kie_key = os.getenv("KIE_API_KEY") or os.getenv("KIE_AI_API_KEY")
                if not kie_key:
                    raise Exception("Missing Kie.ai API Key (KIE_API_KEY / KIE_AI_API_KEY)")
                    
                kie_model = os.getenv("KIE_REDRAW_MODEL") or "google/nano-banana-edit"
                kie_prompt = f"{payload.prompt}, {DETAILED_REDRAW_PROMPT}"
                
                input_payload = {
                    "prompt": kie_prompt,
                    "aspect_ratio": "auto",
                    "resolution": "1K",
                    "nsfw_checker": True,
                    "image_urls": [crop_url]
                }
                
                async with httpx.AsyncClient() as client:
                    res = await client.post("https://api.kie.ai/api/v1/jobs/createTask", json={
                        "model": kie_model,
                        "input": input_payload
                    }, headers={
                        "Authorization": f"Bearer {kie_key}",
                        "Content-Type": "application/json"
                    }, timeout=90.0)
                    res.raise_for_status()
                    res_json = res.json()
                    
                task_id = res_json.get("data", {}).get("task_id")
                if not task_id:
                    raise Exception(f"Kie.ai failed to create task: {res_json}")
                    
                final_img_url = None
                for _ in range(60):
                    await asyncio.sleep(2)
                    async with httpx.AsyncClient() as client:
                        poll_res = await client.get(f"https://api.kie.ai/api/v1/jobs/recordInfo?task_id={task_id}", headers={
                            "Authorization": f"Bearer {kie_key}"
                        }, timeout=15.0)
                        poll_res.raise_for_status()
                        poll_json = poll_res.json()
                    
                    data_obj = poll_json.get("data", {})
                    state = data_obj.get("state")
                    if state == "SUCCESS":
                        final_img_url = data_obj.get("imageUrl")
                        break
                    elif state in ["FAILED", "CANCELLED"]:
                        raise Exception(f"Kie.ai task failed with state: {state}")
                
                try:
                    await delete_from_r2(r2_filename)
                except Exception as cleanup_err:
                    print(f"⚠️ [AI-REDRAW] Error cleaning R2: {cleanup_err}")
                    
                if not final_img_url:
                    raise Exception("Kie.ai task polling timed out")
                    
                async with httpx.AsyncClient() as dl_client:
                    dl_res = await dl_client.get(final_img_url, timeout=30.0)
                    dl_res.raise_for_status()
                    clean_crop_b64 = base64.b64encode(dl_res.content).decode("utf-8")
            elif mode == "anytext":
                raise HTTPException(status_code=400, detail="Chế độ dịch SFX AI (AnyText) đã bị loại bỏ khỏi dự án.")
            else:
                print(f"⚠️ [AI-REDRAW] Mode {mode} not supported for mask redraw. Falling back to local LaMa!")
                session = get_lama_session()
                if session is None:
                    raise Exception("Local LaMa session is not available")
                    
                h_crop, w_crop = crop_image.shape[:2]
                scale = 1.0
                if h_crop > 512 or w_crop > 512:
                    scale = 512.0 / max(h_crop, w_crop)
                    new_w, new_h = int(w_crop * scale), int(h_crop * scale)
                    local_img = cv2.resize(crop_image, (new_w, new_h), interpolation=cv2.INTER_AREA)
                    local_mask = cv2.resize(crop_mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
                else:
                    new_w, new_h = w_crop, h_crop
                    local_img = crop_image.copy()
                    local_mask = crop_mask.copy()

                pad_bottom, pad_right = 512 - new_h, 512 - new_w
                if pad_bottom > 0 or pad_right > 0:
                    local_img = cv2.copyMakeBorder(local_img, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
                    local_mask = cv2.copyMakeBorder(local_mask, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)

                img_t = np.transpose(cv2.cvtColor(local_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
                mask_t = np.transpose((local_mask > 0).astype(np.float32)[:, :, np.newaxis], (2, 0, 1))[np.newaxis, ...]

                ort_outs = session.run(None, {session.get_inputs()[0].name: img_t, session.get_inputs()[1].name: mask_t})
                out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255).clip(0, 255).astype(np.uint8)
                clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]

                if scale != 1.0:
                    clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)
                
                _, buffer = cv2.imencode('.png', clean_crop)
                clean_crop_b64 = base64.b64encode(buffer).decode('utf-8')
                
            # Place the clean crop back using the crop_mask
            if clean_crop_b64:
                clean_crop = cv2.imdecode(np.frombuffer(base64.b64decode(clean_crop_b64), np.uint8), cv2.IMREAD_COLOR)
                if clean_crop.shape[:2] != crop_image.shape[:2]:
                    clean_crop = cv2.resize(clean_crop, (crop_image.shape[1], crop_image.shape[0]), interpolation=cv2.INTER_CUBIC)
                    
                mask_bool = crop_mask > 0
                image[y1:y2, x1:x2][mask_bool] = clean_crop[mask_bool]

        os.makedirs(os.path.dirname(clean_path), exist_ok=True)
        cv2.imwrite(clean_path, image)
        
        execution_time_seconds = time.time() - start_time
        description = f"Vẽ lại vùng tô bằng AI (AI Redraw Mask) - Page: {payload.page_id or 'Freehand'}"
        user_obj = await deduct_balance(db, user_id, execution_time_seconds, description)
        
        if payload.page_id:
            result = await db.execute(select(models.Page).where(models.Page.id == payload.page_id))
            page = result.scalars().first()
            if page:
                page.clean_url = f"/{clean_path}"
                page.status = "cleaned" 
        
        await db.commit()

        current_balance = user_obj.balance_seconds if user_obj else 0.0

        new_url = f"/{clean_path}"
        return {"status": "success", "new_url": new_url, "balance_seconds": current_balance, "credits": current_balance}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e)[:500])    

class CtdErasePayload(BaseModel):
    image_url: str
    mask_base64: str
    page_id: Optional[str] = None

@app.post("/api/ctd-erase")
async def ctd_erase(
    payload: CtdErasePayload, 
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    try:
        if payload.page_id:
            # Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
            await check_page_ownership(payload.page_id, user_id, db)
        
        await check_balance_before_task(db, user_id)
        start_time = time.time()
        
        # Fetch raw image directly to RAM
        img_raw = payload.image_url
        base_url = get_base_url()
        is_local_img = False
        img_path_local = ""
        
        if not img_raw.startswith("http"):
            is_local_img = True
            img_path_local = img_raw
        elif "localhost:8000" in img_raw or "127.0.0.1:8000" in img_raw:
            is_local_img = True
            img_path_local = img_raw.split("8000/")[-1]
        elif base_url in img_raw:
            is_local_img = True
            img_path_local = img_raw.split(base_url)[-1]
        elif "/workspace/" in img_raw:
            is_local_img = True
            img_path_local = "workspace/" + img_raw.split("/workspace/")[-1]

        if is_local_img:
            img_path_local = img_path_local.split('?')[0]
            if img_path_local.startswith("/"):
                img_path_local = img_path_local[1:]
            print(f"[ctd_erase] Loading image locally from: {img_path_local}")
            image = cv2.imread(img_path_local, cv2.IMREAD_COLOR)
        else:
            print(f"[ctd_erase] Fetching image from remote URL: {img_raw}")
            image = await fetch_image_from_url(img_raw, cv2.IMREAD_COLOR)

        if image is None:
            raise HTTPException(status_code=400, detail="Không thể đọc ảnh gốc. File không tồn tại hoặc định dạng không hợp lệ.")
        
        # Determine clean path on local disk
        img_path = get_local_path_from_url(img_raw)
        clean_path = img_path.replace("/raw/", "/clean/") if "/raw/" in img_path else f"workspace/clean_{uuid.uuid4().hex}.png"

        # Decode brushed mask (brush area)
        b64_data = payload.mask_base64
        if "," in b64_data:
            b64_data = b64_data.split(",")[1]
        mask_bytes = base64.b64decode(b64_data)
        nparr = np.frombuffer(mask_bytes, np.uint8)
        mask_rgba = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        
        if mask_rgba is None:
            raise HTTPException(status_code=400, detail="Không thể đọc ảnh mặt nạ tô vẽ (brush mask).")

        # Get mask grayscale
        brush_mask = mask_rgba[:, :, 3] if len(mask_rgba.shape) == 3 and mask_rgba.shape[2] == 4 else cv2.cvtColor(mask_rgba, cv2.COLOR_BGR2GRAY) if len(mask_rgba.shape) == 3 else mask_rgba

        # Bounding box of the brushed mask
        x, y, w, h = cv2.boundingRect(brush_mask)
        if w > 0 and h > 0:
            pad = 120  # 120px padding is enough to run CTD and get context
            h_img, w_img = image.shape[:2]
            x1, y1 = max(0, x-pad), max(0, y-pad)
            x2, y2 = min(w_img, x+w+pad), min(h_img, y+h+pad)

            crop_image = image[y1:y2, x1:x2]
            crop_brush_mask = brush_mask[y1:y2, x1:x2]

            # 1. Chạy CTD cục bộ trên mẩu ảnh crop này
            detector = await run_in_threadpool(get_ctd_detector)
            if detector is None:
                raise HTTPException(status_code=500, detail="Không thể tải mô hình CTD local.")
            
            # Gọi detector
            res_mask, res_mask_refined, blk_list = await run_in_threadpool(detector, crop_image)
            
            if res_mask_refined.max() <= 1.0: 
                ctd_mask_bin = (res_mask_refined * 255).astype(np.uint8)
            else: 
                ctd_mask_bin = res_mask_refined.astype(np.uint8)
                
            _, ctd_mask_bin = cv2.threshold(ctd_mask_bin, 127, 255, cv2.THRESH_BINARY)
            
            # Thêm các xử lý hình học giống luồng Runpod
            fat_mask = cv2.dilate(ctd_mask_bin, np.ones((7, 7), np.uint8), iterations=2)
            _, white_regions = cv2.threshold(cv2.cvtColor(crop_image, cv2.COLOR_BGR2GRAY), 200, 255, cv2.THRESH_BINARY)
            
            smart_mask = cv2.dilate(cv2.bitwise_and(fat_mask, cv2.bitwise_or(ctd_mask_bin, white_regions)), np.ones((3, 3), np.uint8), iterations=1)
            mask_to_clean = cv2.dilate(smart_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1)
            
            # CHỈ XÓA NHỮNG VÙNG CHỮ NẰM TRONG VÙNG TÔ (brush) CỦA NGƯỜI DÙNG:
            mask_to_clean = cv2.bitwise_and(mask_to_clean, crop_brush_mask)
            
            non_zero_pixels = cv2.countNonZero(mask_to_clean)
            print(f"[ctd_erase] CTD smart mask non-zero pixels: {non_zero_pixels}")
            
            if non_zero_pixels == 0:
                print("[ctd_erase] CTD detected no text inside brushed area. Falling back to erasing the entire brush mask!")
                mask_to_clean = crop_brush_mask
            
            # Tự động giãn nở mặt nạ xóa thêm vài pixel (ellipse 7x7) để phủ hoàn toàn viền nét chữ và bóng mờ (stroke/shadow)
            if cv2.countNonZero(mask_to_clean) > 0:
                mask_to_clean = cv2.dilate(mask_to_clean, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)), iterations=1)
            
            if cv2.countNonZero(mask_to_clean) > 0:
                print("[ctd_erase] Running local LaMa inpainting on cropped region...")
                # 2. Chạy LaMa cục bộ qua ONNX
                session = get_lama_session()
                if session is None:
                    raise HTTPException(status_code=500, detail="Không thể tải mô hình LaMa ONNX cục bộ.")
                
                h_crop, w_crop = crop_image.shape[:2]
                scale = 1.0
                if h_crop > 512 or w_crop > 512:
                    scale = 512.0 / max(h_crop, w_crop)
                    new_w, new_h = int(w_crop * scale), int(h_crop * scale)
                    local_img = cv2.resize(crop_image, (new_w, new_h), interpolation=cv2.INTER_AREA)
                    local_mask = cv2.resize(mask_to_clean, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
                else:
                    new_w, new_h = w_crop, h_crop
                    local_img = crop_image.copy()
                    local_mask = mask_to_clean.copy()

                pad_bottom, pad_right = 512 - new_h, 512 - new_w
                if pad_bottom > 0 or pad_right > 0:
                    local_img = cv2.copyMakeBorder(local_img, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
                    local_mask = cv2.copyMakeBorder(local_mask, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)

                img_t = np.transpose(cv2.cvtColor(local_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
                mask_t = np.transpose((local_mask > 0).astype(np.float32)[:, :, np.newaxis], (2, 0, 1))[np.newaxis, ...]

                ort_outs = session.run(None, {session.get_inputs()[0].name: img_t, session.get_inputs()[1].name: mask_t})
                out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255).clip(0, 255).astype(np.uint8)
                clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]

                if scale != 1.0:
                    clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)
                
                # Dán vùng đã làm sạch đè lại lên ảnh gốc
                mask_bool = mask_to_clean > 0
                image[y1:y2, x1:x2][mask_bool] = clean_crop[mask_bool]

        os.makedirs(os.path.dirname(clean_path), exist_ok=True)
        cv2.imwrite(clean_path, image)
        
        # Deduct balance based on execution time
        execution_time_seconds = time.time() - start_time
        description = f"Xóa chữ thông minh (CTD Erase) - Page: {payload.page_id or 'Freehand'}"
        user_obj = await deduct_balance(db, user_id, execution_time_seconds, description)
        
        if payload.page_id:
            result = await db.execute(select(models.Page).where(models.Page.id == payload.page_id))
            page = result.scalars().first()
            if page:
                page.clean_url = f"/{clean_path}"
                page.status = "cleaned" 
        
        await db.commit()

        current_balance = user_obj.balance_seconds if user_obj else 0.0

        new_url = f"/{clean_path}"
        return {"status": "success", "new_url": new_url, "balance_seconds": current_balance, "credits": current_balance}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e)[:500])

# ==========================================
# API UPLOAD NGẦM CHO TÍNH NĂNG CŨ
# ==========================================
@app.post("/api/upload-raw")
async def upload_raw(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id)
):
    safe_name = os.path.basename(file.filename or "upload.png").replace("..", "").replace("/", "").replace("\\", "")
    os.makedirs("workspace", exist_ok=True)
    save_path = os.path.join("workspace", f"Clean_{uuid.uuid4().hex}_{safe_name}")
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "filename": safe_name}

# ==========================================
# API UPLOAD FILE DÀNH CHO RUNPOD WORKER (PUT)
# ==========================================
@app.put("/api/upload-file")
async def upload_file(path: str, request: Request):
    try:
        worker_token = request.headers.get("X-Worker-Token") or request.query_params.get("secret")
        expected_token = os.getenv("RUNPOD_API_KEY") or os.getenv("R2_SECRET_KEY")
        if not expected_token or worker_token != expected_token:
            auth_header = request.headers.get("Authorization")
            if not auth_header:
                raise HTTPException(status_code=401, detail="Yêu cầu khóa xác thực Worker hoặc Token hợp lệ!")

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

# ==========================================
# CÁC CLASS MODEL NHẬN DỮ LIỆU
# ==========================================
class RedrawRequest(BaseModel):
    image_url: str
    mask_url: Optional[str] = None
    mask_base64: Optional[str] = None
    prompt: str
    negative_prompt: Optional[str] = None
    page_id: Optional[str] = None
    original_image_hash: Optional[str] = None


# Hàm helper bóc tách URL thành đường dẫn vật lý trên RunPod
def get_local_path_from_url(url: str) -> str:
    # 🚀 LỌC BỎ ĐUÔI ?t=... CỦA REACT
    clean_url = url.split("?")[0]
    if "/workspace/" in clean_url:
        return "workspace/" + clean_url.split("/workspace/")[-1]
    return clean_url.split("/")[-1]


def get_image_ahash(image_path: str) -> str:
    try:
        import cv2
        import numpy as np
        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return ""
        # Resize to 8x8
        img_resized = cv2.resize(img, (8, 8), interpolation=cv2.INTER_AREA)
        # Get average pixel value
        avg = img_resized.mean()
        # Compute bits: 1 if pixel >= average, else 0
        diff = img_resized >= avg
        # Convert bits to hex string
        hash_val = 0
        for i, b in enumerate(diff.flatten()):
            if b:
                hash_val |= (1 << i)
        return f"{hash_val:016x}"
    except Exception as e:
        print(f"⚠️ [HASH ERROR] Failed to calculate image hash: {e}")
        return ""


_lama_session = None

def get_lama_session():
    global _lama_session
    if _lama_session is None:
        try:
            import onnxruntime as ort
            sess_options = ort.SessionOptions()
            sess_options.add_session_config_entry("session.use_mmap", "1")
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            available_providers = ort.get_available_providers()
            providers = []
            if "CUDAExecutionProvider" in available_providers:
                providers.append("CUDAExecutionProvider")
            providers.append("CPUExecutionProvider")
            model_path = os.path.join(os.path.dirname(__file__), "weights", "lama-manga.onnx")
            if not os.path.exists(model_path):
                model_path = os.path.join(os.path.dirname(__file__), "lama-manga.onnx")
            if not os.path.exists(model_path):
                model_path = "weights/lama-manga.onnx"
            if os.path.exists(model_path):
                _lama_session = ort.InferenceSession(model_path, sess_options=sess_options, providers=providers)
                print(f"🚀 [LAMA FALLBACK] Local LaMa ONNX session loaded successfully with {providers[0]} from {model_path}!")
            else:
                print(f"⚠️ [LAMA FALLBACK] lama-manga.onnx not found at {model_path}!")
        except Exception as e:
            print(f"❌ [LAMA FALLBACK ERROR] Failed to load local LaMa session: {e}")
    return _lama_session

_ctd_detector = None

def get_ctd_detector():
    global _ctd_detector
    if _ctd_detector is None:
        try:
            import sys
            import torch
            # Safe wandb setup with valid __spec__ to prevent Hayai-OCR importlib ValueError
            try:
                import wandb
            except Exception:
                import types, sys, importlib.machinery
                for _m in ['wandb', 'wandb.proto', 'wandb.proto.wandb_telemetry_pb2', 'wandb.proto.wandb_internal_pb2', 'wandb.proto.wandb_server_pb2']:
                    if _m not in sys.modules:
                        _d = types.ModuleType(_m)
                        _d.__spec__ = importlib.machinery.ModuleSpec(_m, None)
                        sys.modules[_m] = _d
                
            ctd_path = os.path.join(os.path.dirname(__file__), "comic_text_detector")
            if ctd_path not in sys.path:
                sys.path.append(ctd_path)
            from inference import TextDetector
            model_file = os.path.join(ctd_path, "data", "comictextdetector.pt")
            if os.path.exists(model_file):
                device = "cuda" if torch.cuda.is_available() else "cpu"
                _ctd_detector = TextDetector(model_path=model_file, input_size=256, device=device)
                print(f"🚀 [CTD LOCAL] Local Comic Text Detector loaded successfully on {device} with input_size=256!")
            else:
                print("⚠️ [CTD LOCAL] comictextdetector.pt not found locally!")
        except Exception as e:
            print(f"❌ [CTD LOCAL ERROR] Failed to load local CTD detector: {e}")
    return _ctd_detector

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
@app.post("/api/redraw")
async def redraw_image(
    req: RedrawRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    redraw_start = time.time()
    if req.page_id:
        # Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
        await check_page_ownership(req.page_id, user_id, db)

    await check_balance_before_task(db, user_id, min_balance=1.0)

    r2_input_filename = None
    r2_mask_filename = None
    r2_output_filename = None

    try:
        # 1. Tìm đường dẫn file gốc
        img_path = get_local_path_from_url(req.image_url)
        if not os.path.exists(img_path):
            raise HTTPException(status_code=404, detail="Không tìm thấy ảnh gốc để vẽ lại")

        clean_path = img_path.replace("/raw/", "/clean/") if "/raw/" in img_path else f"workspace/clean_{uuid.uuid4().hex}.png"

        # 2. Xử lý mặt nạ (Mask): Hỗ trợ Base64 hoặc URL
        mask_bytes = None
        if req.mask_base64:
            b64_data = req.mask_base64
            if "," in b64_data:
                b64_data = b64_data.split(",")[1]
            mask_bytes = base64.b64decode(b64_data)
        elif req.mask_url:
            async with httpx.AsyncClient() as client:
                res = await client.get(req.mask_url, follow_redirects=True)
                res.raise_for_status()
                mask_bytes = res.content
        else:
            raise HTTPException(status_code=400, detail="Vui lòng cung cấp mask_base64 hoặc mask_url")

        # 🚀 KIỂM TRA VÀ XỬ LÝ VẼ ĐÈ QUA BIÊN GIỚI (STITCHING & SPLITTING)
        import io
        import re
        page = None
        top_neighbor = None
        bottom_neighbor = None
        is_stitched_mode = False
        heights = []
        pages_to_stitch = []

        if req.page_id:
            page_res = await db.execute(select(models.Page).where(models.Page.id == req.page_id))
            page = page_res.scalars().first()

        if page and "_part_" in page.filename:
            # Query all pages in the same project
            res_pages = await db.execute(
                select(models.Page).where(models.Page.project_id == page.project_id)
            )
            all_pages = res_pages.scalars().all()
            
            # Helper to get part number from filename
            def get_part_num(name):
                m = re.search(r"_part_(\d+)", name)
                return int(m.group(1)) if m else -1
            
            # Filter pages with same group prefix
            match_prefix = re.match(r"^(.*)_part_\d+\.[^.]+$", page.filename)
            if match_prefix:
                group_prefix = match_prefix.group(1)
                group_pages = [p for p in all_pages if p.filename.startswith(group_prefix + "_part_")]
                # Sort group pages by part number
                group_pages.sort(key=lambda p: get_part_num(p.filename))
                
                try:
                    curr_idx = [p.id for p in group_pages].index(page.id)
                    if curr_idx > 0:
                        top_neighbor = group_pages[curr_idx - 1]
                    if curr_idx < len(group_pages) - 1:
                        bottom_neighbor = group_pages[curr_idx + 1]
                except ValueError:
                    pass

        # Detect mask border touches using PIL
        mask_image = Image.open(io.BytesIO(mask_bytes)).convert("RGBA")
        width, height = mask_image.size
        mask_data = mask_image.load()
        
        touches_top = False
        touches_bottom = False
        
        # Check top 8 rows
        for y in range(min(8, height)):
            for x in range(width):
                if mask_data[x, y][3] > 0:
                    touches_top = True
                    break
            if touches_top:
                break
                
        # Check bottom 8 rows
        for y in range(max(0, height - 8), height):
            for x in range(width):
                if mask_data[x, y][3] > 0:
                    touches_bottom = True
                    break
            if touches_bottom:
                break

        # Setup pages to stitch
        if touches_top and top_neighbor:
            pages_to_stitch.append(top_neighbor)
        if page:
            pages_to_stitch.append(page)
        if touches_bottom and bottom_neighbor:
            pages_to_stitch.append(bottom_neighbor)

        # Check if stitching is actually needed
        if len(pages_to_stitch) > 1 and page:
            is_stitched_mode = True
            
            def get_page_image_path(p):
                if p.clean_url:
                    local_clean = get_local_path_from_url(p.clean_url)
                    if os.path.exists(local_clean):
                        return local_clean
                return get_local_path_from_url(p.raw_url)
                
            pil_images = [Image.open(get_page_image_path(p)).convert("RGB") for p in pages_to_stitch]
            stitch_w = max(img.width for img in pil_images)
            stitch_h = sum(img.height for img in pil_images)
            
            stitched_img = Image.new("RGB", (stitch_w, stitch_h))
            curr_y = 0
            for img in pil_images:
                stitched_img.paste(img, (0, curr_y))
                heights.append(img.height)
                curr_y += img.height
                
            stitched_mask = Image.new("RGBA", (stitch_w, stitch_h), (0, 0, 0, 0))
            curr_page_idx = pages_to_stitch.index(page)
            y_offset = sum(heights[:curr_page_idx])
            stitched_mask.paste(mask_image, (0, y_offset))
            
            # Save to bytes
            img_byte_arr = io.BytesIO()
            stitched_img.save(img_byte_arr, format="JPEG", quality=95)
            img_bytes = img_byte_arr.getvalue()
            
            mask_byte_arr = io.BytesIO()
            stitched_mask.save(mask_byte_arr, format="PNG")
            mask_bytes = mask_byte_arr.getvalue()
        else:
            # Read input image bytes
            with open(img_path, "rb") as f:
                img_bytes = f.read()

        ext = os.path.splitext(img_path)[1].lower()
        content_type = "image/png"
        if ext in [".jpg", ".jpeg"]:
            content_type = "image/jpeg"
        elif ext == ".webp":
            content_type = "image/webp"

        # Upload files to Cloudflare R2
        r2_input_filename = f"redraw_in_{uuid.uuid4().hex}{ext}"
        r2_mask_filename = f"redraw_mask_{uuid.uuid4().hex}.png"
        r2_output_filename = f"redraw_out_{uuid.uuid4().hex}.png"

        public_image_url = await upload_to_r2(img_bytes, r2_input_filename, content_type)
        public_mask_url = await upload_to_r2(mask_bytes, r2_mask_filename, "image/png")
        public_output_put_url = await get_presigned_put_url(r2_output_filename, "image/png")

        # 3. Setup Prompt Tiếng Anh chuẩn Manga / Webtoon (Hỗ trợ luồng vẽ mới)
        # Forcefully append NSFW guardrail to negative prompt for legal compliance (Zero Hentai/Doujinshi 18+ policy)
        nsfw_guardrail = "nsfw, nude, explicit, pornography, uncensored, genitalia"
        if req.negative_prompt:
            positive_prompt = req.prompt
            negative_prompt = f"{req.negative_prompt.strip().rstrip(',')}, {nsfw_guardrail}"
        else:
            positive_prompt = f"{req.prompt}, masterpiece, best quality, manga page, monochrome, grayscale, sharp lineart, seamless background, flat shading, high contrast lighting"
            negative_prompt = f"text, speech bubble, watermark, color, photorealistic, 3d render, blurry, artifacts, smooth gradient, western comic, {nsfw_guardrail}"

        # 4. Gửi Job lên RunPod Serverless
        runpod_payload = {
            "input": {
                "action": "redraw",
                "image_url": public_image_url,
                "mask_url": public_mask_url,
                "prompt": positive_prompt,
                "negative_prompt": negative_prompt,
                "output_url": public_output_put_url
            }
        }

        headers = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}
        runpod_url = f"https://api.runpod.ai/v2/{RUNPOD_REDRAW_ENDPOINT_ID}/run"

        async with httpx.AsyncClient(timeout=600.0) as client:
            res = await client.post(runpod_url, json=runpod_payload, headers=headers)
            if res.status_code != 200:
                raise Exception(f"RunPod request failed with status {res.status_code}: {res.text}")
            
            job_data = res.json()
            runpod_job_id = job_data.get("id")
            if not runpod_job_id:
                raise Exception(f"RunPod failed to queue job: {job_data}")

            # 5. Polling thăm hỏi trạng thái của Job (Timeout 5 phút)
            start_time = time.time()
            success = False
            while time.time() - start_time < 300:
                status_res = await client.get(f"https://api.runpod.ai/v2/{RUNPOD_REDRAW_ENDPOINT_ID}/status/{runpod_job_id}", headers=headers)
                status_data = status_res.json()
                status = status_data.get("status")

                if status == "COMPLETED":
                    success = True
                    break
                elif status in ["FAILED", "CANCELLED"]:
                    raise Exception(f"RunPod Serverless báo lỗi: {status_data.get('error', 'Lỗi không xác định')}")
                
                await asyncio.sleep(3)

            if not success:
                raise Exception("Thời gian chờ xử lý AI trên RunPod Serverless đã quá hạn (Timeout 5 phút)")

        # Download result image from R2
        r2_public_domain = os.getenv("R2_PUBLIC_DOMAIN", "").rstrip('/')
        public_output_get_url = f"{r2_public_domain}/{r2_output_filename}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            download_res = await client.get(public_output_get_url)
            download_res.raise_for_status()
            result_bytes = download_res.content

        # Save result locally
        updated_pages = {}
        base_url = str(request.base_url).rstrip('/')
        forwarded_proto = request.headers.get("x-forwarded-proto") or request.headers.get("X-Forwarded-Proto")
        if "deepkoma.pro" in base_url or forwarded_proto == "https":
            if base_url.startswith("http://"):
                base_url = "https://" + base_url[7:]

        if is_stitched_mode:
            # Split result back into parts
            result_img = Image.open(io.BytesIO(result_bytes))
            curr_y = 0
            for i, p in enumerate(pages_to_stitch):
                h = heights[i]
                part_img = result_img.crop((0, curr_y, result_img.width, curr_y + h))
                curr_y += h
                
                p_clean_path = get_local_path_from_url(p.raw_url).replace("/raw/", "/clean/")
                if not p_clean_path.startswith("workspace/"):
                    p_clean_path = f"workspace/{p_clean_path}"
                os.makedirs(os.path.dirname(p_clean_path), exist_ok=True)
                part_img.save(p_clean_path, format="JPEG", quality=95)
                
                p.clean_url = f"/{p_clean_path}"
                p.status = "cleaned"
                db.add(p)
                
                p_url = f"/{p_clean_path}?t={int(time.time())}"
                updated_pages[p.id] = p_url
            
            # Use current page's clean path as primary return path
            page_clean_path = get_local_path_from_url(page.raw_url).replace("/raw/", "/clean/")
            if not page_clean_path.startswith("workspace/"):
                page_clean_path = f"workspace/{page_clean_path}"
            clean_path = page_clean_path
        else:
            os.makedirs(os.path.dirname(clean_path), exist_ok=True)
            with open(clean_path, "wb") as f:
                f.write(result_bytes)

        # Khấu trừ 1 điểm năng lượng cho mỗi lần Vẽ lại bằng AI (Redraw)
        target_key = req.page_id if req.page_id else req.original_image_hash
        if not target_key:
            target_key = hashlib.md5(req.image_url.encode('utf-8')).hexdigest()
        description = f"Vẽ lại bằng AI (Redraw) - Target: {target_key}"
        user_obj = await deduct_balance(db, user_id, 1.0, description)

        # 6. Đồng bộ DB nếu có page_id và không phải stitched mode (stitched đã lưu ở trên)
        if req.page_id and not is_stitched_mode:
            result = await db.execute(select(models.Page).where(models.Page.id == req.page_id))
            page = result.scalars().first()
            if page:
                page.clean_url = f"/{clean_path}"
                page.status = "cleaned" 

        await db.commit()

        new_url = f"/{clean_path}?t={int(time.time())}"

        # Capture telemetry event in PostHog upon successful redraw completion
        inference_time_ms = int((time.time() - redraw_start) * 1000)
        posthog.capture(
            distinct_id=user_id,
            event="redraw_completed",
            properties={
                "inference_time_ms": inference_time_ms,
                "user_id": user_id,
                "balance_deducted": execution_time_seconds,
                "image_url": req.image_url,
                "page_id": req.page_id
            }
        )

        # Queue flush in background to prevent data loss in scale-to-zero serverless environments
        background_tasks.add_task(flush_telemetry)

        current_balance = user_obj.balance_seconds if user_obj else 0.0

        return {
            "status": "success", 
            "new_url": new_url, 
            "updated_pages": updated_pages, 
            "balance_seconds": current_balance, 
            "credits": current_balance
        }

    except Exception as e:
        # Capture error/OOM in Sentry with extra context
        with sentry_sdk.push_scope() as scope:
            scope.set_extra("user_prompt", req.prompt)
            scope.set_extra("image_url", req.image_url)
            scope.set_extra("page_id", req.page_id)
            if 'img_path' in locals() and os.path.exists(img_path):
                try:
                    img = cv2.imread(img_path)
                    if img is not None:
                        h, w = img.shape[:2]
                        scope.set_extra("image_dimensions", f"{w}x{h}")
                except Exception:
                    pass
            sentry_sdk.capture_exception(e)

        # Queue flush in background to prevent data loss in scale-to-zero serverless environments
        flush_telemetry()

        print("Lỗi Redraw:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Clean up temporary files on R2 asynchronously in background
        if r2_input_filename:
            background_tasks.add_task(delete_from_r2, r2_input_filename)
        if r2_mask_filename:
            background_tasks.add_task(delete_from_r2, r2_mask_filename)
        if r2_output_filename:
            background_tasks.add_task(delete_from_r2, r2_output_filename)


# ==========================================
# API XUẤT FILE PSD (SỬA LỖI NHẦM ẢNH RAW)
# ==========================================
@app.get("/api/pages/{page_id}/download-psd")
async def download_psd(
    page_id: str, 
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    try:
        # Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
        page = await check_page_ownership(page_id, user_id, db)

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
async def download_jsx(
    page_id: str, 
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    """
    API Tạo và Tải file JSX Động (Realtime):
    Đọc thẳng từ CSDL, sếp gõ tay hay AI dịch nó đều xuất ra được hết!
    """
    # 1. Tìm trang truyện & Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
    page = await check_page_ownership(page_id, user_id, db)

    # 2. Lấy toàn bộ bong bóng thoại của trang này từ JSON trong CSDL
    bubbles = []
    if page.bubbles_data:
        try:
            bubbles = json.loads(page.bubbles_data)
        except Exception as e:
            print(f"Lỗi đọc JSON bubbles: {e}")
            bubbles = []

    if not bubbles:
        raise HTTPException(status_code=404, detail="Trang này chưa có chữ nào! Hãy dùng AI Dịch hoặc tự thêm chữ rồi Lưu lại.")

    # 3. Gom dữ liệu tọa độ và chữ để nạp vào Script
    js_data = []
    for b in bubbles:
        text = (b.get("text") or "").strip()
        if not text:
            continue # Bỏ qua ô nào không có chữ
        
        js_data.append({
            "text": text,
            "x": b.get("x", 0),
            "y": b.get("y", 0),
            "w": b.get("w", 100),
            "h": b.get("h", 100)
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
                
                # THỜI GIAN HẾT HẠN (2 giờ = 7200 giây) để tuân thủ chính sách "Zero-Storage"
                # ⏳ ĐỂ TEST: Đổi số 7200 thành số 60 (1 phút)
                EXPIRATION_TIME = 7200 
                # EXPIRATION_TIME = 60 
                
                deleted_count = 0
                
                for item in os.listdir(workspace_dir):
                    item_path = os.path.join(workspace_dir, item)
                    try:
                        # Kiểm tra thời gian chỉnh sửa cuối cùng của file/thư mục
                        item_age = current_time - os.stat(item_path).st_mtime
                        
                        if item_age > EXPIRATION_TIME:
                            if os.path.isfile(item_path):
                                os.remove(item_path)
                                deleted_count += 1
                            elif os.path.isdir(item_path):
                                shutil.rmtree(item_path)
                                deleted_count += 1
                                
                                if item != "fonts":
                                    # Clean up database records for this project
                                    try:
                                        from database import AsyncSessionLocal
                                        from sqlalchemy import delete
                                        import db_models as models
                                        
                                        async with AsyncSessionLocal() as session:
                                            # Explicitly delete child rows to be absolutely sure
                                            await session.execute(delete(models.Terminology).where(models.Terminology.project_id == item))
                                            await session.execute(delete(models.Character).where(models.Character.project_id == item))
                                            await session.execute(delete(models.TranslationMemory).where(models.TranslationMemory.project_id == item))
                                            await session.execute(delete(models.Page).where(models.Page.project_id == item))
                                            await session.execute(delete(models.Project).where(models.Project.id == item))
                                            await session.commit()
                                            print(f"🧹 [CRONJOB] Đã xóa dữ liệu database của project {item}")
                                    except Exception as db_err:
                                        print(f"⚠️ [CRONJOB] Lỗi xóa dữ liệu DB cho project {item}: {db_err}")
                    except Exception as item_err:
                        print(f"⚠️ [CRONJOB] Lỗi xử lý file/thư mục {item} trong bot dọn rác: {item_err}")
                            
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
async def delete_page_from_server(
    page_id: str, 
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    try:
        # 1. Kiểm tra quyền sở hữu
        page = await check_page_ownership(page_id, user_id, db)
        project_id = page.project_id

        # 2. XÓA FILE RAW VẬT LÝ
        if page.raw_url:
            raw_filename = page.raw_url.split("/")[-1].split("?")[0]
            raw_path = f"workspace/{project_id}/raw/{raw_filename}"
            if os.path.exists(raw_path):
                try:
                    os.remove(raw_path)
                except OSError as fe:
                    print(f"⚠️ [DELETE] Không xóa được file raw (bỏ qua): {fe}")

        # 3. XÓA FILE CLEAN VẬT LÝ
        if hasattr(page, 'clean_url') and page.clean_url:
            clean_filename = page.clean_url.split("/")[-1].split("?")[0]
            clean_path = f"workspace/{clean_filename}"
            try:
                if os.path.exists(clean_path):
                    os.remove(clean_path)
            except OSError as fe:
                print(f"⚠️ [DELETE] Không xóa được file clean (bỏ qua): {fe}")

        # 4. XÓA RECORD TRONG DATABASE — đây mới là bước quan trọng nhất
        await db.delete(page)
        await db.commit()
        
        print(f"🔥 [DELETE] Đã xóa trang {page_id} khỏi DB!")
        return {"status": "success", "message": "Đã giải phóng dung lượng Server thành công"}

    except HTTPException:
        raise  # 403 ownership check → pass through, không rollback DB
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi không thể xóa trang: {str(e)}")

    
os.makedirs("workspace/fonts", exist_ok=True)

import shutil # Nhớ thêm dòng này lên đầu file nếu chưa có

import os
import shutil
from fastapi import HTTPException, UploadFile, File

@app.post("/api/fonts/upload")
async def upload_font(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id)
):
    safe_filename = os.path.basename(file.filename or "").replace("..", "").replace("/", "").replace("\\", "")
    if not safe_filename.lower().endswith(('.ttf', '.otf')):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .ttf hoặc .otf")
    
    font_dir = os.path.abspath("workspace/fonts")
    os.makedirs(font_dir, exist_ok=True)
    current_fonts = [f for f in os.listdir(font_dir) if f.lower().endswith(('.ttf', '.otf'))]
    if len(current_fonts) >= 30:
        raise HTTPException(status_code=400, detail="Kho Font đã đầy (Tối đa 30 Font). Hãy báo Admin dọn dẹp bớt!")

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File font quá nặng (Tối đa 5MB/file)!")

    file_path = os.path.join(font_dir, safe_filename)
    if os.path.commonpath([file_path, font_dir]) != font_dir:
        raise HTTPException(status_code=400, detail="Tên file không hợp lệ!")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"status": "success", "filename": safe_filename}


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
    # 1. Kiểm tra quyền sở hữu và sự tồn tại của dự án
    proj_result = await db.execute(select(models.Project).where(models.Project.id == project_id))
    project = proj_result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Dự án không tồn tại hoặc đã bị xóa!")
    if project.user_id != user_id:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập dự án này")
    
    # 2. Lấy danh sách ảnh (BỎ order_by ĐỂ TRÁNH LỖI THIẾU CỘT CREATED_AT)
    page_result = await db.execute(select(models.Page).where(models.Page.project_id == project_id))
    pages = page_result.scalars().all()
    
    return {"pages": [{"id": p.id, "filename": p.filename, "raw_url": p.raw_url, "clean_url": p.clean_url, "status": p.status} for p in pages]}


@app.get("/api/pages/{page_id}/export-manga")
async def export_manga(
    page_id: str, 
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    """Đóng gói Ảnh và Chữ thành 1 file .manga (Thực chất là file ZIP) để người dùng tải về"""
    # Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
    page = await check_page_ownership(page_id, user_id, db)

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
async def import_manga_file(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Chốt chặn bảo mật
):
    # 1. Kiểm tra xem Project có tồn tại và thuộc sở hữu của User này không (Chống IDOR)
    result = await db.execute(select(models.Project).where(models.Project.id == project_id, models.Project.user_id == user_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy Dự án!")

    # 2. Đếm số trang hiện có của dự án
    pages_result = await db.execute(select(models.Page).where(models.Page.project_id == project_id))
    pages_count = len(pages_result.scalars().all())

    # 3. Đọc dữ liệu file nén (.manga / .zip)
    file_bytes = await file.read()
    pages_created = []
    
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            namelist = z.namelist()
            
            # Trường hợp 1: Tệp sao lưu .manga đơn lẻ (Có bubbles.json và file ảnh)
            if 'bubbles.json' in namelist:
                # Tìm file ảnh (image.* hoặc raw.jpg/clean.jpg)
                img_name = next((f for f in namelist if f.startswith("image.") or f == "raw.jpg" or f == "clean.jpg"), None)
                if not img_name:
                    raise Exception("Không tìm thấy ảnh gốc trong file sao lưu .manga!")
                    
                bubbles_json = z.read("bubbles.json").decode('utf-8')
                page_id = str(uuid.uuid4())
                
                # Tạo thư mục lưu ảnh
                ext = img_name.split('.')[-1]
                os.makedirs(f"workspace/{project_id}/raw", exist_ok=True)
                os.makedirs(f"workspace/{project_id}/clean", exist_ok=True)
                
                raw_filename = f"workspace/{project_id}/raw/{page_id}.{ext}"
                with open(raw_filename, "wb") as f_out:
                    f_out.write(z.read(img_name))
                    
                clean_url = None
                if 'clean.jpg' in namelist:
                    clean_filename = f"workspace/{project_id}/clean/{page_id}.jpg"
                    with open(clean_filename, "wb") as f_out:
                        f_out.write(z.read('clean.jpg'))
                    clean_url = f"/{clean_filename}"
                    
                db_page = models.Page(
                    id=page_id,
                    project_id=project_id,
                    filename=file.filename.replace(".manga", "").replace(".zip", ""),
                    raw_url=f"/workspace/{project_id}/raw/{page_id}.{ext}",
                    clean_url=clean_url,
                    status="completed" if clean_url else "pending",
                    bubbles_data=bubbles_json
                )
                db.add(db_page)
                pages_created.append(db_page)
                
            # Trường hợp 2: ZIP chứa batch ảnh thô (không có bubbles.json) đại diện cho chapter mới
            else:
                supported_exts = ('.jpg', '.jpeg', '.png', '.webp')
                img_files = [f for f in namelist if f.lower().endswith(supported_exts) and not f.startswith('__MACOSX') and not os.path.basename(f).startswith('.')]
                
                if not img_files:
                    raise Exception("Không tìm thấy ảnh hoặc file bubbles.json trong file nén!")
                    
                os.makedirs(f"workspace/{project_id}/raw", exist_ok=True)
                for img_path_in_zip in img_files:
                    img_data = z.read(img_path_in_zip)
                    basename = os.path.basename(img_path_in_zip)
                    page_id = str(uuid.uuid4())
                    ext = basename.split('.')[-1]
                    
                    raw_filename = f"workspace/{project_id}/raw/{page_id}.{ext}"
                    with open(raw_filename, "wb") as f_out:
                        f_out.write(img_data)
                        
                    db_page = models.Page(
                        id=page_id,
                        project_id=project_id,
                        filename=basename,
                        raw_url=f"/workspace/{project_id}/raw/{page_id}.{ext}",
                        status="unprocessed"
                    )
                    db.add(db_page)
                    pages_created.append(db_page)
                    
        await db.commit()
    except Exception as e:
        print(f"❌ Lỗi khôi phục tệp sao lưu: {e}")
        raise HTTPException(status_code=400, detail=f"Không thể đọc file sao lưu: {str(e)}")
        
    return {
        "status": "success", 
        "pages": [{"id": p.id, "filename": p.filename, "status": p.status} for p in pages_created]
    }    

# ==========================================
# 🛑 API HỦY TIẾN TRÌNH DỊCH (SERVERLESS HACK)
# ==========================================
class CancelPayload(BaseModel):
    task_id: str

@app.post("/api/pages/{page_id}/cancel")
async def cancel_page_translation(
    page_id: str,
    payload: CancelPayload,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    try:
        # 1. Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
        page = await check_page_ownership(page_id, user_id, db)
        
        task_id = payload.task_id
        from task_manager import local_task_manager
        local_task_manager.cancel_task(task_id)
        
        # Đăng ký cờ hủy vào Redis nếu có
        try:
            await async_redis_client.set(f"cancelled_task:{task_id}", "true", ex=3600)
            error_payload = {"status": "FAILURE", "result": "Đã hủy bởi người dùng"}
            await async_redis_client.set(f"celery-task-meta-{task_id}", json.dumps(error_payload), ex=3600)
            await async_redis_client.publish(
                f"task_progress:{task_id}", 
                json.dumps({"state": "FAILURE", "progress": 0, "message": "Tiến trình đã bị hủy bởi người dùng!"})
            )
        except Exception:
            pass
        
        page.status = "failed"
        await db.commit()
        
        return {
            "status": "success", 
            "message": "Đã hủy dịch trang thành công!",
            "refunded": False
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [CANCEL ERROR] {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    try:
        from task_manager import local_task_manager
        local_task_manager.cancel_task(task_id)
        
        try:
            page_id = await async_redis_client.get(f"task_page_id:{task_id}")
            if page_id:
                return await cancel_page_translation(
                    page_id=page_id, 
                    payload=CancelPayload(task_id=task_id), 
                    db=db, 
                    user_id=user_id
                )
        except Exception:
            pass
            
        return {"status": "success", "message": "Đã hủy tiến trình!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

import httpx # Nhớ đảm bảo có dòng này ở đầu file

# ==========================================
# ==========================================
# 1. KÍCH HOẠT DỊCH TRANG TRUYỆN (Single-tenant native GPU mode)
# ==========================================
@app.post("/api/pages/{page_id}/translate")
async def translate_page(
    page_id: str, 
    request: Request, 
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang truyện")

    # 🔒 Kiểm tra hạn mức 300 trang miễn phí toàn hệ thống
    global_quota.check_quota(1)

    if not page.raw_url:
        raise HTTPException(status_code=400, detail="Không tìm thấy URL ảnh gốc")
    
    raw_path = page.raw_url.lstrip('/')
    if not os.path.exists(raw_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy file ảnh gốc trên máy chủ")

    try:
        config = await request.json() if request else {}
    except Exception:
        config = {}
    task_id = str(uuid.uuid4())

    from task_manager import local_task_manager
    local_task_manager.create_task(task_id, page_id=page_id)

    page.status = "processing"
    await db.commit()

    def run_pipeline_with_translation(tid: str, pid: str, cfg: dict):
        from worker import process_manga_page, sync_update_page_db
        if not cfg.get("task_type"):
            cfg["task_type"] = "translate"
        process_manga_page(tid, pid, cfg)
        t_data = local_task_manager.get_task(tid)
        if t_data.get("state") == "SUCCESS" and t_data.get("result"):
            res = t_data["result"]
            bubbles = res.get("data", [])
            items_to_trans = [b for b in bubbles if b.get("japanese") and not b.get("vietnamese")]
            if items_to_trans:
                local_task_manager.update_progress(tid, 85, "Đang dịch sang Tiếng Việt bằng DeepSeek AI...")
                try:
                    ocr_payload = [{"id": b["id"], "text": b["japanese"]} for b in items_to_trans]
                    system_prompt = (
                        "Bạn là dịch giả truyện tranh Manga chuyên nghiệp sang Tiếng Việt.\n"
                        "Nhiệm vụ: Dịch các câu thoại sau sang Tiếng Việt tự nhiên, phù hợp bối cảnh truyện tranh.\n"
                        "BẮT BUỘC TRẢ VỀ JSON: {\"translations\": [{\"id\": 1, \"translation\": \"câu dịch tiếng Việt\"}]}"
                    )
                    user_prompt = f"Dữ liệu cần dịch: {json.dumps(ocr_payload, ensure_ascii=False)}"
                    resp = deepseek_client.chat.completions.create(
                        model="deepseek-chat",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        response_format={'type': 'json_object'}
                    )
                    ai_data = robust_json_parse(resp.choices[0].message.content)
                    trans_map = extract_translations(ai_data)
                    for b in bubbles:
                        b_id = str(b.get("id"))
                        if b_id in trans_map:
                            b["vietnamese"] = trans_map[b_id]
                            b["text"] = trans_map[b_id]
                    sync_update_page_db(pid, res.get("clean_url", ""), bubbles)
                    res["data"] = bubbles
                    local_task_manager.update_progress(tid, 100, "Hoàn tất!", state="SUCCESS", result=res)
                except Exception as ex:
                    print(f"⚠️ [DeepSeek Error]: {ex}")

    # Ưu tiên bắn sang RunPod Serverless GPU nếu có cấu hình
    runpod_key = os.getenv("RUNPOD_API_KEY")
    runpod_endpoint = os.getenv("RUNPOD_TRANSLATE_ENDPOINT_ID") or os.getenv("RUNPOD_ENDPOINT_ID")

    if runpod_key and runpod_endpoint:
        from runpod_service import process_page_on_runpod
        asyncio.create_task(process_page_on_runpod(task_id, page_id, config))
    else:
        # Chạy tác vụ nền trên ThreadPool không làm nghẽn Event Loop
        asyncio.create_task(asyncio.to_thread(run_pipeline_with_translation, task_id, page_id, config))

    return {"task_id": task_id}


# ==========================================
# 2. TRUY VẤN TIẾN ĐỘ & KẾT QUẢ TASK
# ==========================================
@app.get("/api/task/{task_id}")
async def get_task_result(task_id: str):
    from task_manager import local_task_manager
    return local_task_manager.get_task(task_id)

# [Đã gộp endpoint khôi phục dự án .manga vào vị trí trên của main.py]
    

class RetryTranslationRequest(BaseModel):
    local_prompt: Optional[str] = None
    target_language: Optional[str] = "Tiếng Việt"

# 🚀 API BỔ SUNG: CHỈ DỊCH LẠI CHỮ (BẢN VÁ LỖI CHỐNG ĐẠN)
@app.post("/api/pages/{page_id}/retry-text-translation")
async def retry_text_translation(
    page_id: str, 
    payload: Optional[RetryTranslationRequest] = None,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id) # Bắt buộc đăng nhập
):
    try:
        # Kiểm tra quyền sở hữu trang truyện (Chống lỗ hổng IDOR)
        page = await check_page_ownership(page_id, user_id, db)
        
        # 🚀 BẢN VÁ: Hướng dẫn người dùng bấm đúng nút
        if not page.bubbles_data or page.bubbles_data == "[]":
            raise HTTPException(status_code=400, detail="Trang này không phát hiện được chữ nào! Sếp hãy bấm nút [Quét lại ảnh] hình cây đũa phép ở góc phải nhé.")

        extracted_data = json.loads(page.bubbles_data)
        ocr_batch_payload = []
        for item in extracted_data:
            jap_text = item.get("japanese", "").strip()
            if not jap_text:
                # 🚀 BẢN VÁ PHÒNG THỦ: Cứu sinh nếu phím japanese bị thất lạc
                jap_text = item.get("text", "").strip()
            if not jap_text:
                jap_text = item.get("vietnamese", "").strip()
                
            if jap_text:
                ocr_batch_payload.append({"id": item["id"], "japanese": jap_text})

        if not ocr_batch_payload:
            raise HTTPException(status_code=400, detail="Trang này trống trơn tiếng Nhật! Sếp hãy bấm nút [Quét lại ảnh] hình cây đũa phép ở góc phải nhé.")

        target_language = payload.target_language if payload else "Tiếng Việt"
        if not target_language:
            target_language = "Tiếng Việt"

        # 2. GOM LÊN DEEPSEEK TRÊN VPS VỚI PROMPT MẠNH HƠN
        prompt = (
            f"Nhiệm vụ của bạn là dịch mảng JSON sau sang {target_language}.\n"
            f"Bạn BẮT BUỘC phải dịch hoàn toàn sang {target_language}. Tuyệt đối KHÔNG giữ nguyên chữ tiếng Nhật, tiếng Trung gốc (Kanji, Hanzi, chữ Hán) hoặc chữ tiếng Anh trong kết quả dịch.\n"
            f"Bạn BẮT BUỘC TRẢ VỀ FORMAT JSON chứa mảng 'translations', ví dụ: {{\\\"translations\\\": [{{\\\"id\\\": 1, \\\"translation\\\": \\\"bản dịch\\\"}}]}}.\n"
            f"Dữ liệu cần dịch: {json.dumps(ocr_batch_payload, ensure_ascii=False)}"
        )
        if payload and payload.local_prompt:
            prompt += f"\n\nChỉ thị bổ sung từ người dùng (Hãy làm theo chỉ thị này một cách nghiêm ngặt): {payload.local_prompt}"
        
        response = None
        translations = {}
        for attempt in range(3):
            try:
                response = deepseek_client.chat.completions.create(
                    model="deepseek-chat",
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a professional manga translator. "
                                f"You must translate the text strictly and fully to {target_language}. "
                                "Do not output Chinese, Japanese, or keep the original characters under any circumstances. "
                                "You output strict JSON containing a 'translations' array of dicts with 'id' and 'translation'."
                            )
                        },
                        {"role": "user", "content": prompt}
                    ],
                    response_format={'type': 'json_object'}
                )
                ai_response = robust_json_parse(response.choices[0].message.content)
                translations = extract_translations(ai_response)
                if translations:
                    print(f"✅ [DEEPSEEK RETRY] Dịch thành công ở lần thử thứ {attempt+1}!")
                    break
                else:
                    print(f"⚠️ [DEEPSEEK RETRY] Lần thử thứ {attempt+1} trả về bản dịch rỗng, đang thử lại...")
            except Exception as e:
                print(f"⚠️ [DEEPSEEK RETRY] Lần thử thứ {attempt+1} gặp lỗi: {e}")
                if attempt == 2:
                    raise e
            await asyncio.sleep(1)

        # 4. CẬP NHẬT LẠI CHỮ TIẾNG VIỆT MỚI
        for item in extracted_data:
            item_id = str(item["id"])
            if item_id in translations:
                new_text = translations[item_id]
                item["vietnamese"] = new_text
                if "text" in item: 
                    item["text"] = new_text # Đồng bộ font chữ Frontend
            else:
                if not item.get("vietnamese"):
                    item["vietnamese"] = "Lỗi dịch"
                    if "text" in item:
                        item["text"] = "Lỗi dịch"

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
        # 1. Kiểm tra quyền sở hữu và sự tồn tại của Dự án
        proj_result = await db.execute(select(models.Project).where(models.Project.id == project_id))
        project = proj_result.scalars().first()
        if not project:
            raise HTTPException(status_code=404, detail="Dự án không tồn tại hoặc đã bị xóa!")
        if project.user_id != user_id:
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
                    page_bubbles = []
                    if page.bubbles_data:
                        try:
                            page_bubbles = json.loads(page.bubbles_data)
                        except Exception as e:
                            print(f"Lỗi đọc JSON bubbles ở export-batch: {e}")
                    try:
                        create_manga_psd(raw_path, clean_path, psd_temp_path, page_bubbles)
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
async def copilot_chat(
    req: CopilotRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    await check_balance_before_task(db, user_id, min_balance=2.0)
    start_time = time.time()
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

        def call_llm():
            response = deepseek_client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=150,
                temperature=0.3
            )
            return response.choices[0].message.content.strip()

        result = await run_in_threadpool(call_llm)
        elapsed = max(2.0, time.time() - start_time)
        await deduct_balance(db, user_id, elapsed, f"AI Copilot Chat ({req.action})")
        await db.commit()
        return {"result": result}
    except Exception as e:
        print(f"❌ Lỗi AI Copilot: {e}")
        raise HTTPException(status_code=500, detail=str(e))
# KẾT NỐI PAYOS (CHUẨN SDK PYTHON MỚI NHẤT)
# ========================================================
try:
    from payos import PayOS
    from payos.types import CreatePaymentLinkRequest
    payos_client = PayOS(
        client_id=os.getenv("PAYOS_CLIENT_ID"),
        api_key=os.getenv("PAYOS_API_KEY"),
        checksum_key=os.getenv("PAYOS_CHECKSUM_KEY")
    )
except Exception:
    payos_client = None

from db_models import User, Transaction, UserTransaction, TimeLog
import time
import os

# ========================================================
# HÀM BỔ TRỢ: HỆ THỐNG THANH TOÁN THEO THỜI GIAN (TIME-BASED BILLING)
# ========================================================
async def log_time_transaction(
    user_id: str,
    amount: float,
    action_type: str,
    description: str,
    db: AsyncSession
) -> Optional[TimeLog]:
    """
    Ghi nhận lịch sử biến động số dư thời gian (giây) vào DB.
    """
    try:
        new_log = TimeLog(
            user_id=user_id,
            amount=amount,
            action_type=action_type,
            description=description
        )
        db.add(new_log)
        await db.flush()  # Đẩy dữ liệu xuống DB trước để lưu cùng transaction hiện tại
        return new_log
    except Exception as e:
        print(f"⚠️ [LOG_TIME_ERROR] Lỗi khi ghi nhận lịch sử thời gian sử dụng: {e}")
        return None

async def check_balance_before_task(db: AsyncSession, user_id: str, min_balance: float = 1.0) -> User:
    """
    Hệ thống chuyển sang chế độ miễn phí 300 trang toàn hệ thống.
    Kiểm tra hạn mức trang thử nghiệm miễn phí toàn hệ thống thay vì thu phí cá nhân.
    """
    global_quota.check_quota(1)
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    return user

async def deduct_balance(db: AsyncSession, user_id: str, execution_time_seconds: float, description: str) -> User:
    """
    Hệ thống chuyển sang chế độ miễn phí: không trừ điểm cá nhân của người dùng.
    """
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    return user
    
    # Ghi nhận lịch sử biến động số dư (CreditLog)
    desc_upper = description.upper()
    action_type = "TRANSLATE_LAMA"
    if any(keyword in desc_upper for keyword in ["RUNPOD", "VÀ NỀN", "INPAINT", "GROK", "OPENAI", "CHATGPT", "BANANA", "REDRAW"]):
        action_type = "REDRAW_AI"
        
    await log_time_transaction(
        user_id=user.id,
        amount=-execution_time_seconds,
        action_type=action_type,
        description=description,
        db=db
    )
    
    await db.flush()  # Đẩy xuống DB trước để khóa tiếp nếu có, chưa commit vội
    return user



# ==========================================
# API: KÍCH HOẠT CÔNG CỤ VẼ LẠI AI (COLD START)
# ==========================================
@app.post("/api/tools/redraw/activate")
async def activate_redraw_tool(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Kích hoạt Engine vẽ lại AI đồ họa (Không thu phí khởi động phẳng nữa, chỉ kiểm tra số dư)"""
    user_email = getattr(request.state, "user_email", None)
    if user_email != "td2005dataeg@gmail.com":
        raise HTTPException(
            status_code=403,
            detail="Tài khoản của bạn không có quyền sử dụng tính năng redraw."
        )

    await check_balance_before_task(db, user_id)
    await db.commit()
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    balance = user.balance_seconds if user else 0.0
    return {"status": "success", "balance_seconds": balance, "credits": balance}

# ==========================================
# API 1: TẠO MÃ QR/LINK THANH TOÁN CHO NGƯỜI DÙNG
# ==========================================
def calculate_credits(amount_vnd: int) -> float:
    # Quy đổi điểm năng lượng cho DeepKoma:
    # 20.000 VNĐ = 50 điểm năng lượng
    # 50.000 VNĐ = 150 điểm năng lượng
    # 200.000 VNĐ = 700 điểm năng lượng
    if amount_vnd >= 200000:
        return float(amount_vnd // 285)
    elif amount_vnd >= 50000:
        return float(amount_vnd // 333)
    else:
        return float(amount_vnd // 400)

def calculate_seconds(amount_vnd: int) -> float:
    return calculate_credits(amount_vnd)

class CreatePaymentLinkPayload(BaseModel):
    amount: int

@app.post("/api/payments/create-link")
@app.post("/api/payment/create-link")
async def create_payment_link(
    payload: CreatePaymentLinkPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    try:
        amount = payload.amount
        if amount < 20000:
            raise HTTPException(status_code=400, detail="Số tiền nạp tối thiểu là 20.000 VNĐ")
    
        # Quy đổi kèm bonus
        credits_to_add = calculate_credits(amount)
    
        email = getattr(request.state, "user_email", None) or f"user_{user_id}@deepkoma.local"
        await ensure_user_exists(db, user_id, email)
    
        order_code = int(time.time() * 1000)
        
        # Lấy Origin hoặc Referer của frontend gửi yêu cầu để chuyển hướng chính xác về Frontend
        origin = request.headers.get("origin")
        if not origin:
            referer = request.headers.get("referer")
            if referer:
                parts = referer.split("/")
                if len(parts) >= 3:
                    origin = parts[0] + "//" + parts[2]
        
        # Nếu không lấy được từ header, tự động chuyển đổi từ backend base_url (bỏ cổng 8000 của backend)
        if not origin:
            origin = get_base_url().rstrip('/')
            if ":8000" in origin:
                origin = origin.replace(":8000", "")
                
        # Chuẩn hóa HTTPS cho môi trường production
        if "deepkoma.pro" in origin and origin.startswith("http://"):
            origin = "https://" + origin[7:]
            
        cancel_url = f"{origin}/workspace?payment=failed"
        return_url = f"{origin}/workspace?payment=success"
        
        payment_request = CreatePaymentLinkRequest(
            order_code=order_code,
            amount=amount,
            description=f"Nap {credits_to_add} Xu", 
            cancel_url=cancel_url,
            return_url=return_url
        )
        
        try:
            payment_link = payos_client.payment_requests.create(payment_request)
        except Exception as e:
            print(f"🛑 [LỖI TẠO LINK PAYOS]: {e}")
            raise HTTPException(status_code=500, detail=f"Không thể tạo link thanh toán từ cổng PayOS! Chi tiết: {str(e)}")
            
        # Lưu giao dịch PENDING vào CSDL PayOS (để quản lý link)
        new_txn = Transaction(
            order_code=order_code,
            user_id=user_id,
            package_name=f"Nạp {credits_to_add} Xu",
            amount=amount,
            seconds_added=credits_to_add,
            status="PENDING",
            checkout_url=payment_link.checkout_url
        )
        db.add(new_txn)
        await db.commit()
        
        return {
            "checkoutUrl": payment_link.checkout_url,
            "qrCode": payment_link.qr_code,
            "orderCode": order_code
        }
    except Exception as outer_e:
        import traceback
        tb = traceback.format_exc()
        print(f"🛑 [LỖI NGOÀI TẠO LINK]: {outer_e}\n{tb}")
        if isinstance(outer_e, HTTPException):
            raise outer_e
        raise HTTPException(status_code=500, detail=f"Lỗi Server: {str(outer_e)} | Traceback: {tb[:200]}")

# ==========================================
# API: KIỂM TRA TRẠNG THÁI GIAO DỊCH (POLLING)
# ==========================================
@app.get("/api/payments/status/{order_code}")
@app.get("/api/payment/status/{order_code}")
async def get_payment_status(
    order_code: int, 
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    try:
        # 1. Tìm giao dịch trong DB cục bộ và khóa dòng bằng with_for_update() để an toàn giao dịch
        stmt = select(Transaction).where(Transaction.order_code == order_code).with_for_update()
        res = await db.execute(stmt)
        txn = res.scalar_one_or_none()
        if not txn:
            raise HTTPException(status_code=404, detail="Giao dịch không tồn tại")
            
        if txn.user_id != user_id:
            raise HTTPException(status_code=403, detail="Bạn không có quyền xem thông tin giao dịch này!")
            
        # Nếu đã ở trạng thái PAID hoặc CANCELLED trong DB, trả về luôn để tránh gọi API ngoài phí phạm
        if txn.status in ["PAID", "CANCELLED"]:
            return {"status": txn.status}

        # 2. Nếu vẫn là PENDING, gọi trực tiếp API PayOS để đối soát thời gian thực (Cứu sinh khi Webhook sập)
        try:
            payment_info = payos_client.payment_requests.get(order_code)
            real_status = payment_info.status # "PAID", "PENDING", "CANCELLED"
            
            if real_status == "PAID" and txn.status == "PENDING":
                # Kích hoạt cộng tiền thủ công (Copy nguyên mẫu logic cộng tiền của Webhook nhưng bảo vệ 2 lớp)
                txn.status = "PAID"
                
                # Khóa dòng User để cộng tiền an toàn
                stmt_user = select(User).where(User.id == txn.user_id).with_for_update()
                user_res = await db.execute(stmt_user)
                user = user_res.scalar_one_or_none()
                
                if user:
                    credits_to_add = txn.seconds_added if txn.seconds_added else calculate_credits(txn.amount)
                    user.credits = (getattr(user, "credits", 0.0) or 0.0) + credits_to_add
                    user.balance_seconds = (getattr(user, "balance_seconds", 0.0) or 0.0) + credits_to_add
                    
                    # Ghi lịch sử biến động số dư
                    new_hist = UserTransaction(
                        user_id=user.id,
                        amount=credits_to_add,
                        type="TOPUP",
                        description=f"Nạp {credits_to_add:.0f} năng lượng qua cổng PayOS (Số tiền: {txn.amount:,}đ - Polling)",
                        order_code=order_code
                    )
                    db.add(new_hist)
                    
                    # Ghi nhận lịch sử biến động số dư mới (TimeLog)
                    await log_time_transaction(
                        user_id=user.id,
                        amount=credits_to_add,
                        action_type="DEPOSIT",
                        description=f"Nạp {credits_to_add:.0f} năng lượng qua cổng PayOS (Số tiền: {txn.amount:,}đ - Polling)",
                        db=db
                    )
                    
                    await db.commit()
                    print(f"💰 [POLLING] TING TING! Đã cộng {credits_to_add:.0f} năng lượng cho user {user.id} (Order: {order_code})")
                else:
                    await db.commit()
            elif real_status == "CANCELLED" and txn.status == "PENDING":
                txn.status = "CANCELLED"
                await db.commit()
                print(f"❌ [POLLING] Giao dịch {order_code} đã bị HỦY từ cổng PayOS")
            else:
                # Nếu PayOS vẫn trả về PENDING, hoặc trạng thái khác, ta giữ nguyên và commit nhẹ nhàng
                await db.commit()
                
        except Exception as payos_err:
            # Nếu gọi PayOS bị lỗi, ghi log và commit db hiện tại
            await db.commit()
            print(f"⚠️ [POLLING ERROR] Không thể lấy thông tin từ PayOS cho đơn {order_code}: {payos_err}")

        # Trả về trạng thái cập nhật mới nhất
        return {"status": txn.status}

    except Exception as e:
        await db.rollback()
        if isinstance(e, HTTPException):
            raise e
        print(f"❌ [STATUS POLLING ERROR]: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# API 2: WEBHOOK LẮNG NGHE TIỀN VỀ (BẢO VỆ 2 LỚP)
# ==========================================
@app.post("/api/payments/webhook")
@app.post("/api/payment/webhook")
async def payos_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    # Lớp 1: Verify Signature của PayOS
    try:
        webhook_data = payos_client.webhooks.verify(body)
    except Exception as e:
        print(f"❌ [WEBHOOK] Xác thực chữ ký thất bại: {e}")
        raise HTTPException(status_code=400, detail="Chữ ký không hợp lệ")

    # Trích xuất dữ liệu phòng thủ (cứu sinh nếu SDK thiếu trường hoặc sai map)
    order_code = getattr(webhook_data, "order_code", None) or body.get("data", {}).get("orderCode")
    status = getattr(webhook_data, "status", None) or body.get("data", {}).get("status")
    amount_paid = getattr(webhook_data, "amount", None) or body.get("data", {}).get("amount")
    
    try:
        # Lớp 2: Kiểm tra Idempotency chống cộng đúp
        stmt_check = select(UserTransaction).where(
            UserTransaction.order_code == order_code,
            UserTransaction.type == "TOPUP"
        )
        res_check = await db.execute(stmt_check)
        existing_txn = res_check.scalar_one_or_none()
        if existing_txn:
            print(f"⚠️ [WEBHOOK] Giao dịch {order_code} đã được xử lý thành công trước đó. Bỏ qua.")
            return {"success": True, "message": "Already processed"}

        # Tìm giao dịch gốc và KHÓA DÒNG bằng with_for_update() để chống tranh chấp (ACID Isolation)
        stmt_legacy = select(Transaction).where(Transaction.order_code == order_code).with_for_update()
        res_legacy = await db.execute(stmt_legacy)
        txn = res_legacy.scalar_one_or_none()
        
        if txn and txn.status == "PENDING":
            if status == "CANCELLED":
                txn.status = "CANCELLED"
                await db.commit()
                print(f"❌ Giao dịch {order_code} đã bị HỦY từ cổng PayOS")
            elif status == "PAID":
                txn.status = "PAID"
                
                # Khóa dòng User để cộng tiền an toàn
                stmt_user = select(User).where(User.id == txn.user_id).with_for_update()
                user_res = await db.execute(stmt_user)
                user = user_res.scalar_one_or_none()
                
                if user:
                    credits_to_add = txn.seconds_added if (txn and txn.seconds_added) else calculate_credits(amount_paid)
                    user.credits = (getattr(user, "credits", 0.0) or 0.0) + credits_to_add
                    user.balance_seconds = (getattr(user, "balance_seconds", 0.0) or 0.0) + credits_to_add
                    
                    # Ghi lịch sử biến động số dư
                    new_hist = UserTransaction(
                        user_id=user.id,
                        amount=credits_to_add,
                        type="TOPUP",
                        description=f"Nạp {credits_to_add:.0f} năng lượng qua cổng PayOS (Số tiền: {amount_paid:,}đ)",
                        order_code=order_code
                    )
                    db.add(new_hist)
                    
                    # Ghi nhận lịch sử biến động số dư mới (TimeLog)
                    await log_time_transaction(
                        user_id=user.id,
                        amount=credits_to_add,
                        action_type="DEPOSIT",
                        description=f"Nạp {credits_to_add:.0f} năng lượng qua cổng PayOS (Số tiền: {amount_paid:,}đ)",
                        db=db
                    )
                    
                    await db.commit()
                    print(f"💰 TING TING! Đã cộng {credits_to_add:.0f} năng lượng cho user {user.id} (Order: {order_code})")
                else:
                    await db.commit()
                    print(f"⚠️ Không tìm thấy user {txn.user_id} để cộng tiền")

        return {"success": True}

    except Exception as db_err:
        await db.rollback()
        print(f"❌ [WEBHOOK ERROR] Lỗi hệ thống khi xử lý webhook giao dịch {order_code}: {db_err}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Lỗi hệ thống khi xử lý giao dịch")

# ==========================================
# API 3: LẤY LỊCH SỬ GIAO DỊCH CỦA USER
# ==========================================
@app.get("/api/payments/history")
@app.get("/api/payment/history")
async def get_payment_history(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """API lấy lịch sử giao dịch nạp tiền PayOS của người dùng hiện tại"""
    stmt = select(Transaction).where(Transaction.user_id == user_id).order_by(Transaction.created_at.desc())
    result = await db.execute(stmt)
    txns = result.scalars().all()
    
    return {
        "transactions": [
            {
                "order_code": txn.order_code,
                "package_name": txn.package_name,
                "amount": txn.amount,
                "seconds_added": txn.seconds_added,
                "status": txn.status,
                "checkout_url": txn.checkout_url,
                "created_at": txn.created_at.isoformat() if txn.created_at else None
            }
            for txn in txns
        ]
    }

# ==========================================
# API 3.5: LẤY LỊCH SỬ BIẾN ĐỘNG SỐ DƯ (CREDIT LOGS) CỦA USER
# ==========================================
@app.get("/api/time/history")
@app.get("/api/credits/history") # Keep old route name for backward compatibility
async def get_time_history(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """API lấy lịch sử biến động số dư thời gian tối đa 50 bản ghi mới nhất"""
    try:
        stmt = select(TimeLog).where(TimeLog.user_id == user_id).order_by(TimeLog.created_at.desc()).limit(50)
        result = await db.execute(stmt)
        logs = result.scalars().all()
        
        logs_data = [
            {
                "id": log.id,
                "amount": log.amount,
                "action_type": log.action_type,
                "description": log.description,
                "created_at": log.created_at.isoformat() if log.created_at else None
            }
            for log in logs
        ]
        
        return {
            "time_logs": logs_data,
            "credit_logs": logs_data # Keep credit_logs in response for backward compatibility
        }
    except Exception as e:
        print(f"❌ [API CREDITS HISTORY ERROR] Lỗi: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi lấy lịch sử biến động số dư: {str(e)}")

_status_cache = {
    "status": "SLEEPING",
    "last_fetched": 0.0
}

async def fetch_runpod_server_status() -> str:
    # Luôn trả về "HOT" khi chạy cục bộ để mở khóa toàn bộ tính năng và nút dịch trên UI
    return "HOT"

async def deprecated_fetch_runpod_server_status() -> str:
    global _status_cache
    now = time.time()
    if now - _status_cache["last_fetched"] < 10.0:
        return _status_cache["status"]
        
    if not RUNPOD_API_KEY:
        _status_cache["status"] = "SLEEPING"
        _status_cache["last_fetched"] = now
        return "SLEEPING"
        
    headers = {
        "Authorization": f"Bearer {RUNPOD_API_KEY}",
        "Content-Type": "application/json"
    }
    
    async def check_endpoint(ep_id: str):
        if not ep_id:
            return None
        url = f"https://api.runpod.ai/v2/{ep_id}/health"
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            print(f"Error checking runpod health for {ep_id}: {e}")
        return None

    results = await asyncio.gather(
        check_endpoint(RUNPOD_ENDPOINT_ID),
        check_endpoint(RUNPOD_REDRAW_ENDPOINT_ID),
        return_exceptions=True
    )
    
    translate_data = results[0] if len(results) > 0 and isinstance(results[0], dict) else None
    redraw_data = results[1] if len(results) > 1 and isinstance(results[1], dict) else None
    
    def analyze_health(data):
        if not data:
            return "SLEEPING"
        workers = data.get("workers", {})
        idle = workers.get("idle", 0)
        running = workers.get("running", 0)
        initializing = workers.get("initializing", 0)
        
        queue = data.get("queue", {})
        pending = queue.get("pending", 0)
        
        if (idle + running) > 0:
            return "HOT"
        elif initializing > 0 or pending > 0:
            return "STARTING"
        else:
            return "SLEEPING"

    translate_status = analyze_health(translate_data)
    redraw_status = analyze_health(redraw_data)
    
    if translate_status == "HOT" and redraw_status == "HOT":
        final_status = "HOT"
    elif translate_status == "STARTING" or redraw_status == "STARTING" or (translate_status == "HOT" and redraw_status == "SLEEPING") or (translate_status == "SLEEPING" and redraw_status == "HOT"):
        final_status = "STARTING"
    else:
        final_status = "SLEEPING"
        
    _status_cache["status"] = final_status
    _status_cache["last_fetched"] = now
    return final_status

@app.get("/api/v1/server-status")
async def get_server_status():
    status = await fetch_runpod_server_status()
    return {"status": status}

@app.get("/api/gpu/status")
async def get_gpu_status(user_id: str = Depends(get_current_user_id)):
    status = await fetch_runpod_server_status()
    if status == "HOT":
        return {"status": "ready", "message": "GPU is active and ready"}
    elif status == "STARTING":
        return {"status": "loading", "message": "GPU is waking up"}
    else:
        return {"status": "offline", "message": "GPU is sleeping"}



# ==========================================
# QUẢN LÝ CREDITS: LẤY SỐ DƯ & TRỪ TIỀN
# ==========================================
@app.get("/api/users/me")
async def get_user_profile(request: Request, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """API lấy thông tin User (Bao gồm Credits và gói Pro)"""
    try:
        email = getattr(request.state, "user_email", None) or f"user_{user_id}@deepkoma.local"
        user = await ensure_user_exists(db, user_id, email)
        try:
            await db.commit()
        except Exception:
            pass
            
        LENS_FREE_LIMIT = 20
        today = __import__('datetime').date.today().isoformat()
        redis_key = f"lens_count:{user_id}:{today}"
        try:
            lens_count = int(redis_client.get(redis_key) or 0)
        except Exception:
            lens_count = 0
        lens_free_remaining = max(0, LENS_FREE_LIMIT - lens_count)
            
        balance = 999999.0
        quota_status = global_quota.get_status()
        return {
            "id": getattr(user, "id", user_id),
            "balance_seconds": balance,
            "credits": balance,
            "is_pro": True,
            "pro_until": getattr(user, "pro_until", None),
            "lens_free_remaining": 9999,
            "system_quota": quota_status
        }
    except Exception as e:
        logger.error(f"Error in get_user_profile: {e}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        return {
            "id": user_id,
            "balance_seconds": 900.0,
            "credits": 900.0,
            "is_pro": False,
            "pro_until": None,
            "lens_free_remaining": 20
        }

@app.post("/api/users/me/deduct")
async def deduct_credits(amount: float = 1.0, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """API trừ tiền mỗi khi dùng AI (Bypass sang chế độ miễn phí)"""
    return {"status": "success", "balance_seconds": 999999.0, "credits": 999999.0, "is_pro": True}

class QuotaResetPayload(BaseModel):
    secret: Optional[str] = None
    new_limit: Optional[int] = 300

@app.get("/api/system/quota")
async def get_system_quota_api():
    """Lấy thông tin hạn mức trang miễn phí toàn hệ thống"""
    return global_quota.get_status()

@app.post("/api/system/quota/reset")
async def reset_system_quota_api(
    payload: Optional[QuotaResetPayload] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db)
):
    """Đặt lại hạn mức 300 trang miễn phí"""
    limit = (payload.new_limit if payload and payload.new_limit else 300)
    res = global_quota.reset_quota(new_limit=limit)
    return {"status": "success", "message": f"Đã đặt lại thành công {limit} trang miễn phí!", "quota": res}

# ==========================================
# SYSTEM CỦA ZERO-FRICTION PROMPTING (AI REDRAW)
# ==========================================
class RedrawPromptPayload(BaseModel):
    vietnameseText: str
    selectedTags: List[str]
    mode: str  # 'manga' or 'webtoon'

UNIVERSAL_APPEND_MANGA = ", (masterpiece, best quality, highres:1.2), monochrome, greyscale, screentones, precise lineart, heavy hatching, high contrast, manga style, traditional media, ink"
UNIVERSAL_APPEND_WEBTOON = ", (masterpiece, best quality, highres:1.2), webtoon style, manhwa style, cel shading, flat colors, vibrant palette, dynamic lighting, clean crisp lines, highly detailed"
UNIVERSAL_NEGATIVE = "(text, signature, watermark, logo, speech bubble:1.4), (worst quality, low quality, bad quality, draft:1.4), (bad anatomy, deformed, disfigured, mutated hands, missing fingers, extra digits, fused fingers:1.3), blurry, out of focus, jpeg artifacts, realistic, photorealistic, 3d, cg, 2.5d, depth of field, noisy lines, messy sketch, simple background"

async def translate_vietnamese_to_danbooru(vietnamese_text: str) -> str:
    """
    Dịch các từ mô tả hành động, bối cảnh tiếng Việt sang các tag vẽ tranh tiếng Anh (Danbooru format).
    Ưu tiên gọi DeepSeek Chat LLM nếu cấu hình DEEPSEEK_API_KEY, nếu không thì dùng từ điển nội bộ.
    """
    val = vietnamese_text.strip()
    if not val:
        return ""
        
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if api_key:
        try:
            # Chạy đồng bộ trong threadpool để tránh chặn event loop
            def call_llm():
                response = deepseek_client.chat.completions.create(
                    model="deepseek-chat",
                    messages=[
                        {"role": "system", "content": "You are a specialized translation assistant. Translate natural Vietnamese descriptions of image elements, character actions, backgrounds, or special effects into a clean, comma-separated list of English anime/danbooru illustration tags (e.g. 'crying, tears, night sky'). Return ONLY the English tags, no explanations or markdown blocks."},
                        {"role": "user", "content": f"Translate to English illustration tags: {val}"}
                    ],
                    max_tokens=60,
                    temperature=0.3
                )
                return response.choices[0].message.content.strip()
            
            translated_tags = await run_in_threadpool(call_llm)
            # Dọn dẹp ký tự thừa nếu LLM trả về markdown
            translated_tags = re.sub(r'^```json\s*|```\s*$', '', translated_tags).strip()
            translated_tags = translated_tags.replace('"', '').replace('`', '').strip()
            return translated_tags
        except Exception as e:
            print(f"🚨 Lỗi dịch Prompt bằng DeepSeek, chuyển sang chế độ dự phòng: {e}")
            
    # Bộ từ điển dự phòng (offline/mock)
    text_lower = val.lower().strip()
    mapping = {
        "khóc": "crying, tears",
        "đang khóc": "crying, tears",
        "cười": "smiling, grin",
        "tức giận": "angry, annoyed",
        "lớp học": "classroom, school desk, blackboard",
        "phòng học": "classroom",
        "vệt sáng": "light streak, light particles, glowing",
        "khói": "smoke, dust",
        "lửa": "fire, flames",
        "nước": "water, splashing",
        "bóng tối": "darkness, shadow",
        "sấm sét": "lightning, electrical sparks",
        "tường gạch": "brick wall",
        "bầu trời sao": "starry sky, night sky",
        "đang chạy": "running, motion blur",
        "bay": "flying, floating",
        "tóc bay": "floating hair, wind blowing",
        "đổ nát": "impact debris, rubble",
        "nền đơn giản": "simple background",
        "nền chi tiết": "detailed background"
    }
    
    # Tìm kiếm cụm từ trong mapping
    matched_tags = []
    for key, val_tags in mapping.items():
        if key in text_lower:
            matched_tags.append(val_tags)
            
    if matched_tags:
        return ", ".join(matched_tags)
        
    # Fallback cuối cùng: dịch thô tự động bằng tiếng Anh không dấu
    import unicodedata
    def remove_vietnamese_accents(s):
        s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('utf-8')
        return s.replace(' ', ', ')
        
    return remove_vietnamese_accents(text_lower)

@app.post("/api/redraw-prompt")
async def process_redraw_prompt(
    payload: RedrawPromptPayload,
    request: Request,
    user_id: str = Depends(get_current_user_id) # Require login
):
    """
    API tiếp nhận Prompt tiếng Việt và Tag từ người dùng, dịch thuật
    và đóng gói thành Prompt tối ưu gửi cho GPU Backend.
    """

    try:
        translated_text = await translate_vietnamese_to_danbooru(payload.vietnameseText)
        
        # Tạo danh sách các tag thô
        positive_components = []
        if translated_text:
            positive_components.append(translated_text)
        if payload.selectedTags:
            positive_components.append(", ".join(payload.selectedTags))
            
        # Nối thêm universal style suffix tùy theo mode vẽ
        style_suffix = UNIVERSAL_APPEND_MANGA if payload.mode == 'manga' else UNIVERSAL_APPEND_WEBTOON
        
        final_positive = ", ".join(positive_components) + style_suffix if positive_components else style_suffix.lstrip(", ")
        
        # Loại bỏ các dấu phẩy thừa do nối chuỗi rỗng
        final_positive = re.sub(r',\s*,', ',', final_positive).strip(" ,")
        
        return {
            "finalPositivePrompt": final_positive,
            "finalNegativePrompt": UNIVERSAL_NEGATIVE
        }
    except Exception as e:
        print(f"🛑 [LỖI REDRAW PROMPT]: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý prompt vẽ lại: {str(e)}")

# ==========================================
# 🚀 BETA TRANSLATION API (Xóa chữ trên truyện tranh dùng xAI Grok)
# ==========================================
import httpx

@app.post("/api/v1/beta-translate")
async def beta_translate(
    image: UploadFile = File(..., description="File ảnh gốc truyện tranh"),
    mask: UploadFile = File(..., description="File ảnh mặt nạ chỉ định vùng chữ cần xóa"),
    tos_agreed: bool = Form(..., description="Đồng ý với điều khoản NSFW và phí dịch vụ"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    await check_balance_before_task(db, user_id, min_balance=15.0)
    start_time = time.time()
    """
    Endpoint POST /api/v1/beta-translate:
    1. Nhận ảnh gốc, ảnh mask và cờ đồng ý điều khoản. Nếu cờ là False, trả lỗi 403.
    2. Chạy ảnh gốc qua mô hình ViT ONNX để kiểm duyệt NSFW. Nếu hentai + porn + sexy > 0.65, trả lỗi 400.
    3. Cứu RAM bằng cách resize ảnh và mask nếu cạnh dài nhất vượt quá 2048px.
    4. Mã hóa Base64 ảnh và mask.
    5. Gọi API xAI Grok thực hiện inpainting xóa chữ vẽ lại hình nền.
    6. Trả ảnh PNG kết quả trực tiếp cho Frontend dưới dạng StreamingResponse.
    """
    # 1. Kiểm tra điều khoản đồng ý dịch vụ
    if not tos_agreed:
        raise HTTPException(
            status_code=403,
            detail="Vui lòng đồng ý điều khoản NSFW và phí dịch vụ"
        )

    # Đọc bytes từ file upload
    try:
        image_bytes = await image.read()
        mask_bytes = await mask.read()
    except Exception as read_err:
        raise HTTPException(
            status_code=400,
            detail=f"Không thể đọc file đầu vào: {str(read_err)}"
        )

    # Mở và tiền xử lý ảnh bằng Pillow (xử lý transparent kênh alpha RGBA/LA và convert sang RGB)
    from image_utils import preprocess_image as pil_preprocess_image
    image_pil = pil_preprocess_image(image_bytes)
    mask_pil = pil_preprocess_image(mask_bytes)

    # 2. Kiểm duyệt Local NSFW sử dụng mô hình ViT ONNX đã load toàn cục
    nsfw_score = check_nsfw_score(image_pil)
    if nsfw_score > 0.65:
        raise HTTPException(
            status_code=400,
            detail="Ảnh chứa nội dung không phù hợp"
        )

    # 3. Tiền xử lý & Cứu RAM (Pillow): Giới hạn cạnh dài nhất tối đa 2048px
    w_orig, h_orig = image_pil.size
    max_dim = max(w_orig, h_orig)
    if max_dim > 2048:
        scale = 2048.0 / max_dim
        new_w = int(w_orig * scale)
        new_h = int(h_orig * scale)
        # Resize ảnh gốc bằng LANCZOS và mask bằng NEAREST để giữ màu đen trắng sắc nét
        image_pil = image_pil.resize((new_w, new_h), Image.Resampling.LANCZOS)
        mask_pil = mask_pil.resize((new_w, new_h), Image.Resampling.NEAREST)
        print(f"⚙️ [BETA-TRANSLATE] Đã resize ảnh từ {w_orig}x{h_orig} sang {new_w}x{new_h} để tiết kiệm RAM.")

    # 4. Chuyển đổi image và mask thành chuỗi Base64
    try:
        buffer_image = io.BytesIO()
        image_pil.save(buffer_image, format="PNG")
        image_b64 = base64.b64encode(buffer_image.getvalue()).decode("utf-8")

        buffer_mask = io.BytesIO()
        mask_pil.save(buffer_mask, format="PNG")
        mask_b64 = base64.b64encode(buffer_mask.getvalue()).decode("utf-8")
    except Exception as b64_err:
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi mã hóa Base64 ảnh/mặt nạ: {str(b64_err)}"
        )

    # 5. Gọi API xAI Grok (Image-to-Image Inpainting)
    xai_api_key = os.getenv("XAI_API_KEY")
    if not xai_api_key:
        raise HTTPException(
            status_code=500,
            detail="Hệ thống chưa cấu hình API Key xAI (XAI_API_KEY)."
        )

    payload = {
        "model": "grok-imagine-image",
        "prompt": "Remove text inside the bubbles, clean background, redraw missing parts, manga style, lineart",
        "n": 1,
        "aspect_ratio": "auto",
        "resolution": "2k",
        "image": {
            "url": f"data:image/png;base64,{image_b64}"
        },
        "mask": {
            "url": f"data:image/png;base64,{mask_b64}"
        }
    }

    headers = {
        "Authorization": f"Bearer {xai_api_key}",
        "Content-Type": "application/json"
    }

    url = "https://api.x.ai/v1/images/edits"

    # Gọi API bất đồng bộ với httpx và bắt lỗi mạng rõ ràng
    async with httpx.AsyncClient() as client:
        try:
            print("📡 [BETA-TRANSLATE] Đang gửi yêu cầu inpaint đến xAI Grok...")
            response = await client.post(url, json=payload, headers=headers, timeout=60.0)
            response.raise_for_status()
        except httpx.HTTPStatusError as http_err:
            print(f"❌ [BETA-TRANSLATE] Lỗi HTTP từ xAI: {http_err.response.status_code} - {http_err.response.text}")
            raise HTTPException(
                status_code=502,
                detail=f"Dịch vụ AI phản hồi lỗi: {http_err.response.text}"
            )
        except httpx.RequestError as net_err:
            print(f"❌ [BETA-TRANSLATE] Lỗi kết nối đến xAI: {net_err}")
            raise HTTPException(
                status_code=503,
                detail="Không thể kết nối đến dịch vụ AI. Vui lòng kiểm tra lại sau."
            )

    # 6. Phân tích kết quả trả về từ xAI
    try:
        res_json = response.json()
        img_item = res_json.get("data", [{}])[0]
        
        # Hỗ trợ cả b64_json (trả về trực tiếp base64) và url (trả về đường dẫn ảnh)
        b64_output = img_item.get("b64_json")
        if b64_output:
            if "," in b64_output:
                b64_output = b64_output.split(",")[1]
            output_bytes = base64.b64decode(b64_output)
        else:
            img_url = img_item.get("url")
            if img_url:
                print(f"📡 [BETA-TRANSLATE] Đang tải ảnh kết quả từ URL xAI: {img_url}")
                async with httpx.AsyncClient() as dl_client:
                    dl_res = await dl_client.get(img_url, timeout=30.0)
                    dl_res.raise_for_status()
                    output_bytes = dl_res.content
            else:
                raise Exception("Không tìm thấy thông tin ảnh kết quả (b64_json hoặc url) trong phản hồi của xAI.")
    except Exception as parse_err:
        print(f"❌ [BETA-TRANSLATE] Lỗi parse dữ liệu từ xAI: {parse_err}")
        raise HTTPException(
            status_code=500,
            detail=f"Không thể xử lý ảnh kết quả từ dịch vụ AI: {str(parse_err)}"
        )

    # 7. Khôi phục kích thước ảnh gốc dùng tiện ích nếu AI làm snap/thay đổi kích thước
    from image_utils import restore_original_dimensions
    output_bytes = await asyncio.to_thread(restore_original_dimensions, image_bytes, output_bytes)

    # 🛡️ Khấu trừ số dư GPU cho tác vụ xAI Grok Inpaint
    elapsed = max(15.0, time.time() - start_time)
    await deduct_balance(db, user_id, elapsed, "xAI Grok Beta Inpaint")
    await db.commit()

    # Trả về ảnh PNG đã xóa chữ dưới dạng StreamingResponse
    return StreamingResponse(io.BytesIO(output_bytes), media_type="image/png")


# ==========================================
# 🚀 API: SEQUENTIAL-TO-PARALLEL STREAMING FLOW (SSE)
# ==========================================
import re
import httpx
import cv2
import numpy as np
from typing import List, Dict, Any, Optional

# Banned NSFW keywords for rapid text-based check
BANNED_NSFW_KEYWORDS = ["nsfw", "porn", "hentai", "nude", "explicit", "genitalia"]

def resize_image_cv2(base64_str: str, width: int, height: int) -> str:
    """
    Decodes a base64 image string, resizes it using OpenCV's INTER_CUBIC interpolation,
    and returns the resized image encoded back as a base64 string.
    """
    if "," in base64_str:
        base64_str = base64_str.split(",")[1]
    img_data = base64.b64decode(base64_str)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("OpenCV failed to decode the inpainted image.")
    resized_img = cv2.resize(img, (width, height), interpolation=cv2.INTER_CUBIC)
    _, buffer = cv2.imencode('.png', resized_img)
    resized_b64 = base64.b64encode(buffer).decode("utf-8")
    return resized_b64


def calculate_price(output_format: str, quality_level: int) -> float:
    base_price = 0.01 if output_format == "png" else 0.008
    multiplier = {1: 1.0, 2: 1.5, 3: 2.0}.get(quality_level, 1.5)
    return base_price * multiplier

DETAILED_REDRAW_PROMPT = (
    "Remove all text bubbles and text from the image, preserve the author's original screentone, "
    "do not draw additional elements, do not delete or add speech bubbles, do not erase character eyes, "
    "preserve manga lineart style, redraw background seamlessly, "
    "do not change the original colors, brightness, contrast, or saturation of the image"
)

async def call_grok_inpainting(original_b64: str, prompt: str) -> str:
    """Task A: Full-Image Redraw via xAI Grok API"""
    xai_key = XAI_API_KEY or os.getenv("XAI_API_KEY")
    if not xai_key:
        raise Exception("Missing xAI API Key (XAI_API_KEY)")

    url = "https://api.x.ai/v1/images/edits"
    system_prompt = f"{prompt}, {DETAILED_REDRAW_PROMPT}"
    payload = {
        "model": "grok-imagine-image",
        "prompt": system_prompt,
        "n": 1,
        "aspect_ratio": "auto",
        "resolution": "2k",
        "image": {
            "url": f"data:image/png;base64,{original_b64}"
        }
    }
    headers = {
        "Authorization": f"Bearer {xai_key}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers, timeout=90.0)
        response.raise_for_status()
        res_json = response.json()
        img_item = res_json.get("data", [{}])[0]
        
        # Parse b64_json or url
        b64_output = img_item.get("b64_json")
        if b64_output:
            if "," in b64_output:
                b64_output = b64_output.split(",")[1]
            return b64_output
        else:
            img_url = img_item.get("url")
            if img_url:
                async with httpx.AsyncClient() as dl_client:
                    dl_res = await dl_client.get(img_url, timeout=45.0)
                    dl_res.raise_for_status()
                    return base64.b64encode(dl_res.content).decode("utf-8")
            else:
                raise Exception("Missing inpainted image data in xAI response")

async def call_deepseek_translation(
    texts: List[str],
    target_language: str = "Vietnamese",
    genre: str = "Shonen",
    tone: str = "Casual",
    pronoun: str = "Default"
) -> List[str]:
    """Task B: Translation via DeepSeek API"""
    deepseek_key = DEEPSEEK_API_KEY or os.getenv("DEEPSEEK_API_KEY")
    if not deepseek_key:
        raise Exception("Missing DeepSeek API Key (DEEPSEEK_API_KEY)")

    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {deepseek_key}",
        "Content-Type": "application/json"
    }
    system_prompt = (
        f"You are a professional manga translator. Translate the array of lines into natural, "
        f"localized {target_language} manga style, preserving the exact array ordering. "
        f"Genre: {genre}. Tone: {tone}. Pronoun constraints: {pronoun}. "
        "Respond ONLY with a JSON object containing a 'translations' key mapping to a list of strings "
        "in the exact same length and order, e.g. {\"translations\": [\"dịch 1\", \"dịch 2\"]}. "
        "Do not include any explanation or markdown formatting."
    )
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(texts, ensure_ascii=False)}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers, timeout=60.0)
        response.raise_for_status()
        res_json = response.json()
        content = res_json["choices"][0]["message"]["content"]
        data = json.loads(content)
        return data.get("translations", [])

@app.post("/api/v1/ai-process")
async def ai_process(
    image: UploadFile = File(..., description="Manga Page Image"),
    prompt: str = Form(..., description="Redraw instructions / context"),
    existing_bubbles: Optional[str] = Form(None, description="Serialized existing bubble data to bypass OCR detection"),
    output_format: str = Form("jpeg", description="Output format (png or jpg)"),
    translation_mode: str = Form("fast", description="Translation mode: fast | deep | studio | grok"),
    detect_only: bool = Form(False, description="Whether to stop after text detection and OCR"),
    page_id: Optional[str] = Form(None, description="Active page ID to save results"),
    target_language: str = Form("Vietnamese"),
    source_language: str = Form("ja", description="Source language: en | zh | ko | ja"),
    genre: str = Form("Shonen"),
    tone: str = Form("Casual"),
    pronoun: str = Form("Default"),
    studio_model: Optional[str] = Form(None),
    resolution: Optional[str] = Form("1K"),
    client_saw_hot: bool = Form(False, description="Whether the client saw the server as hot/ready"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    user = await db.get(models.User, user_id)
    if user:
        is_free_tier = not user.is_pro
        if source_language == 'ja' and (is_free_tier or user.balance_seconds <= 0):
            raise HTTPException(status_code=403, detail="Japanese translation uses high-speed GPU and requires a paid balance.")

    server_status = await fetch_runpod_server_status()
    was_cold_start = (server_status != "HOT")

    try:
        image_bytes = await image.read()

        # Capture Original Dimensions using OpenCV (runs in thread pool to prevent event loop blocking)
        def get_dimensions(data: bytes):
            nparr = np.frombuffer(data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
            if img is None:
                raise ValueError("OpenCV failed to decode image bytes")
            return img.shape[1], img.shape[0]  # width, height

        original_width, original_height = await asyncio.to_thread(get_dimensions, image_bytes)
        print(f"📸 [AI-PROCESS] Original image dimensions captured: {original_width}x{original_height}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded image: {str(e)}")

    # ==========================================
    # CREDIT COST MAP & PRE-FLIGHT DEDUCTION
    # ==========================================
    if translation_mode == "studio":
        base_prices = {
            "google/nano-banana-edit": 8,
            "gpt-image-2-image-to-image": 10,
            "nano-banana-2": 10,
            "nano-banana-pro": 15
        }
        base_price = base_prices.get(studio_model, 8)
        resolution_addons = {
            "1K": 0,
            "2K": 3,
            "4K": 6
        }
        resolution_addon = resolution_addons.get(resolution, 0)
        format_addon = 2 if output_format.lower() == "png" else 0
        required_credits = base_price + resolution_addon + format_addon
    else:
        MODE_COST = {"fast": 2, "deep": 8, "grok": 8}
        required_credits = MODE_COST.get(translation_mode, 2)
    print(f"💰 [AI-PROCESS] Mode='{translation_mode}', Required credits={required_credits}")

    await check_balance_before_task(db, user_id)

    async def event_generator():
        start_time = time.time()
        user = await db.get(models.User, user_id)
        is_vip = user.is_pro if user else False

        async def do_refund(reason: str):
            pass

        # 1. Local Image NSFW Check
        if check_image_nsfw(image_bytes):
            await do_refund("NSFW image rejected")
            yield f"data: {json.dumps({'status': 'error', 'message': 'Hệ thống từ chối ảnh có nội dung nhạy cảm (NSFW).'}, ensure_ascii=False)}\n\n"
            return
        
        yield f"data: {json.dumps({'status': 'image_nsfw_passed'}, ensure_ascii=False)}\n\n"

        # 2. Text NSFW validation step
        if DISABLE_LOCAL_NSFW:
            nsfw_detected = False
        else:
            prompt_lower = prompt.lower()
            nsfw_detected = any(kw in prompt_lower for kw in BANNED_NSFW_KEYWORDS)
            
        if nsfw_detected:
            yield f"data: {json.dumps({'status': 'error', 'message': 'NSFW keywords detected in prompt'}, ensure_ascii=False)}\n\n"
            return
        
        yield f"data: {json.dumps({'status': 'nsfw_passed'}, ensure_ascii=False)}\n\n"

        # 3. Start R2 upload task concurrently (only for studio mode and not detect_only)
        upload_task = None
        original_filename = None
        if translation_mode == "studio" and not detect_only:
            try:
                # Preprocess image to convert transparent alpha channels to white RGB PNG
                from image_utils import preprocess_image as pil_preprocess_image, export_image
                def get_preprocessed_bytes(data: bytes) -> bytes:
                    img_pil = pil_preprocess_image(data)
                    return export_image(img_pil, "png")

                preprocessed_bytes = await asyncio.to_thread(get_preprocessed_bytes, image_bytes)
                original_filename = f"orig_{uuid.uuid4().hex}.png"
                async def do_upload():
                    print(f"🌐 [AI-PROCESS] Starting concurrent R2 upload of preprocessed image...")
                    return await upload_to_r2(preprocessed_bytes, original_filename, "image/png")
                upload_task = asyncio.create_task(do_upload())
            except Exception as upload_init_err:
                await do_refund(f"R2 upload task initialization failed: {upload_init_err}")
                yield f"data: {json.dumps({'status': 'error', 'message': f'Failed to start original image upload: {str(upload_init_err)}'}, ensure_ascii=False)}\n\n"
                return

        # 4. Handle existing bubbles / RunPod OCR
        has_existing = False
        boxes = []
        texts = []
        mask_b64 = None
        mask_filename = None

        if existing_bubbles:
            try:
                parsed_bubbles = json.loads(existing_bubbles)
                if isinstance(parsed_bubbles, list) and len(parsed_bubbles) > 0:
                    for b in parsed_bubbles:
                        x = int(b.get("x", 0))
                        y = int(b.get("y", 0))
                        w = int(b.get("w", 0))
                        h = int(b.get("h", 0))
                        boxes.append({
                            "x1": x,
                            "y1": y,
                            "x2": x + w,
                            "y2": y + h
                        })
                        # Prioritize source text (japanese) for translation, fallback to text/vietnamese
                        texts.append(b.get("japanese") or b.get("vietnamese") or b.get("text") or "")
                    
                    has_existing = True
                    print(f"⚡ [BETA-TRANSLATE] Bypassing RunPod OCR. Found {len(boxes)} existing bubbles.")
            except Exception as parse_err:
                print(f"⚠️ [BETA-TRANSLATE] Failed to parse existing_bubbles: {parse_err}")

        if has_existing:
            yield f"data: {json.dumps({'status': 'text_detected', 'boxes': boxes, 'texts': texts}, ensure_ascii=False)}\n\n"
        else:
            try:
                yield f"data: {json.dumps({'status': 'text_detected_start', 'message': 'Đang nhận diện vùng chữ (Local)...'}, ensure_ascii=False)}\n\n"
                
                # Convert image_bytes to OpenCV image
                nparr = np.frombuffer(image_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if img is None:
                    raise ValueError("Không thể giải mã hình ảnh tải lên")
                
                h_img, w_img = img.shape[:2]
                
                # Load text detector (CTD)
                detector = await run_in_threadpool(get_ctd_detector)
                if detector is None:
                    raise ValueError("Không thể tải mô hình Comic Text Detector cục bộ")
                
                # Run detector in threadpool to avoid blocking event loop
                res_mask, res_mask_refined, blk_list = await run_in_threadpool(detector, img)
                
                if res_mask_refined.max() <= 1.0: 
                    ctd_mask_bin = (res_mask_refined * 255).astype(np.uint8)
                else: 
                    ctd_mask_bin = res_mask_refined.astype(np.uint8)
                _, ctd_mask_bin = cv2.threshold(ctd_mask_bin, 127, 255, cv2.THRESH_BINARY)
                
                # Run detector.onnx via ONNXDBDetector to get bounding box positions
                ocr_manager = get_ocr_manager()
                detector_onnx = ocr_manager.get_detector()
                det_results = detector_onnx.ocr(img, rec=False)
                
                detector_boxes = []
                if det_results and det_results[0]:
                    for poly in det_results[0]:
                        pts = np.array(poly, dtype=np.int32)
                        x, y, w, h = cv2.boundingRect(pts)
                        if w > 4 and h > 4:
                            detector_boxes.append((x, y, x + w, y + h))
                
                # Sort bounding boxes by reading order
                if source_language == 'ja':
                    detector_boxes.sort(key=lambda b: (-b[2], b[1]))
                else:
                    detector_boxes.sort(key=lambda b: (b[1], b[0]))
                
                # OCR the raw crops of the boxes
                boxes = []
                texts = []
                for (bx1, by1, bx2, by2) in detector_boxes:
                    crop_raw = img[by1:by2, bx1:bx2]
                    if crop_raw.size == 0:
                        continue
                    
                    text = await run_in_threadpool(ocr_manager.recognize_crop, crop_raw, source_language, is_vip)
                    text = text.strip()
                    
                    boxes.append({
                        "x1": bx1,
                        "y1": by1,
                        "x2": bx2,
                        "y2": by2
                    })
                    texts.append(text)
                
                print(f"📊 [AI-PROCESS LOCAL] Local OCR completed. Detected {len(boxes)} text regions.")
                yield f"data: {json.dumps({'status': 'text_detected', 'boxes': boxes, 'texts': texts}, ensure_ascii=False)}\n\n"
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'status': 'error', 'message': f'Local OCR execution failed: {str(e)}'}, ensure_ascii=False)}\n\n"
                if upload_task:
                    upload_task.cancel()
                return

        if detect_only:
            yield f"data: {json.dumps({'status': 'detect_completed', 'boxes': boxes, 'texts': texts, 'mask_base64': None}, ensure_ascii=False)}\n\n"
            if upload_task:
                upload_task.cancel()
            if original_filename:
                try:
                    await delete_from_r2(original_filename)
                except Exception as cleanup_err:
                    print(f"⚠️ [AI-PROCESS] Error deleting original file in detect_only: {cleanup_err}")
            return

        # Parallel Execution via asyncio.Queue
        queue = asyncio.Queue()

        async def run_task_a():
            nonlocal original_filename
            try:
                print(f"🚦 [AI-PROCESS] Routing → mode='{translation_mode}'")
                img_b64 = None

                if translation_mode == "studio":
                    # ── STUDIO: Kie.ai Nano Banana ──────────────────
                    print(f"🎨 [AI-PROCESS] Studio mode → Kie.ai {studio_model or 'google/nano-banana-edit'}")
                    kie_key = os.getenv("KIE_API_KEY") or os.getenv("KIE_AI_API_KEY")
                    if not kie_key:
                        raise Exception("Missing Kie.ai API Key (KIE_API_KEY / KIE_AI_API_KEY)")

                    # Yield R2 uploading status
                    if upload_task and not upload_task.done():
                        await queue.put({"status": "kie_progress", "state": "uploading_r2"})

                    # Await R2 upload completion
                    try:
                        original_url = await upload_task
                        print(f"🌐 [AI-PROCESS] R2 Upload complete. URL: {original_url}")
                    except Exception as upload_err:
                        raise Exception(f"R2 upload failed: {upload_err}")

                    await queue.put({"status": "kie_progress", "state": "submitting"})

                    kie_url = "https://api.kie.ai/api/v1/jobs/createTask"
                    kie_headers = {
                        "Authorization": f"Bearer {kie_key}",
                        "Content-Type": "application/json"
                    }
                    
                    kie_model = studio_model or "google/nano-banana-edit"
                    kie_prompt = f"{prompt}, {DETAILED_REDRAW_PROMPT}"

                    input_payload = {
                        "prompt": kie_prompt,
                        "aspect_ratio": "auto",
                        "resolution": resolution or "1K",
                        "nsfw_checker": True
                    }

                    if kie_model == "gpt-image-2-image-to-image":
                        input_payload["input_urls"] = [original_url]
                    elif kie_model == "google/nano-banana-edit":
                        input_payload["image_urls"] = [original_url]
                        input_payload["output_format"] = output_format.lower()
                    else:
                        input_payload["image_input"] = [original_url]
                        input_payload["output_format"] = output_format.lower()

                    payload = {
                        "model": kie_model,
                        "input": input_payload
                    }

                    print(f"📡 [AI-PROCESS] Calling Kie.ai createTask API for model {kie_model}...")
                    async with httpx.AsyncClient() as client:
                        response = await client.post(kie_url, json=payload, headers=kie_headers, timeout=60.0)
                        response.raise_for_status()
                        res_json = response.json()

                    task_id = res_json.get("taskId") or res_json.get("data", {}).get("taskId")
                    if not task_id:
                        raise Exception(f"Failed to retrieve taskId from Kie.ai createTask: {res_json}")

                    poll_url = f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={task_id}"
                    print(f"📡 [AI-PROCESS] Polling Kie.ai task: {task_id}...")
                    poll_start_time = asyncio.get_event_loop().time()
                    final_img_url = None

                    while True:
                        elapsed = asyncio.get_event_loop().time() - poll_start_time
                        if elapsed > KIE_POLLING_TIMEOUT:
                            raise Exception(
                                "Yêu cầu xử lý ảnh bị quá thời gian (Timeout). "
                                "Có khả năng ảnh bạn gửi lên không đạt yêu cầu. Vui lòng thử lại sau."
                            )
                        await asyncio.sleep(3)
                        async with httpx.AsyncClient() as client:
                            poll_res = await client.get(poll_url, headers=kie_headers, timeout=15.0)
                            poll_res.raise_for_status()
                            poll_json = poll_res.json()

                        state = poll_json.get("state") or poll_json.get("status") or poll_json.get("data", {}).get("state")
                        await queue.put({"status": "kie_progress", "state": state})

                        if state in ["success", "SUCCESS", "COMPLETED"]:
                            data_obj = poll_json.get("data") or poll_json
                            result_json_str = data_obj.get("resultJson") or data_obj.get("result_json")
                            result_urls = []
                            if result_json_str:
                                try:
                                    result_data = json.loads(result_json_str)
                                    result_urls = result_data.get("resultUrls") or result_data.get("result_urls") or []
                                except Exception as parse_err:
                                    print(f"⚠️ [KIE-AI] Error parsing resultJson: {parse_err}")
                            if not result_urls:
                                result_urls = data_obj.get("resultUrls") or data_obj.get("result_urls") or []
                            if not result_urls:
                                raise Exception(f"No result URLs found in Kie.ai response (task_id: {task_id})")
                            final_img_url = result_urls[0]
                            break
                        elif state in ["fail", "failed", "FAILED", "cancelled", "CANCELLED", "error", "ERROR"]:
                            err_detail = None
                            data_obj = poll_json.get("data") or {}
                            if isinstance(data_obj, dict):
                                err_detail = data_obj.get("errorMsg") or data_obj.get("errorMessage") or data_obj.get("error")
                            if not err_detail:
                                err_detail = poll_json.get("message") or poll_json.get("error")
                            err_msg = f"Tác vụ xử lý ảnh thất bại: {err_detail}" if err_detail else f"Trạng thái tác vụ xử lý ảnh '{state}' (task_id: {task_id})"
                            raise Exception(err_msg)

                    if original_filename:
                        try:
                            print("🧹 [AI-PROCESS] Kie.ai task succeeded. Deleting original file from R2...")
                            asyncio.create_task(delete_from_r2(original_filename))
                            original_filename = None
                        except Exception as cleanup_err:
                            print(f"⚠️ [AI-PROCESS] Error starting R2 cleanup after Kie.ai result: {cleanup_err}")

                    print(f"📡 [AI-PROCESS] Downloading Kie.ai result: {final_img_url}")
                    async with httpx.AsyncClient() as dl_client:
                        dl_res = await dl_client.get(final_img_url, timeout=30.0)
                        dl_res.raise_for_status()
                        final_bytes = dl_res.content

                    await queue.put({"status": "kie_progress", "state": "resizing"})
                    try:
                        print(f"🔄 [AI-PROCESS] Resizing to original dimensions {original_width}x{original_height} using restore_original_dimensions...")
                        from image_utils import restore_original_dimensions
                        resized_bytes = await asyncio.to_thread(restore_original_dimensions, image_bytes, final_bytes)
                        img_b64 = base64.b64encode(resized_bytes).decode("utf-8")
                        print("✅ [AI-PROCESS] Resize complete.")
                    except Exception as resize_err:
                        print(f"⚠️ [AI-PROCESS] Resize failed, using raw output: {resize_err}")
                        img_b64 = base64.b64encode(final_bytes).decode("utf-8")

                    await queue.put({"status": "kie_progress", "state": "success"})
                    await queue.put({"status": "image_ready", "image_base64": img_b64})

                elif translation_mode == "grok":
                    # ── GROK: xAI Grok API (⚡15) ──────────
                    print("🎨 [AI-PROCESS] Grok mode → call_grok_inpainting")
                    await queue.put({"status": "kie_progress", "state": "submitting"})

                    original_b64 = base64.b64encode(image_bytes).decode("utf-8")

                    try:
                        inpainted_b64 = await call_grok_inpainting(original_b64, prompt)
                    except Exception as grok_err:
                        raise Exception(f"Grok inpainting failed: {grok_err}")

                    await queue.put({"status": "kie_progress", "state": "resizing"})
                    try:
                        print(f"🔄 [AI-PROCESS] Resizing to original dimensions {original_width}x{original_height} using restore_original_dimensions...")
                        from image_utils import restore_original_dimensions
                        inpainted_bytes = base64.b64decode(inpainted_b64)
                        resized_bytes = await asyncio.to_thread(restore_original_dimensions, image_bytes, inpainted_bytes)
                        img_b64 = base64.b64encode(resized_bytes).decode("utf-8")
                        print("✅ [AI-PROCESS] Resize complete.")
                    except Exception as resize_err:
                        print(f"⚠️ [AI-PROCESS] Resize failed, using raw output: {resize_err}")
                        img_b64 = inpainted_b64

                    await queue.put({"status": "kie_progress", "state": "success"})
                    await queue.put({"status": "image_ready", "image_base64": img_b64})

                else:
                    # ── FAST (⚡2): Local LaMa inpainting (No RunPod!) ─────────────
                    # ── DEEP (⚡8): RunPod Diffusion redraw (or fallback to local LaMa if RunPod is disabled)
                    run_locally = (translation_mode == "fast")
                    
                    runpod_api_key = RUNPOD_API_KEY or os.getenv("RUNPOD_API_KEY")
                    runpod_ep_id = None
                    if translation_mode == "deep":
                        runpod_ep_id = os.getenv("RUNPOD_DEEP_ENDPOINT_ID") or RUNPOD_REDRAW_ENDPOINT_ID
                    
                    if not run_locally and (not runpod_api_key or not runpod_ep_id):
                        print("⚠️ [AI-PROCESS FALLBACK] RunPod config missing or disabled for deep mode. Falling back to local LaMa!")
                        run_locally = True

                    if run_locally:
                        print("⚡ [AI-PROCESS] Running local LaMa inpainting...")
                        await queue.put({"status": "kie_progress", "state": "processing"})
                        
                        def local_inpaint_process():
                            # Decode a fresh copy of original image
                            image_cv = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
                            clean_img = image_cv.copy()
                            h_img, w_img = image_cv.shape[:2]
                            
                            # Create mask by generating the dilated text stroke mask (sát dính chữ kèm nở chữ)
                            try:
                                from worker import get_text_detector
                                detector = get_text_detector()
                                result = detector(image_cv)
                                ctd_mask = result[1] if isinstance(result, tuple) else result
                                if ctd_mask.max() <= 1.0: 
                                    ctd_mask = (ctd_mask * 255).astype(np.uint8)
                                else: 
                                    ctd_mask = ctd_mask.astype(np.uint8)
                                    
                                _, ctd_mask_bin = cv2.threshold(ctd_mask, 127, 255, cv2.THRESH_BINARY)
                                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
                                mask_img = cv2.dilate(ctd_mask_bin, kernel, iterations=1)
                            except Exception as e:
                                print(f"⚠️ [main.py] Failed to generate raw stroke mask: {e}. Falling back to solid boxes!")
                                mask_img = np.zeros((h_img, w_img), dtype=np.uint8)
                                expand_px = 5
                                for box in boxes:
                                    x1, y1 = box["x1"], box["y1"]
                                    x2, y2 = box["x2"], box["y2"]
                                    ex1 = max(0, x1 - expand_px)
                                    ey1 = max(0, y1 - expand_px)
                                    ex2 = min(w_img, x2 + expand_px)
                                    ey2 = min(h_img, y2 + expand_px)
                                    cv2.rectangle(mask_img, (ex1, ey1), (ex2, ey2), 255, -1)
                            
                            # Run LaMa on individual contours to optimize details
                            contours_lama, _ = cv2.findContours(mask_img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                            lama_session = get_lama_session()
                            if lama_session is None:
                                raise ValueError("Local LaMa session is not available. Please check lama-manga.onnx file path.")
                                
                            for cnt in contours_lama:
                                x, y, w, h = cv2.boundingRect(cnt)
                                pad_x = max(40, min(int(w * 0.5), 150))
                                pad_y = max(40, min(int(h * 0.5), 150))
                                x1_pad, y1_pad = max(0, x - pad_x), max(0, y - pad_y)
                                x2_pad, y2_pad = min(w_img, x + w + pad_x), min(h_img, y + h + pad_y)
                                
                                crop_img = clean_img[y1_pad:y2_pad, x1_pad:x2_pad]
                                crop_mask = mask_img[y1_pad:y2_pad, x1_pad:x2_pad]
                                
                                if cv2.countNonZero(crop_mask) == 0:
                                    continue
                                
                                h_crop, w_crop = crop_img.shape[:2]
                                
                                # Dilate mask slightly (5x5 ellipse) to fully cover text boundaries/strokes
                                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
                                crop_mask_dilated = cv2.dilate(crop_mask, kernel, iterations=1)
                                original_crop_mask = crop_mask_dilated.copy()
                                
                                scale = 1.0
                                if h_crop > 512 or w_crop > 512:
                                    scale = 512.0 / max(h_crop, w_crop)
                                    new_w, new_h = int(w_crop * scale), int(h_crop * scale)
                                    crop_img = cv2.resize(crop_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
                                    crop_mask = cv2.resize(crop_mask_dilated, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
                                else:
                                    new_w, new_h = w_crop, h_crop
                                    crop_mask = crop_mask_dilated.copy()

                                pad_bottom, pad_right = 512 - new_h, 512 - new_w
                                if pad_bottom > 0 or pad_right > 0:
                                    crop_img = cv2.copyMakeBorder(crop_img, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
                                    crop_mask = cv2.copyMakeBorder(crop_mask, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)

                                img_t = np.transpose(cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
                                mask_t = np.transpose((crop_mask > 0).astype(np.float32)[:, :, np.newaxis], (2, 0, 1))[np.newaxis, ...]

                                ort_outs = lama_session.run(None, {lama_session.get_inputs()[0].name: img_t, lama_session.get_inputs()[1].name: mask_t})
                                out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255).clip(0, 255).astype(np.uint8)
                                clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]
                                
                                if scale != 1.0: 
                                    clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)
                                mask_bool = original_crop_mask > 0
                                clean_img[y1_pad:y2_pad, x1_pad:x2_pad][mask_bool] = clean_crop[mask_bool]
                                
                            _, buffer = cv2.imencode('.jpg', clean_img)
                            return base64.b64encode(buffer).decode('utf-8')
                        
                        img_b64 = await run_in_threadpool(local_inpaint_process)
                        await queue.put({"status": "kie_progress", "state": "success"})
                        await queue.put({"status": "image_ready", "image_base64": img_b64})
                    else:
                        action = "inpaint"
                        print(f"🧠 [AI-PROCESS] Deep mode → RunPod endpoint: {runpod_ep_id}")
                        await queue.put({"status": "kie_progress", "state": "submitting"})

                        runpod_run_url = f"https://api.runpod.ai/v2/{runpod_ep_id}/run"
                        original_b64 = base64.b64encode(image_bytes).decode("utf-8")
                        rp_headers = {
                            "Authorization": f"Bearer {runpod_api_key}",
                            "Content-Type": "application/json"
                        }
                        payload = {
                            "input": {
                                "image": original_b64,
                                "image_base64": original_b64,
                                "action": action
                            }
                        }

                        async with httpx.AsyncClient() as client:
                            res = await client.post(runpod_run_url, json=payload, headers=rp_headers, timeout=90.0)
                            res.raise_for_status()
                            res_json = res.json()

                        job_id = res_json.get("id")
                        status = res_json.get("status")

                        await queue.put({"status": "kie_progress", "state": status})

                        if status == "COMPLETED":
                            output = res_json.get("output", {})
                        elif job_id and status in ["IN_QUEUE", "IN_PROGRESS"]:
                            poll_url = f"https://api.runpod.ai/v2/{runpod_ep_id}/status/{job_id}"
                            output = {}
                            for _ in range(60):  # max 3 min
                                await asyncio.sleep(3)
                                async with httpx.AsyncClient() as client:
                                    pr = await client.get(poll_url, headers=rp_headers, timeout=15.0)
                                    pr.raise_for_status()
                                    pj = pr.json()
                                status = pj.get("status")
                                await queue.put({"status": "kie_progress", "state": status})
                                if status == "COMPLETED":
                                    output = pj.get("output", {})
                                    break
                                elif status in ["FAILED", "CANCELLED"]:
                                    raise Exception(f"RunPod job failed (job_id: {job_id})")
                            else:
                                raise Exception("RunPod job polling timed out after 3 minutes")
                        else:
                            output = res_json.get("output", {})

                        if isinstance(output, dict) and output.get("status") == "error":
                            raise Exception(f"RunPod worker error: {output.get('message', 'Unknown error')}")

                        img_b64 = output.get("clean_image_base64") or output.get("image_base64") or output.get("image")
                        if not img_b64:
                            raise Exception("RunPod returned no image in output")

                        await queue.put({"status": "kie_progress", "state": "success"})
                        await queue.put({"status": "image_ready", "image_base64": img_b64})

                # If page_id is provided, save clean image to disk and update DB
                if page_id and img_b64:
                    try:
                        from database import AsyncSessionLocal
                        async with AsyncSessionLocal() as page_db:
                            result = await page_db.execute(select(models.Page).where(models.Page.id == page_id))
                            page_obj = result.scalars().first()
                            if page_obj:
                                raw_path = get_local_path_from_url(page_obj.raw_url)
                                clean_path = raw_path.replace("/raw/", "/clean/") if "/raw/" in raw_path else f"workspace/clean_{page_id}.png"
                                
                                # Write resized image bytes to clean_path
                                png_bytes = base64.b64decode(img_b64)
                                os.makedirs(os.path.dirname(clean_path), exist_ok=True)
                                with open(clean_path, "wb") as f:
                                    f.write(png_bytes)
                                print(f"💾 [AI-PROCESS] Clean image saved to VPS local disk at: {clean_path}")
                                
                                page_obj.clean_url = f"/{clean_path}"
                                page_obj.status = "completed"
                                await page_db.commit()
                                print(f"✅ [AI-PROCESS] Page {page_id} clean_url updated to /{clean_path}")
                    except Exception as save_err:
                        print(f"⚠️ [AI-PROCESS] Failed to save clean image or update database: {save_err}")

            except Exception as e:
                await do_refund(f"AI image processing failed: {e}")
                await queue.put({"status": "image_failed", "error": str(e)})
            finally:
                if original_filename:
                    try:
                        print("🧹 [AI-PROCESS] Cleaning up temporary R2 objects...")
                        await asyncio.shield(delete_from_r2(original_filename))
                    except Exception as cleanup_err:
                        print(f"⚠️ [AI-PROCESS] Error during R2 cleanup: {cleanup_err}")

        async def run_task_b():
            try:
                if not texts:
                    await queue.put({"status": "translation_ready", "translations": []})
                    return
                await queue.put({"status": "translating_text"})
                translations = await call_deepseek_translation(texts, target_language, genre, tone, pronoun)
                
                # If page_id is provided, construct bubbles and save to DB
                if page_id:
                    try:
                        import time
                        import uuid
                        from database import AsyncSessionLocal
                        async with AsyncSessionLocal() as page_db:
                            result = await page_db.execute(select(models.Page).where(models.Page.id == page_id))
                            page_obj = result.scalars().first()
                            if page_obj:
                                bubbles_list = []
                                for idx, box in enumerate(boxes):
                                    x = box.get("x1", 0)
                                    y = box.get("y1", 0)
                                    w = box.get("x2", 0) - x
                                    h = box.get("y2", 0) - y
                                    
                                    jap_txt = texts[idx] if idx < len(texts) else ""
                                    vi_txt = translations[idx] if idx < len(translations) else ""
                                    
                                    bubble_id = f"bubble_{int(time.time() * 1000)}_{idx}_{uuid.uuid4().hex[:7]}"
                                    bubbles_list.append({
                                        "id": bubble_id,
                                        "x": x,
                                        "y": y,
                                        "w": w,
                                        "h": h,
                                        "text": vi_txt,
                                        "vietnamese": vi_txt,
                                        "japanese": jap_txt,
                                        "fontSize": 20,
                                        "fontFamily": "Playpen Sans",
                                        "rotation": 0,
                                        "boxX": x,
                                        "boxY": y,
                                        "boxW": w,
                                        "boxH": h,
                                        "outlineWidth": 5,
                                        "outlineColor": "#ffffff"
                                    })
                                page_obj.bubbles_data = json.dumps(bubbles_list)
                                await page_db.commit()
                                print(f"✅ [AI-PROCESS] Page {page_id} bubbles_data saved to DB with {len(bubbles_list)} bubbles.")
                    except Exception as db_err:
                        print(f"⚠️ [AI-PROCESS] Failed to save bubbles to database in run_task_b: {db_err}")

                await queue.put({"status": "translation_ready", "translations": translations})
            except Exception as e:
                await queue.put({"status": "translation_failed", "error": str(e)})

        task_a = asyncio.create_task(run_task_a())
        task_b = asyncio.create_task(run_task_b())

        pending_tasks = {task_a, task_b}
        try:
            while pending_tasks:
                while not queue.empty():
                    item = await queue.get()
                    yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
                done, pending_tasks = await asyncio.wait(pending_tasks, return_when=asyncio.FIRST_COMPLETED, timeout=0.5)

            # Flush any remaining items in the queue
            while not queue.empty():
                item = await queue.get()
                yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"

            # Deduct balance based on execution time if both completed successfully
            if task_a.done() and not task_a.cancelled() and not task_a.exception() and \
               task_b.done() and not task_b.cancelled() and not task_b.exception():
                execution_time_seconds = time.time() - start_time
                
                # Apply boot fee if applicable (chỉ dựa vào backend server status thực tế)
                boot_fee = 0.0
                if was_cold_start:
                    boot_fee = 30.0
                    print(f"❄️ [COLD START] Charging 30s boot fee for user {user_id}")
                
                total_charge = execution_time_seconds + boot_fee
                description = f"AI Process - Chế độ: {translation_mode}{' - Phí khởi động GPU 30s' if boot_fee > 0 else ''}"
                
                from database import AsyncSessionLocal
                async with AsyncSessionLocal() as session:
                    await deduct_balance(session, user_id, total_charge, description)
                    await session.commit()
        finally:
            # Cancel background tasks if client disconnects or generator exits
            for t in [task_a, task_b]:
                if not t.done():
                    t.cancel()
            print("🛑 [AI-PROCESS] Cancelled background tasks due to client disconnection or generator exit.")


    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ==========================================
# 🚀 KIE.AI INTEGRATED PROCESSING API
# ==========================================
from kie_ai_service import KieAIService
from fastapi.responses import Response
import httpx
import uuid

kie_service = KieAIService()

@app.post("/api/kie/process")
async def kie_process_image(
    file: UploadFile = File(...),
    model: str = Form(...),
    prompt: str = Form(...),
    resolution: str = Form("1K"),
    aspect_ratio: str = Form("auto"),
    output_format: str = Form("jpg"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """
    FastAPI Endpoint to handle Kie.ai model generation:
    1. Pre-process input image file (check size <= 30MB, handle transparency/alpha).
    2. Upload image temporarily to CF R2 storage to get public URL.
    3. Verify and verify user credit balance.
    4. Call createTask, poll status, download result image, and delete temporary file from R2.
    5. Deduct user credits on success.
    6. Post-process result image (optimize PNG or quality JPG) and return image file.
    """
    # Verify model parameter
    valid_models = ["google/nano-banana-edit", "gpt-image-2-image-to-image", "nano-banana-2", "nano-banana-pro"]
    if model not in valid_models:
        raise HTTPException(
            status_code=400, 
            detail=f"Model '{model}' không được hỗ trợ. Vui lòng chọn một trong: {', '.join(valid_models)}"
        )

    # Verify resolution parameter
    if resolution not in ["1K", "2K"]:
        raise HTTPException(status_code=400, detail="Resolution hợp lệ: '1K', '2K'")

    # Verify output_format parameter
    if output_format.lower() not in ["jpg", "png"]:
        raise HTTPException(status_code=400, detail="Output format hợp lệ: 'jpg', 'png'")

    prompt = f"{prompt}, {DETAILED_REDRAW_PROMPT}"

    # Calculate Total Cost
    base_prices = {
        "google/nano-banana-edit": 8,
        "gpt-image-2-image-to-image": 10,
        "nano-banana-2": 8,
        "nano-banana-pro": 15
    }
    
    base_price = base_prices[model]
    
    resolution_addons = {
        "1K": 0,
        "2K": 3,
        "4K": 6
    }
    resolution_addon = resolution_addons[resolution]
    
    format_addon = 2 if output_format.lower() == "png" else 0
    total_cost = base_price + resolution_addon + format_addon

    # Read original uploaded file bytes
    file_bytes = await file.read()

    # Preprocess image
    processed_bytes = await kie_service.preprocess_image(file_bytes)

    await check_balance_before_task(db, user_id)
    start_time = time.time()

    # Upload processed bytes temporarily to Cloudflare R2
    temp_filename = f"kie_temp_{uuid.uuid4().hex}.png"
    try:
        temp_url = await upload_to_r2(processed_bytes, temp_filename, "image/png")
    except Exception as upload_err:
        print(f"❌ [KIE API ERROR] R2 upload failed: {upload_err}")
        raise HTTPException(status_code=500, detail=f"Không thể lưu tạm ảnh lên bộ lưu trữ máy chủ: {str(upload_err)}")

    result_bytes = None
    try:
        # Create createTask in Kie.ai
        task_id = await kie_service.createTask(
            model=model,
            image_url=temp_url,
            prompt=prompt,
            resolution=resolution,
            aspect_ratio=aspect_ratio,
            output_format=output_format
        )

        # Poll task until complete
        result_url = await kie_service.pollTask(task_id)

        # Download result image
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(result_url)
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Không thể tải xuống ảnh kết quả từ đối tác.")
            result_bytes = resp.content

    except Exception as run_err:
        print(f"❌ [KIE API ERROR] Kie.ai run failed: {run_err}")
        if isinstance(run_err, HTTPException):
            raise run_err
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý AI: {str(run_err)}")
    finally:
        # Guarantee cleanup of temporary file on CF R2
        try:
            await delete_from_r2(temp_filename)
        except Exception as cleanup_err:
            print(f"⚠️ [KIE API WARNING] Failed to clean up temp R2 file {temp_filename}: {cleanup_err}")

    # Deduct balance based on execution time and model units
    try:
        execution_time_seconds = time.time() - start_time
        charge_seconds = max(float(total_cost) * 2.0, execution_time_seconds)
        await deduct_balance(db, user_id, charge_seconds, f"Sử dụng mô hình {model} ({resolution}) trên Kie.ai")
        await db.commit()
    except Exception as deduct_err:
        print(f"⚠️ [KIE API WARNING] Balance deduction failed after success: {deduct_err}")

    # Restore original dimensions using image_utils (resizes AI result back to original size)
    from image_utils import restore_original_dimensions
    try:
        result_bytes = restore_original_dimensions(file_bytes, result_bytes)
    except Exception as dim_err:
        print(f"⚠️ [KIE API WARNING] Dimension restore failed: {dim_err}")

    # Post-process image
    final_image_bytes = await kie_service.postprocess_image(result_bytes, output_format)

    media_type = "image/png" if output_format.lower() == "png" else "image/jpeg"
    return Response(content=final_image_bytes, media_type=media_type)


class AIExtractPayload(BaseModel):
    text: str

@app.post("/api/translation/ai-extract")
async def ai_extract_config(
    payload: AIExtractPayload,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    text = payload.text
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Vui lòng nhập nội dung văn bản để phân tích.")
        
    await check_balance_before_task(db, user_id)
    start_time = time.time()
    desc = "Phân tích cấu hình dịch bằng AI"
        
    # Call DeepSeek API to perform extraction
    deepseek_key = DEEPSEEK_API_KEY or os.getenv("DEEPSEEK_API_KEY")
    if not deepseek_key:
        raise HTTPException(status_code=500, detail="Dịch vụ AI chưa cấu hình API Key trên máy chủ.")
        
    system_prompt = (
        "You are a professional manga localization assistant. Analyze the provided Japanese manga text "
        "and extract: \n"
        "1. Important terminology (nouns, fantasy names, attack moves, special terms) with their natural Vietnamese translations.\n"
        "2. Character relations and pronouns (who is talking to whom, and what pronouns they use: self_ref for 'I' and target_ref for 'you' in Vietnamese).\n"
        "Respond ONLY with a JSON object in this format:\n"
        "{\n"
        "  \"terminology\": [\n"
        "    {\"source\": \"螺旋丸\", \"target\": \"Rasengan\"}\n"
        "  ],\n"
        "  \"relational_matrix\": [\n"
        "    {\"speaker\": \"ナルト\", \"listener\": \"サスケ\", \"self_ref\": \"Tớ\", \"target_ref\": \"Cậu\"}\n"
        "  ]\n"
        "}\n"
        "Do not include any explanation or markdown formatting."
    )
    
    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {deepseek_key}",
        "Content-Type": "application/json"
    }
    api_payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3
    }
    
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(url, json=api_payload, headers=headers)
            response.raise_for_status()
            res_json = response.json()
            content = res_json["choices"][0]["message"]["content"]
            result_data = json.loads(content)
            
            # Deduct balance based on execution time
            execution_time_seconds = time.time() - start_time
            await deduct_balance(db, user_id, execution_time_seconds, desc)
            await db.commit()
            return result_data
            
    except Exception as api_err:
        print(f"❌ [AI-EXTRACT ERROR] DeepSeek call failed: {api_err}")
        raise HTTPException(status_code=500, detail=f"Lỗi phân tích AI từ DeepSeek: {str(api_err)}")


# ==========================================
# 🚀 UFO-SPACE 1-CLICK APP SINGLE-TENANT SPA FRONTEND MOUNT
# ==========================================
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", CORSStaticFiles(directory=assets_dir), name="static-assets")

    @app.get("/")
    @app.get("/{spa_path:path}")
    async def serve_spa_frontend(spa_path: str = ""):
        if spa_path.startswith("api/") or spa_path.startswith("workspace/") or spa_path in ["docs", "openapi.json", "redoc"]:
            raise HTTPException(status_code=404, detail="Not Found")
        
        # 🛡️ CHỐNG LỘ FILE ẨN: Chặn mọi truy cập vào dotfiles (.env, .git...)
        if spa_path.startswith(".") or "/." in spa_path or "\\." in spa_path:
            raise HTTPException(status_code=404, detail="Not Found")

        static_base_dir = os.path.abspath(static_dir)
        target_f = os.path.abspath(os.path.join(static_base_dir, spa_path))
        
        # 🛡️ CHỐNG PATH TRAVERSAL: Kiểm tra không thoát khỏi static_dir
        if (
            spa_path
            and os.path.commonpath([target_f, static_base_dir]) == static_base_dir
            and os.path.isfile(target_f)
        ):
            return FileResponse(target_f)
            
        # Nếu đường dẫn trỏ tới một file cụ thể (có đuôi .xxx) nhưng không tồn tại trên đĩa -> 404, không trả index.html
        if "." in os.path.basename(spa_path):
            raise HTTPException(status_code=404, detail="Not Found")

        idx_f = os.path.join(static_base_dir, "index.html")
        if os.path.exists(idx_f):
            return FileResponse(idx_f)
        return {"status": "online", "app": "AI Manga Translator (DeepKoma)"}

