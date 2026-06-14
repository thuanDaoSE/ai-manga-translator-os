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
from celery import Celery
import redis
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from openai import OpenAI
from dotenv import load_dotenv

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
    Extract translations mapping (str(id) -> vietnamese_text) from any JSON shape DeepSeek returns.
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
                t_val = item.get("vietnamese") or item.get("translation") or item.get("text")
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
                t_val = v.get("vietnamese") or v.get("translation") or v.get("text")
                if t_val is not None:
                    translations[str(k)] = str(t_val)
            else:
                translations[str(k)] = str(v)
                
    return translations

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

@celery_app.task(bind=True, name="process_manga_page")
def process_manga_page(self, page_id: str, config: dict):
    task_id = self.request.id
    try:
        import db_models as models
        
        # 1. Kiểm tra checkpoint hủy đầu tiên trước khi đọc DB
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước khi bắt đầu. Dừng!")
            return {"status": "cancelled", "message": "Task was cancelled before execution"}

        # Lấy thông tin trang truyện từ CSDL (Sync)
        with SessionLocal() as db:
            page = db.query(models.Page).filter(models.Page.id == page_id).first()
            if not page:
                raise ValueError(f"Không tìm thấy trang truyện cho page_id: {page_id}")
            raw_url = page.raw_url
            
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
            img_bytes = encoded_img.tobytes() if success else open(raw_path, "rb").read()
            
        img_b64 = base64.b64encode(img_bytes).decode('utf-8')
        
        # 2. Checkpoint hủy lần 2: TRƯỚC KHI GỌI RUNPOD API (PAID API)
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước cuộc gọi RunPod API. Dừng!")
            return {"status": "cancelled", "message": "Task was cancelled before RunPod call"}

        broadcast_progress(task_id, 25, "Đang gửi ảnh sang GPU RunPod...")
        
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
        
        res = httpx.post(runpod_url, json=payload, headers=headers, timeout=60.0)
        if res.status_code != 200:
            raise Exception(f"RunPod failed with status {res.status_code}: {res.text}")
            
        runpod_job_id = res.json()["id"]
        
        # 3. Server-side Polling để cập nhật tiến độ
        broadcast_progress(task_id, 40, "Đang chờ GPU xử lý OCR & Dọn nền...")
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
                broadcast_progress(task_id, 60, "GPU đang chạy tẩy nền và đọc chữ...")
            elif status == "IN_QUEUE":
                broadcast_progress(task_id, 45, "Đang xếp hàng chờ GPU trống...")
                
        # 4. Trích xuất kết quả RunPod
        clean_b64 = runpod_result.get("clean_image_base64")
        extracted_data = runpod_result.get("data", [])
        
        # 5. Checkpoint hủy lần 3: TRƯỚC KHI GỌI DEEPSEEK API (PAID API)
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước cuộc gọi DeepSeek API. Dừng!")
            return {"status": "cancelled", "message": "Task was cancelled before DeepSeek call"}

        # Dịch bằng DeepSeek trên VPS
        if extracted_data:
            broadcast_progress(task_id, 80, "Đang gửi nội dung sang Deepseek dịch nghĩa...")
            try:
                ocr_batch_payload = [{"id": item["id"], "japanese": item["japanese"]} for item in extracted_data]
                prompt = f"Thể loại: {config.get('genre', '')}. Xưng hô: {config.get('pronouns', '')}. Văn phong: {config.get('tone', '')}. Dịch mảng JSON sau sang tiếng Việt. Bạn BẮT BUỘC TRẢ VỀ FORMAT JSON chứa mảng 'translations', ví dụ: {{\\\"translations\\\": [{{\\\"id\\\": 1, \\\"vietnamese\\\": \\\"bản dịch\\\"}}]}}. Dữ liệu cần dịch: {json.dumps(ocr_batch_payload, ensure_ascii=False)}"
                if config.get("glossary"):
                    prompt = f"Từ điển thuật ngữ (ưu tiên sử dụng): {config.get('glossary')}\n" + prompt
                    
                response = None
                translations = {}
                for attempt in range(3):
                    try:
                        response = deepseek_client.chat.completions.create(
                            model="deepseek-chat",
                            messages=[
                                {"role": "system", "content": "You output strict JSON containing a 'translations' array of dicts with 'id' and 'vietnamese'."},
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
            os.makedirs("workspace", exist_ok=True)
            clean_file_path = f"workspace/clean_{task_id}.jpg"
            with open(clean_file_path, "wb") as f:
                f.write(clean_img_data)
            clean_url = f"/{clean_file_path}"
            
        result_payload = {
            "clean_url": clean_url,
            "data": extracted_data
        }
        
        # 7. Cập nhật cơ sở dữ liệu đồng bộ
        sync_update_page_db(page_id, clean_url, extracted_data)
        
        # Ghi nhận cache vào Redis
        try:
            img_hash = get_image_ahash(raw_path)
            if img_hash:
                cache_key = f"ocr_translate_cache:{img_hash}"
                redis_client.set(cache_key, json.dumps(result_payload), ex=2592000)
        except Exception as ce:
            print(f"⚠️ [CACHE WRITE ERROR] Lỗi lưu Redis cache: {ce}")
            
        broadcast_progress(task_id, 100, "Hoàn tất!", state="SUCCESS", result=result_payload)
        return result_payload
        
    except Exception as e:
        import traceback
        print(f"❌ [WORKER ERROR] Lỗi nghiêm trọng: {e}")
        traceback.print_exc()
        broadcast_progress(task_id, 0, f"Thất bại: {str(e)}", state="FAILURE")
        raise e
