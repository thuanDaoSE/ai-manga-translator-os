import os
import sys
# 🚀 Bổ sung đường dẫn hiện tại vào sys.path để Celery tìm được db_models/database trên Windows
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cv2
import json
import time
import base64
import re
import httpx
import logging

# 🔇 Tắt log spam (tránh in ra hàng loạt chuỗi base64 của ảnh/mask)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("runpod").setLevel(logging.WARNING)
from celery import Celery
import redis
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from openai import OpenAI
from dotenv import load_dotenv
import numpy as np

# Chống văng app trên Windows
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

load_dotenv()

# Khởi tạo Celery
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = int(os.getenv("REDIS_PORT", 6379))
celery_app = Celery("manga_tasks", broker=f"redis://{redis_host}:{redis_port}/0", backend=f"redis://{redis_host}:{redis_port}/0")
celery_app.conf.update(
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50
)

# Khởi tạo Redis client đồng bộ cho worker
redis_client = redis.Redis(host=redis_host, port=redis_port, db=0)

# Khởi tạo OpenAI/DeepSeek
deepseek_client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY")
RUNPOD_ENDPOINT_ID = os.environ.get("RUNPOD_TRANSLATE_ENDPOINT_ID")

from PIL import Image

_ocr_manager = None
_yolo_model = None
_text_detector = None
_lama_session = None

def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        print("[WORKER] Lazy-loading YOLOv11-seg model...")
        from ultralytics import YOLO
        model_path = os.path.join(os.path.dirname(__file__), "models", "yolo_seg", "yolo11n-seg-manga.pt")
        if os.path.exists(model_path):
            _yolo_model = YOLO(model_path)
        else:
            raise FileNotFoundError(f"Missing yolo11n-seg-manga.pt at {model_path}")
    return _yolo_model

def run_adaptive_monochrome_fill(image, mask):
    # 1. Dilate the mask to grab surrounding background pixels
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    dilated_mask = cv2.dilate(mask, kernel, iterations=1)
    
    # 2. Get the border region just outside the original mask
    border_mask = cv2.subtract(dilated_mask, mask)
    
    # 3. Extract the BGR pixels in the border region
    border_pixels = image[border_mask > 0]
    
    if len(border_pixels) > 0:
        # Calculate brightness (grayscale value) for each BGR pixel
        # using the standard luminance formula: Y = 0.114*B + 0.587*G + 0.299*R
        brightness = (0.114 * border_pixels[:, 0] + 
                      0.587 * border_pixels[:, 1] + 
                      0.299 * border_pixels[:, 2])
        
        # Classify bubble background using median brightness
        median_bright = np.median(brightness)
        
        if median_bright > 127:
            # Light bubble: keep pixels close to or brighter than the median, filtering out dark text/borders
            threshold = max(0.0, median_bright - 45.0)
            valid_pixels = border_pixels[brightness >= threshold]
        else:
            # Dark bubble: keep pixels close to or darker than the median, filtering out light text/backgrounds
            threshold = min(255.0, median_bright + 45.0)
            valid_pixels = border_pixels[brightness <= threshold]
        
        if len(valid_pixels) > 0:
            bg_color = np.median(valid_pixels, axis=0).astype(np.uint8)
        else:
            bg_color = np.median(border_pixels, axis=0).astype(np.uint8)
    else:
        bg_color = np.array([255, 255, 255], dtype=np.uint8)
        
    # 4. Fill the masked region with the detected background color
    clean_crop = image.copy()
    clean_crop[mask > 0] = bg_color
    return clean_crop

def run_local_lama(img: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Runs local LaMa inpainting on the image using the mask.
    Assumes mask is binary (0 or 255) and of the same shape as img.
    """
    session = get_lama_session()
    h_img, w_img = img.shape[:2]
    clean_img = img.copy()
    
    # Find contours to run LaMa on smaller bounding regions (better quality + faster)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w == 0 or h == 0:
            continue
        # Add padding for background context
        pad_x = max(40, min(int(w * 0.5), 150))
        pad_y = max(40, min(int(h * 0.5), 150))
        x1_pad, y1_pad = max(0, x - pad_x), max(0, y - pad_y)
        x2_pad, y2_pad = min(w_img, x + w + pad_x), min(h_img, y + h + pad_y)
        
        crop_img = clean_img[y1_pad:y2_pad, x1_pad:x2_pad]
        crop_mask = mask[y1_pad:y2_pad, x1_pad:x2_pad]
        
        if cv2.countNonZero(crop_mask) == 0:
            continue
            
        h_crop, w_crop = crop_img.shape[:2]
        
        # Dilate mask slightly (5x5 ellipse) to fully cover text boundaries/strokes
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        crop_mask_dilated = cv2.dilate(crop_mask, kernel, iterations=1)
        
        # Resize if larger than 512x512
        scale = 1.0
        if h_crop > 512 or w_crop > 512:
            scale = 512.0 / max(h_crop, w_crop)
            new_w, new_h = int(w_crop * scale), int(h_crop * scale)
            crop_img_resized = cv2.resize(crop_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            crop_mask_resized = cv2.resize(crop_mask_dilated, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
        else:
            new_w, new_h = w_crop, h_crop
            crop_img_resized = crop_img.copy()
            crop_mask_resized = crop_mask_dilated.copy()
            
        # Pad to 512x512 with replication border
        pad_bottom, pad_right = 512 - new_h, 512 - new_w
        if pad_bottom > 0 or pad_right > 0:
            crop_img_resized = cv2.copyMakeBorder(crop_img_resized, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
            crop_mask_resized = cv2.copyMakeBorder(crop_mask_resized, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)
            
        # Prepare tensors for ONNX Runtime
        img_t = np.transpose(cv2.cvtColor(crop_img_resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
        mask_t = np.transpose((crop_mask_resized > 0).astype(np.float32)[:, :, np.newaxis], (2, 0, 1))[np.newaxis, ...]
        
        # Run inference
        ort_outs = session.run(None, {
            session.get_inputs()[0].name: img_t,
            session.get_inputs()[1].name: mask_t
        })
        
        out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255).clip(0, 255).astype(np.uint8)
        clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]
        
        # Resize back if scaled
        if scale != 1.0:
            clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)
            
        # Paste back using mask-based blending to preserve 100% of original background details
        crop_original = clean_img[y1_pad:y2_pad, x1_pad:x2_pad]
        mask_indices = (crop_mask_dilated > 0)[:, :, np.newaxis]
        composite = np.where(mask_indices, clean_crop, crop_original)
        clean_img[y1_pad:y2_pad, x1_pad:x2_pad] = composite
        
    return clean_img

def get_ocr_manager():
    global _ocr_manager
    if _ocr_manager is None:
        print("[WORKER] Lazy-loading OCRManager...")
        from ocr_manager import OCRManager
        _ocr_manager = OCRManager()
    return _ocr_manager

def get_text_detector():
    global _text_detector
    if _text_detector is None:
        print("[WORKER] Lazy-loading TextDetector...")
        ctd_path = os.path.join(os.path.dirname(__file__), "comic_text_detector")
        if ctd_path not in sys.path:
            sys.path.append(ctd_path)
            
        # Mock wandb to bypass protobuf version conflicts/lock issues on Windows
        try:
            from unittest.mock import MagicMock
            sys.modules['wandb'] = MagicMock()
            sys.modules['wandb.proto'] = MagicMock()
            sys.modules['wandb.proto.wandb_telemetry_pb2'] = MagicMock()
            sys.modules['wandb.proto.wandb_internal_pb2'] = MagicMock()
            sys.modules['wandb.proto.wandb_server_pb2'] = MagicMock()
        except Exception as mock_err:
            print(f"⚠️ [MOCK WANDB] Failed to mock wandb in worker: {mock_err}")

        from inference import TextDetector
        model_file = os.path.join(ctd_path, "data", "comictextdetector.pt")
        if os.path.exists(model_file):
            _text_detector = TextDetector(model_path=model_file, device="cpu")
        else:
            raise FileNotFoundError(f"Missing comictextdetector.pt at {model_file}")
    return _text_detector

def get_lama_session():
    global _lama_session
    if _lama_session is None:
        print("[WORKER] Lazy-loading LaMa session...")
        import onnxruntime as ort
        sess_options = ort.SessionOptions()
        sess_options.add_session_config_entry("session.use_mmap", "1")
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.enable_cpu_mem_arena = True
        model_path = os.path.join(os.path.dirname(__file__), "lama-manga.onnx")
        if os.path.exists(model_path):
            _lama_session = ort.InferenceSession(model_path, sess_options=sess_options, providers=['CPUExecutionProvider'])
        else:
            raise FileNotFoundError(f"Missing lama-manga.onnx at {model_path}")
    return _lama_session

# Thiết lập Database đồng bộ kết nối qua psycopg2 để tránh đụng độ Event Loop
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://deepkoma:secretpassword@localhost:5433/manga_studio"
)
SYNC_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("asyncpg", "psycopg2")

sync_engine = create_engine(SYNC_DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=sync_engine, expire_on_commit=False)

def get_image_ahash(image_path: str) -> str:
    try:
        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return ""
        # Resize to 8x8
        img_resized = cv2.resize(img, (8, 8), interpolation=cv2.INTER_AREA)
        avg = img_resized.mean()
        diff = img_resized >= avg
        hash_val = 0
        for i, b in enumerate(diff.flatten()):
            if b:
                hash_val |= (1 << i)
        return f"{hash_val:016x}"
    except Exception as e:
        print(f"⚠️ [HASH ERROR] Failed to calculate image hash: {e}")
        return ""

def sanitize_dirty_json(dirty_string: str) -> str:
    cleaned = dirty_string.strip(" \n\r\t`")
    cleaned = re.sub(r',\s*([\]}])', r'\1', cleaned)
    cleaned = re.sub(r'\bNone\b', 'null', cleaned)
    cleaned = re.sub(r'\bTrue\b', 'true', cleaned)
    cleaned = re.sub(r'\bFalse\b', 'false', cleaned)
    cleaned = re.sub(r'[“”]', '"', cleaned)
    cleaned = re.sub(r'([{,]\s*)([a-zA-Z0-9_]+)(\s*:)', r'\1"\2"\3', cleaned)
    
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
    match = re.search(r'\{.*\}', llm_response, flags=re.DOTALL)
    if not match:
        match = re.search(r'\[.*\]', llm_response, flags=re.DOTALL)
        
    if match:
        extracted_str = match.group(0)
    else:
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
        pass

    sanitized_str = sanitize_dirty_json(extracted_str)
    try:
        return json.loads(sanitized_str)
    except json.JSONDecodeError as e:
        print(f"❌ [WORKER] CRITICAL JSON PARSE FAILURE: {e}")
        print("--- LLM Response ---")
        print(llm_response)
        print("--- Extracted String ---")
        print(extracted_str)
        print("--- Sanitized String ---")
        print(sanitized_str)
        print("---------------------")
        return {}

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


def contains_cjk_characters(text: str) -> bool:
    if not text:
        return False
    # Unicode ranges for Japanese/Chinese:
    # Hiragana: \u3040-\u309F
    # Katakana: \u30A0-\u30FF
    # Kanji/Hanzi: \u4E00-\u9FFF
    # Japanese fullwidth punctuation: \u3000-\u303F, \uFF00-\uFFEF
    pattern = re.compile(r'[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]')
    return bool(pattern.search(text))


def broadcast_progress(task_id, progress, message, state="PROCESSING", result=None):
    payload = json.dumps({
        "state": state,
        "progress": progress,
        "message": message,
        "result": result
    })
    redis_client.publish(f"task_progress:{task_id}", payload)

def is_task_cancelled(task_id: str) -> bool:
    try:
        val = redis_client.get(f"cancelled_task:{task_id}")
        return val == b"true" or val == "true"
    except Exception as e:
        print(f"⚠️ [WORKER] Lỗi kiểm tra cờ hủy từ Redis: {e}")
        return False

def get_base_url():
    pod_id = os.getenv("RUNPOD_POD_ID")
    if pod_id:
        return f"https://{pod_id}-8000.proxy.runpod.net"
    return os.getenv("BACKEND_BASE_URL", "http://localhost:8000")

def sync_update_page_db(page_id, clean_url, bubbles):
    import db_models as models
    with SessionLocal() as db:
        page = db.query(models.Page).filter(models.Page.id == page_id).first()
        if page:
            page.clean_url = clean_url
            page.bubbles_data = json.dumps(bubbles)
            page.status = "completed"
            db.commit()
            print(f"✅ [WORKER DB] Đã cập nhật kết quả dịch cho trang {page_id} vào PostgreSQL (Sync)!")

def log_gpu_session_action_sync(db, user_id: str, action: str, credits: float):
    import json
    import datetime
    import db_models as models
    session = db.query(models.GPUSession).filter(
        models.GPUSession.user_id == user_id,
        models.GPUSession.is_active == True
    ).first()
    if session:
        try:
            calls = json.loads(session.apis_called)
        except Exception:
            calls = []
        
        action_name = action
        action_upper = action.upper()
        if any(kw in action_upper for kw in ["CTD-ERASE", "ERASE-MASK", "QUICK-SCAN", "TẨY"]):
            action_name = "Tẩy nét AI 🧹"
        elif "REDRAW" in action_upper:
            action_name = "Vẽ lại AI 🎨"
        elif "TRANSLATE" in action_upper:
            action_name = "Dịch trang truyện 📖"
        elif "AI-PROCESS" in action_upper:
            action_name = "Dịch tự động GPU ⚡"
        elif "KIE" in action_upper:
            action_name = "Xử lý Kie.ai ⚙️"
        elif "AI-EXTRACT" in action_upper:
            action_name = "Trích xuất chữ AI 📝"

        calls.append({
            "action": action_name,
            "credits": float(credits),
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
        session.apis_called = json.dumps(calls)
        session.credits_deducted += credits
        db.add(session)

def deduct_balance(user_id: str, execution_time_seconds: float, description: str):
    import db_models as models
    try:
        with SessionLocal() as db:
            user = db.query(models.User).filter(models.User.id == user_id).with_for_update().first()
            if user:
                if user.is_pro:
                    return
                user.balance_seconds = max(0.0, user.balance_seconds - execution_time_seconds)
                
                # Ghi nhận lịch sử giao dịch
                new_txn = models.UserTransaction(
                    user_id=user_id,
                    amount=-execution_time_seconds,
                    type="DEDUCT",
                    description=description
                )
                db.add(new_txn)
                
                # Ghi nhận TimeLog
                desc_upper = description.upper()
                action_type = "TRANSLATE_LAMA"
                if any(keyword in desc_upper for keyword in ["RUNPOD", "VÀ NỀN", "INPAINT", "GROK", "OPENAI", "CHATGPT", "BANANA"]):
                    action_type = "VÀ_NỀN_RUNPOD"
                    
                new_log = models.TimeLog(
                    user_id=user_id,
                    amount=-execution_time_seconds,
                    action_type=action_type,
                    description=description
                )
                db.add(new_log)
                
                # Ghi nhận hoạt động vào phiên GPU active
                log_gpu_session_action_sync(db, user_id, description, execution_time_seconds)
                
                db.commit()
                print(f"💰 [WORKER DEDUCT] Deducted {execution_time_seconds:.2f}s from user {user_id}. New balance: {user.balance_seconds:.2f}s")
    except Exception as e:
        print(f"⚠️ [WORKER DEDUCT ERROR] Lỗi khi trừ thời gian cho user {user_id}: {e}")

@celery_app.task(bind=True, name="process_manga_page")
def process_manga_page(self, page_id: str, config: dict, client_saw_hot: bool = False, was_cold_start: bool = False):
    task_id = self.request.id
    try:
        start_time = time.time()
        import db_models as models
        
        target_language = config.get("target_language", "Tiếng Việt")
        if not target_language:
            target_language = "Tiếng Việt"
        source_language = config.get("source_language", "ja")
        if not source_language:
            source_language = "ja"
            
        task_type = config.get("task_type", "clean_only")
        
        # 1. Kiểm tra checkpoint hủy đầu tiên trước khi đọc DB
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước khi bắt đầu. Dừng!")
            return {"status": "cancelled", "message": "Task was cancelled before execution"}

        user_id = None
        project_id = None
        is_vip = False
        # Lấy thông tin trang truyện từ CSDL (Sync)
        is_vip = True
        with SessionLocal() as db:
            page = db.query(models.Page).filter(models.Page.id == page_id).first()
            if not page:
                raise ValueError(f"Không tìm thấy trang truyện cho page_id: {page_id}")
            raw_url = page.raw_url
            project_id = page.project_id
            project = db.query(models.Project).filter(models.Project.id == project_id).first()
            if project:
                user_id = project.user_id
            
        if not raw_url:
            raise ValueError(f"Không tìm thấy URL ảnh gốc cho page_id: {page_id}")
            
        raw_path = raw_url.lstrip('/')
        if not os.path.exists(raw_path):
            raise ValueError(f"Không tìm thấy file ảnh gốc tại: {raw_path}")
            
        broadcast_progress(task_id, 10, "Đang nén và mã hóa ảnh gốc...")
        
        # Đọc ảnh và chuyển sang Base64
        img = cv2.imread(raw_path)
        if img is None:
            with open(raw_path, "rb") as f:
                img_bytes = f.read()
        else:
            success, encoded_img = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        # Check if we are running locally (Windows or RUN_LOCAL_AI=true)
        run_local = os.getenv("RUN_LOCAL_AI", "false").lower() == "true" or sys.platform == "win32"
        
        if run_local:
            # 2. Checkpoint hủy lần 2: TRƯỚC KHI BẮT ĐẦU XỬ LÝ (LOCAL PROCESS)
            if is_task_cancelled(task_id):
                print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước khi bắt đầu xử lý. Dừng!")
                return {"status": "cancelled", "message": "Task was cancelled before processing"}

            broadcast_progress(task_id, 25, "Đang nhận diện vùng chữ (Local)...")
            
            # Load image via cv2 if not already done
            if img is None:
                img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
                
            h_img, w_img = img.shape[:2]
            clean_img = img.copy()
            
            # Ensure start_time = time.perf_counter() is called right before the AI logic
            ai_start_time = time.perf_counter()
            
            # 1. Run comic_text_detector to generate text mask
            detector = get_text_detector()
            result = detector(img)
            ctd_mask = result[1] if isinstance(result, tuple) else result  # Use refined text stroke mask
            if ctd_mask.max() <= 1.0: 
                ctd_mask = (ctd_mask * 255).astype(np.uint8)
            else: 
                ctd_mask = ctd_mask.astype(np.uint8)
                
            _, ctd_mask_bin = cv2.threshold(ctd_mask, 127, 255, cv2.THRESH_BINARY)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
            lama_mask = cv2.dilate(ctd_mask_bin, kernel, iterations=1)
            
            # Find contours from lama_mask to get text bounding boxes (same as RunPod handler)
            contours, _ = cv2.findContours(lama_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            detector_boxes = []
            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                if w < 16 or h < 16: 
                    continue
                detector_boxes.append((x, y, x + w, y + h))
                
            # Sort bounding boxes by reading order
            if source_language == 'ja':
                detector_boxes.sort(key=lambda b: (-b[2], b[1]))
            else:
                detector_boxes.sort(key=lambda b: (b[1], b[0]))
                
            broadcast_progress(task_id, 45, "Đang quét chữ OCR (Local)...")
            
            # 4. Inpaint using LaMa via helper
            clean_img = run_local_lama(img, lama_mask)
            
            # 5. Crop raw image at the bounding boxes and perform OCR recognition
            extracted_data = []
            count = 1
            ocr_manager = get_ocr_manager()
            for (bx1, by1, bx2, by2) in detector_boxes:
                crop_raw = img[by1:by2, bx1:bx2]
                if crop_raw.size == 0:
                    continue
                
                recognized_text = ocr_manager.recognize_crop(crop_raw, language=source_language, is_vip=is_vip)
                
                extracted_data.append({
                    "id": count,
                    "box_coordinates": {"x1": bx1, "y1": by1, "x2": bx2, "y2": by2},
                    "japanese": recognized_text.strip(),
                    "vietnamese": ""
                })
                count += 1

            broadcast_progress(task_id, 70, "Đang nén kết quả...")
            _, buffer = cv2.imencode('.jpg', clean_img)
            clean_b64 = base64.b64encode(buffer).decode('utf-8')
        
        else:
            # ─── VPS / RUNPOD MODE ───
            # 2. Checkpoint hủy lần 2: TRƯỚC KHI GỌI RUNPOD API (PAID API)
            if is_task_cancelled(task_id):
                print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước cuộc gọi RunPod API. Dừng!")
                return {"status": "cancelled", "message": "Task was cancelled before RunPod call"}

            broadcast_progress(task_id, 25, "Đang khởi tạo dịch vụ xử lý (RunPod)...")
            
            # Đọc ảnh và chuyển sang Base64
            img_b64 = base64.b64encode(img_bytes).decode('utf-8')
            
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
            
            ai_start_time = time.perf_counter() # Đo thời gian
            
            res = httpx.post(runpod_url, json=payload, headers=headers, timeout=60.0)
            if res.status_code != 200:
                raise Exception(f"RunPod failed with status {res.status_code}: {res.text}")
                
            runpod_job_id = res.json()["id"]
            
            # 3. Server-side Polling để cập nhật tiến độ
            broadcast_progress(task_id, 40, "Đang nhận diện chữ và tách nền (RunPod)...")
            status_url = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/status/{runpod_job_id}"
            
            runpod_result = None
            while True:
                # Checkpoint hủy trong vòng lặp polling
                if is_task_cancelled(task_id):
                    print(f"🛑 [WORKER] Task {task_id} đã bị hủy trong khi polling RunPod. Dừng!")
                    return {"status": "cancelled", "message": "Task was cancelled during RunPod execution"}

                time.sleep(2)
                status_res = httpx.get(status_url, headers=headers, timeout=15.0)
                status_data = status_res.json()
                status = status_data.get("status")
                
                if status == "COMPLETED":
                    runpod_result = status_data.get("output", {})
                    break
                elif status in ["FAILED", "CANCELLED"]:
                    raise Exception(f"RunPod job failed or cancelled: {status_data}")
                elif status == "IN_PROGRESS":
                    broadcast_progress(task_id, 60, "Đang tiến hành tẩy nền và đọc chữ (RunPod)...")
                elif status == "IN_QUEUE":
                    broadcast_progress(task_id, 45, "Đang xếp hàng chờ máy chủ xử lý...")
                    
            # 4. Trích xuất kết quả RunPod
            clean_b64 = runpod_result.get("clean_image_base64")
            extracted_data = runpod_result.get("data", [])
        
        # 5. Checkpoint hủy lần 3: TRƯỚC KHI GỌI DEEPSEEK API (PAID API)
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước cuộc gọi DeepSeek API. Dừng!")
            return {"status": "cancelled", "message": "Task was cancelled before DeepSeek call"}

        # Dịch bằng DeepSeek trên VPS
        if extracted_data:
            broadcast_progress(task_id, 80, "Đang tiến hành dịch thuật ngữ cảnh...")
            try:
                source_lang_names_vi = {
                    "ja": "Tiếng Nhật",
                    "en": "Tiếng Anh",
                    "zh": "Tiếng Trung",
                    "ko": "Tiếng Hàn"
                }
                source_lang_names_en = {
                    "ja": "Japanese",
                    "en": "English",
                    "zh": "Chinese",
                    "ko": "Korean"
                }
                source_lang_name_vi = source_lang_names_vi.get(source_language, "Tiếng Nhật")
                source_lang_name_en = source_lang_names_en.get(source_language, "Japanese")

                ocr_batch_payload = [{"id": item["id"], "text": item["japanese"]} for item in extracted_data]
                # Tinh chỉnh prompt động theo target_language
                lang_instruction = ""
                if target_language == "Tiếng Việt":
                    lang_instruction = "Bạn BẮT BUỘC phải dịch hoàn toàn sang Tiếng Việt. Giữ cấu trúc kính ngữ phù hợp của Tiếng Việt."
                elif target_language == "English":
                    lang_instruction = "Bạn BẮT BUỘC phải dịch hoàn toàn sang tiếng Anh. Dùng tiếng lóng (slang) tự nhiên của tiếng Anh."
                else:
                    lang_instruction = f"Bạn BẮT BUỘC phải dịch hoàn toàn sang {target_language}."

                prompt = (
                    f"Nhiệm vụ của bạn là dịch các đoạn hội thoại truyện tranh sau từ {source_lang_name_vi} sang {target_language}.\n"
                    f"{lang_instruction} Không được dịch sang bất kỳ ngôn ngữ nào khác (như giữ nguyên {source_lang_name_vi}).\n"
                    f"Thể loại: {config.get('genre', '')}. Xưng hô: {config.get('pronouns', '')}. Văn phong: {config.get('tone', '')}.\n"
                    f"Yêu cầu: Giữ nguyên văn phong truyện tranh tự nhiên.\n"
                    f"Bạn BẮT BUỘC TRẢ VỀ FORMAT JSON chứa mảng 'translations', ví dụ: {{\\\"translations\\\": [{{\\\"id\\\": 1, \\\"translation\\\": \\\"bản dịch\\\"}}]}}.\n"
                    f"Dữ liệu cần dịch: {json.dumps(ocr_batch_payload, ensure_ascii=False)}"
                )
                if config.get("glossary"):
                    prompt = f"Từ điển thuật ngữ (ưu tiên sử dụng): {config.get('glossary')}\n" + prompt
                    
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
                                        f"You are a professional manga/comic translator. "
                                        f"You must translate the text strictly and fully from {source_lang_name_en} to {target_language}. "
                                        f"Do not output {source_lang_name_en} or any other language characters. "
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
                            print(f"✅ [DEEPSEEK] Dịch thành công ở lần thử thứ {attempt+1}!")
                            break
                        else:
                            print(f"⚠️ [DEEPSEEK] Lần thử thứ {attempt+1} trả về bản dịch rỗng, đang thử lại...")
                    except Exception as e:
                        print(f"⚠️ [DEEPSEEK] Lần thử thứ {attempt+1} gặp lỗi: {e}")
                        if attempt == 2:
                            raise e
                    time.sleep(1)
                
                # 5.5. Hậu kiểm: Phát hiện chữ chưa được dịch và tự động dịch lại đúng 1 lần
                failed_items = []
                for item in extracted_data:
                    item_id = str(item["id"])
                    translated_text = translations.get(item_id, "")
                    if source_language in ["ja", "zh", "ko"] and target_language in ["Tiếng Việt", "English"]:
                        if contains_cjk_characters(translated_text):
                            failed_items.append({"id": item["id"], "text": item["japanese"]})
                    elif source_language == "en" and target_language == "Tiếng Việt":
                        if translated_text.strip().lower() == item["japanese"].strip().lower() and len(item["japanese"].strip()) > 3:
                            failed_items.append({"id": item["id"], "text": item["japanese"]})

                if failed_items:
                    print(f"⚠️ [CHECK-LANG] Phát hiện {len(failed_items)} câu dịch bị lỗi (chưa dịch hoặc giữ nguyên chữ gốc). Tiến hành dịch lại đúng 1 lần...")
                    retry_prompt = (
                        f"Nhiệm vụ của bạn là dịch đoạn thoại truyện tranh sau sang {target_language}.\n"
                        f"CẢNH BÁO CỰC KỲ NGHIÊM NGẶT: Lần dịch trước của bạn bị lỗi dịch ra chữ {source_lang_name_vi} hoặc giữ nguyên văn bản gốc. "
                        f"Bạn BẮT BUỘC phải dịch HOÀN TOÀN sang {target_language}. TUYỆT ĐỐI không được trả về chữ {source_lang_name_vi} hay chữ gốc.\n"
                        f"Dữ liệu cần dịch lại: {json.dumps(failed_items, ensure_ascii=False)}"
                    )
                    try:
                        retry_response = deepseek_client.chat.completions.create(
                            model="deepseek-chat",
                            messages=[
                                {
                                    "role": "system", 
                                    "content": (
                                        f"You are a professional manga/comic translator. "
                                        f"You must translate the text strictly and fully from {source_lang_name_en} to {target_language}. "
                                        f"Do not output {source_lang_name_en} or any other language characters. Only output standard translated text."
                                    )
                                },
                                {"role": "user", "content": retry_prompt}
                            ],
                            response_format={'type': 'json_object'}
                        )
                        retry_ai_response = robust_json_parse(retry_response.choices[0].message.content)
                        retry_translations = extract_translations(retry_ai_response)
                        
                        # Cập nhật kết quả dịch lại vào danh sách translations
                        for f_item in failed_items:
                            f_id = str(f_item["id"])
                            if f_id in retry_translations:
                                translations[f_id] = retry_translations[f_id]
                                print(f"✅ [RETRY SUCCESS] Đã dịch lại thành công câu {f_id}!")
                    except Exception as re_err:
                        print(f"⚠️ [RETRY FAILED] Lỗi khi dịch lại lần 1: {re_err}")
                
                for item in extracted_data:
                    item_id = str(item["id"])
                    if item_id in translations:
                        item["vietnamese"] = translations[item_id]
                        if "text" in item:
                            item["text"] = translations[item_id]
                    else:
                        item["vietnamese"] = "Lỗi dịch"
                        if "text" in item:
                            item["text"] = "Lỗi dịch"
            except Exception as de:
                print(f"⚠️ [DEEPSEEK ERROR] Lỗi dịch DeepSeek: {de}")
                for item in extracted_data:
                    item["vietnamese"] = "Lỗi dịch thuật (VPS)"
                    if "text" in item:
                        item["text"] = "Lỗi dịch thuật (VPS)"
                    
        # 6. Checkpoint hủy lần 4: TRƯỚC KHI LƯU ẢNH VÀ COMMIT CSDL
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước khi lưu kết quả. Dừng!")
            return {"status": "cancelled", "message": "Task was cancelled before output saving"}

        # Lưu ảnh sạch lên VPS
        broadcast_progress(task_id, 90, "Đang lưu trữ ảnh sạch...")
        clean_url = ""
        if clean_b64:
            clean_img_data = base64.b64decode(clean_b64)
            clean_dir = f"workspace/{project_id}/clean"
            os.makedirs(clean_dir, exist_ok=True)
            clean_file_path = f"{clean_dir}/{page_id}.jpg"
            with open(clean_file_path, "wb") as f:
                f.write(clean_img_data)
            clean_url = f"/{clean_file_path}"
            
        result_payload = {
            "clean_url": clean_url,
            "data": extracted_data
        }
        
        # 7. Cập nhật cơ sở dữ liệu đồng bộ
        sync_update_page_db(page_id, clean_url, extracted_data)
        
        # Trừ thời gian sử dụng thực tế của user (Bỏ qua vì frontend đã quản lý trừ trực tiếp theo giây khi bật công tắc GPU!)
        pass
        
        # Ghi nhận cache vào Redis
        try:
            img_hash = get_image_ahash(raw_path)
            if img_hash:
                cache_key = f"ocr_translate_cache:{img_hash}:{target_language}:{task_type}"
                redis_client.set(cache_key, json.dumps(result_payload), ex=2592000)
        except Exception as ce:
            print(f"⚠️ [CACHE WRITE ERROR] Lỗi lưu Redis cache: {ce}")
            
        broadcast_progress(task_id, 100, "Hoàn tất!", state="SUCCESS", result=result_payload)
        return result_payload
        
    except Exception as e:
        import traceback
        print(f"❌ [WORKER ERROR] Lỗi nghiêm trọng: {e}")
        traceback.print_exc()
        
        # 🚀 Cập nhật trạng thái trang thành failed trong CSDL để tránh kẹt trạng thái processing
        try:
            with SessionLocal() as db:
                page = db.query(models.Page).filter(models.Page.id == page_id).first()
                if page:
                    page.status = "failed"
                    db.commit()
                    print(f"❌ [WORKER DB] Đã cập nhật trạng thái failed cho trang {page_id}")
        except Exception as dbe:
            print(f"⚠️ [WORKER DB ERROR] Không thể cập nhật trạng thái failed cho trang {page_id}: {dbe}")
        


        broadcast_progress(task_id, 0, f"Thất bại: {str(e)}", state="FAILURE")
        raise e
