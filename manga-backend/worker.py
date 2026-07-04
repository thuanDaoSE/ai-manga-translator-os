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

from PIL import Image

_ocr_manager = None
_text_detector = None
_lama_session = None

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
            import sys
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
        model_path = os.path.join(os.path.dirname(__file__), "lama-manga.onnx")
        if os.path.exists(model_path):
            _lama_session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
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
        
        # 1. Kiểm tra checkpoint hủy đầu tiên trước khi đọc DB
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước khi bắt đầu. Dừng!")
            return {"status": "cancelled", "message": "Task was cancelled before execution"}

        user_id = None
        project_id = None
        is_vip = False
        # Lấy thông tin trang truyện từ CSDL (Sync)
        with SessionLocal() as db:
            page = db.query(models.Page).filter(models.Page.id == page_id).first()
            if not page:
                raise ValueError(f"Không tìm thấy trang truyện cho page_id: {page_id}")
            raw_url = page.raw_url
            project_id = page.project_id
            project = db.query(models.Project).filter(models.Project.id == project_id).first()
            if project:
                user_id = project.user_id
                user = db.query(models.User).filter(models.User.id == user_id).first()
                if user:
                    is_vip = getattr(user, "is_pro", False)
            
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
            i        # 2. Checkpoint hủy lần 2: TRƯỚC KHI BẮT ĐẦU XỬ LÝ (LOCAL PROCESS)
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
        
        # Run local text detection
        detector = get_text_detector()
        res_mask, res_mask_refined, blk_list = detector(img)
        
        if res_mask_refined.max() <= 1.0: 
            ctd_mask_bin = (res_mask_refined * 255).astype(np.uint8)
        else: 
            ctd_mask_bin = res_mask_refined.astype(np.uint8)
        _, ctd_mask_bin = cv2.threshold(ctd_mask_bin, 127, 255, cv2.THRESH_BINARY)
        fat_mask = cv2.dilate(ctd_mask_bin, np.ones((7, 7), np.uint8), iterations=2)
        _, white_regions = cv2.threshold(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 200, 255, cv2.THRESH_BINARY)
        smart_mask = cv2.dilate(cv2.bitwise_and(fat_mask, cv2.bitwise_or(ctd_mask_bin, white_regions)), np.ones((3, 3), np.uint8), iterations=1)
        mask = cv2.dilate(smart_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1)
        
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        broadcast_progress(task_id, 45, "Đang quét chữ OCR (Local)...")
        
        extracted_data = []
        ocr_manager = get_ocr_manager()
        count = 1
        
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w < 16 or h < 16: 
                continue
                
            crop_bgr = img[y:y+h, x:x+w]
            
            # Run OCR via OCRManager
            japanese_text = ocr_manager.recognize_crop(crop_bgr, language=source_language, is_vip=is_vip)
            extracted_data.append({
                "id": count,
                "box_coordinates": {"x1": x, "y1": y, "x2": x+w, "y2": y+h},
                "japanese": japanese_text.strip(),
                "vietnamese": ""
            })
            count += 1
            
            # Clean phase using LaMa locally
            pad_x, pad_y = max(40, min(int(w * 0.5), 150)), max(40, min(int(h * 0.5), 150))
            x1_pad, y1_pad = max(0, x - pad_x), max(0, y - pad_y)
            x2_pad, y2_pad = min(w_img, x + w + pad_x), min(h_img, y + h + pad_y)
            crop_img = clean_img[y1_pad:y2_pad, x1_pad:x2_pad]
            crop_mask = mask[y1_pad:y2_pad, x1_pad:x2_pad]
            
            if cv2.countNonZero(crop_mask) == 0: 
                continue
            
            h_crop, w_crop = crop_img.shape[:2]
            original_crop_mask = crop_mask.copy()
            
            scale = 1.0
            if h_crop > 512 or w_crop > 512:
                scale = 512.0 / max(h_crop, w_crop)
                new_w, new_h = int(w_crop * scale), int(h_crop * scale)
                crop_img = cv2.resize(crop_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
                crop_mask = cv2.resize(crop_mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
            else:
                new_w, new_h = w_crop, h_crop

            pad_bottom, pad_right = 512 - new_h, 512 - new_w
            if pad_bottom > 0 or pad_right > 0:
                crop_img = cv2.copyMakeBorder(crop_img, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
                crop_mask = cv2.copyMakeBorder(crop_mask, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)

            img_t = np.transpose(cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
            mask_t = np.transpose((crop_mask > 0).astype(np.float32)[:, :, np.newaxis], (2, 0, 1))[np.newaxis, ...]

            lama_session = get_lama_session()
            ort_outs = lama_session.run(None, {lama_session.get_inputs()[0].name: img_t, lama_session.get_inputs()[1].name: mask_t})
            out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255).clip(0, 255).astype(np.uint8)
            clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]
            
            if scale != 1.0: 
                clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)
            mask_bool = original_crop_mask > 0
            clean_img[y1_pad:y2_pad, x1_pad:x2_pad][mask_bool] = clean_crop[mask_bool]

        broadcast_progress(task_id, 70, "Đang nén kết quả...")
        _, buffer = cv2.imencode('.jpg', clean_img)
        clean_b64 = base64.b64encode(buffer).decode('utf-8')
        
        # 5. Checkpoint hủy lần 3: TRƯỚC KHI GỌI DEEPSEEK API (PAID API)
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước cuộc gọi DeepSeek API. Dừng!")
            return {"status": "cancelled", "message": "Task was cancelled before DeepSeek call"}

        # Dịch bằng DeepSeek trên VPS
        if extracted_data:
            broadcast_progress(task_id, 80, "Đang tiến hành dịch thuật ngữ cảnh...")
            try:
                ocr_batch_payload = [{"id": item["id"], "japanese": item["japanese"]} for item in extracted_data]
                # Tinh chỉnh prompt động theo target_language
                lang_instruction = ""
                if target_language == "Tiếng Việt":
                    lang_instruction = "Bạn BẮT BUỘC phải dịch hoàn toàn sang Tiếng Việt. Giữ cấu trúc kính ngữ phù hợp của Tiếng Việt."
                elif target_language == "English":
                    lang_instruction = "Bạn BẮT BUỘC phải dịch hoàn toàn sang tiếng Anh. Dùng tiếng lóng (slang) tự nhiên của tiếng Anh."
                else:
                    lang_instruction = f"Bạn BẮT BUỘC phải dịch hoàn toàn sang {target_language}."

                prompt = (
                    f"Nhiệm vụ của bạn là dịch đoạn thoại truyện tranh sau sang {target_language}.\n"
                    f"{lang_instruction} Không được dịch sang bất kỳ ngôn ngữ nào khác (như chữ Trung Quốc hay giữ nguyên tiếng Nhật).\n"
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
                                        "You are a professional manga translator. "
                                        f"You must translate the text strictly and fully to {target_language}. "
                                        "Do not output Chinese, Japanese, or any other language. "
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
                
                # 5.5. Hậu kiểm: Phát hiện chữ Nhật/Trung (dịch sai ngôn ngữ đầu ra) và tự động dịch lại đúng 1 lần
                failed_items = []
                for item in extracted_data:
                    item_id = str(item["id"])
                    translated_text = translations.get(item_id, "")
                    # Nếu đích là Tiếng Việt hoặc English nhưng đầu ra vẫn chứa chữ Nhật/Trung (mã CJK)
                    if target_language in ["Tiếng Việt", "English"] and contains_cjk_characters(translated_text):
                        failed_items.append({"id": item["id"], "japanese": item["japanese"]})

                if failed_items:
                    print(f"⚠️ [CHECK-LANG] Phát hiện {len(failed_items)} câu dịch ra vẫn chứa chữ Trung/Nhật. Tiến hành dịch lại đúng 1 lần...")
                    retry_prompt = (
                        f"Nhiệm vụ của bạn là dịch đoạn thoại truyện tranh sau sang {target_language}.\n"
                        f"CẢNH BÁO CỰC KỲ NGHIÊM NGẶT: Lần dịch trước của bạn bị lỗi dịch ra chữ tiếng Trung hoặc tiếng Nhật gốc. "
                        f"Bạn BẮT BUỘC phải dịch HOÀN TOÀN sang {target_language}. TUYỆT ĐỐI không được trả về chữ Trung Quốc hay chữ Nhật gốc.\n"
                        f"Dữ liệu cần dịch lại: {json.dumps(failed_items, ensure_ascii=False)}"
                    )
                    try:
                        retry_response = deepseek_client.chat.completions.create(
                            model="deepseek-chat",
                            messages=[
                                {
                                    "role": "system", 
                                    "content": (
                                        "You are a professional manga translator. "
                                        f"You must translate the text strictly and fully to {target_language}. "
                                        "Do not output Chinese, Japanese, or any other language characters. Only output standard translated text."
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
        
        # Trừ thời gian sử dụng thực tế của user
        if user_id:
            execution_time_seconds = time.perf_counter() - ai_start_time
            
            boot_fee = 0.0
            if was_cold_start and not client_saw_hot:
                boot_fee = 30.0
                print(f"❄️ [COLD START] Charging 30s boot fee for user {user_id}")
                
            total_charge = execution_time_seconds + boot_fee
            deduct_balance(user_id, total_charge, f"Dịch trang truyện (Trang ID: {page_id}){' - Phí khởi động GPU 30s' if boot_fee > 0 else ''}")
        
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
