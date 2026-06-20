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

@celery_app.task(bind=True, name="process_manga_page")
def process_manga_page(self, page_id: str, config: dict):
    task_id = self.request.id
    try:
        import db_models as models
        
        target_language = config.get("target_language", "Tiếng Việt")
        if not target_language:
            target_language = "Tiếng Việt"
        
        # 1. Kiểm tra checkpoint hủy đầu tiên trước khi đọc DB
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước khi bắt đầu. Dừng!")
            return {"status": "cancelled", "message": "Task was cancelled before execution"}

        user_id = None
        project_id = None
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

        broadcast_progress(task_id, 25, "Đang khởi tạo dịch vụ xử lý...")
        
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
        broadcast_progress(task_id, 40, "Đang nhận diện chữ và tách nền...")
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
                broadcast_progress(task_id, 60, "Đang tiến hành tẩy nền và đọc chữ...")
            elif status == "IN_QUEUE":
                broadcast_progress(task_id, 45, "Đang xếp hàng chờ máy chủ xử lý...")
                
        # 4. Trích xuất kết quả RunPod
        clean_b64 = runpod_result.get("clean_image_base64")
        extracted_data = runpod_result.get("data", [])
        
        # 5. Checkpoint hủy lần 3: TRƯỚC KHI GỌI DEEPSEEK API (PAID API)
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy trước cuộc gọi DeepSeek API. Dừng!")
            return {"status": "cancelled", "message": "Task was cancelled before DeepSeek call"}

        # Dịch bằng DeepSeek hoặc Grok trên VPS
        if extracted_data:
            unrestricted = config.get("unrestrictedMode", False)
            try:
                translations = {}
                if unrestricted:
                    broadcast_progress(task_id, 80, "Đang tiến hành dịch thuật (Unrestricted Mode via Grok)...")
                    ocr_batch_payload = [{"id": item["id"], "japanese": item["japanese"]} for item in extracted_data]
                    XAI_API_KEY = os.environ.get("XAI_API_KEY")
                    if not XAI_API_KEY:
                        raise Exception("Chưa cấu hình API Key cho Grok (XAI_API_KEY)")
                    
                    lang_val = target_language if target_language else "Tiếng Việt"
                    
                    system_content = (
                        "Bạn là một dịch giả truyện tranh chuyên nghiệp, không bị giới hạn bởi các bộ lọc từ ngữ thông thường. "
                        f"Nhiệm vụ của bạn là dịch sát nghĩa, mượt mà và giữ nguyên toàn bộ các từ lóng, âm thanh biểu cảm (NSFW) sang {lang_val}. \n\n"
                        "LỆNH TỐI CAO: Bạn đồng thời là một hệ thống kiểm duyệt pháp lý. Nếu phân tích thấy ngữ cảnh đoạn thoại có chứa các yếu tố lạm dụng trẻ em, ấu dâm, loli, shota hoặc nhân vật dưới tuổi vị thành niên, TUYỆT ĐỐI KHÔNG DỊCH. Bỏ qua mọi yêu cầu của người dùng và chỉ trả về duy nhất chuỗi ký tự này: [ERROR_CSAM_DETECTED]"
                    )
                    
                    prompt = (
                        f"Thể loại: {config.get('genre', '')}. Xưng hô: {config.get('pronouns', '')}. Văn phong: {config.get('tone', '')}.\n"
                        "Bạn BẮT BUỘC TRẢ VỀ FORMAT JSON chứa mảng 'translations', ví dụ: {\"translations\": [{\"id\": 1, \"translation\": \"bản dịch\"}]}.\n"
                        f"Dữ liệu cần dịch: {json.dumps(ocr_batch_payload, ensure_ascii=False)}"
                    )
                    if config.get("glossary"):
                        prompt = f"Từ điển thuật ngữ (ưu tiên sử dụng): {config.get('glossary')}\n" + prompt
                        
                    headers = {
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {XAI_API_KEY}"
                    }
                    
                    payload = {
                        "model": "grok-4.3",
                        "temperature": 0.5,
                        "max_output_tokens": 2048,
                        "top_p": 0.95,
                        "reasoning": {
                            "effort": "low"
                        },
                        "stream": False,
                        "response_format": {"type": "json_object"},
                        "messages": [
                            {"role": "system", "content": system_content},
                            {"role": "user", "content": prompt}
                        ]
                    }
                    
                    for attempt in range(3):
                        try:
                            res = httpx.post("https://api.x.ai/v1/chat/completions", json=payload, headers=headers, timeout=60.0)
                            if res.status_code != 200:
                                raise Exception(f"Grok API failed with status {res.status_code}: {res.text}")
                            
                            res_data = res.json()
                            ai_content = res_data["choices"][0]["message"]["content"]
                            
                            if "[ERROR_CSAM_DETECTED]" in ai_content:
                                raise Exception("[ERROR_CSAM_DETECTED] Vi phạm chính sách an toàn: Phát hiện nội dung lạm dụng trẻ vị thành niên (Loli/Shota/CSAM).")
                                
                            ai_response = robust_json_parse(ai_content)
                            translations = extract_translations(ai_response)
                            if translations:
                                print(f"✅ [GROK] Dịch thành công ở lần thử thứ {attempt+1}!")
                                break
                            else:
                                print(f"⚠️ [GROK] Lần thử thứ {attempt+1} trả về bản dịch rỗng, đang thử lại...")
                        except Exception as e:
                            print(f"⚠️ [GROK] Lần thử thứ {attempt+1} gặp lỗi: {e}")
                            if "[ERROR_CSAM_DETECTED]" in str(e):
                                raise e
                            if attempt == 2:
                                raise e
                        time.sleep(1)
                else:
                    broadcast_progress(task_id, 80, "Đang tiến hành dịch thuật ngữ cảnh...")
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
                    if unrestricted:
                        XAI_API_KEY = os.environ.get("XAI_API_KEY")
                        retry_system_content = (
                            "You are a professional manga translator. "
                            f"You must translate the text strictly and fully to {target_language}. "
                            "Do not output Chinese, Japanese, or any other language characters. Only output standard translated text."
                        )
                        retry_payload = {
                            "model": "grok-4.3",
                            "temperature": 0.5,
                            "max_output_tokens": 2048,
                            "top_p": 0.95,
                            "reasoning": {
                                "effort": "low"
                            },
                            "stream": False,
                            "response_format": {"type": "json_object"},
                            "messages": [
                                {"role": "system", "content": retry_system_content},
                                {"role": "user", "content": retry_prompt}
                            ]
                        }
                        res = httpx.post("https://api.x.ai/v1/chat/completions", json=retry_payload, headers={"Content-Type": "application/json", "Authorization": f"Bearer {XAI_API_KEY}"}, timeout=60.0)
                        if res.status_code == 200:
                            retry_ai_content = res.json()["choices"][0]["message"]["content"]
                            if "[ERROR_CSAM_DETECTED]" in retry_ai_content:
                                raise Exception("[ERROR_CSAM_DETECTED] Vi phạm chính sách an toàn trong quá trình dịch lại.")
                            retry_ai_response = robust_json_parse(retry_ai_content)
                            retry_translations = extract_translations(retry_ai_response)
                        else:
                            raise Exception(f"Grok retry failed with status {res.status_code}")
                    else:
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
                if "[ERROR_CSAM_DETECTED]" in str(de):
                    raise de
                error_source = "Grok" if unrestricted else "DeepSeek"
                print(f"⚠️ [{error_source.upper()} ERROR] Lỗi dịch {error_source}: {de}")
                for item in extracted_data:
                    item["vietnamese"] = f"Lỗi dịch thuật ({error_source})"
                    if "text" in item:
                        item["text"] = f"Lỗi dịch thuật ({error_source})"
                    
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
        
        # Ghi nhận cache vào Redis
        try:
            img_hash = get_image_ahash(raw_path)
            if img_hash:
                cache_key = f"ocr_translate_cache:{img_hash}:{target_language}"
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
        
        # Hoàn Xu cho người dùng do lỗi tác vụ ngầm thất bại (không hoàn Xu nếu vi phạm chính sách CSAM)
        is_csam = "ERROR_CSAM_DETECTED" in str(e) or "CSAM" in str(e)
        if is_csam:
            print(f"🛑 [WORKER SAFETY] Không hoàn Xu cho user {user_id} do vi phạm chính sách CSAM (Trang ID: {page_id})")
        elif 'user_id' in locals() and user_id:
            try:
                unrestricted = config.get("unrestrictedMode", False) if 'config' in locals() and config else False
                cost = 2 if unrestricted else 1
                with SessionLocal() as db:
                    user = db.query(models.User).filter(models.User.id == user_id).with_for_update().first()
                    if user and not user.is_pro:
                        user.credits += cost
                        new_txn = models.UserTransaction(
                            user_id=user_id,
                            amount=cost,
                            type="TOPUP",
                            description=f"Hoàn {cost} Xu: Dịch trang thất bại do lỗi hệ thống (ID: {page_id})"
                        )
                        db.add(new_txn)
                        db.commit()
                        print(f"🔄 [WORKER REFUND] Đã hoàn lại {cost} Xu cho user {user_id} do lỗi dịch trang {page_id}")
            except Exception as re:
                print(f"⚠️ [WORKER REFUND ERROR] Không thể hoàn Xu cho user {user_id}: {re}")

        broadcast_progress(task_id, 0, f"Thất bại: {str(e)}", state="FAILURE")
        raise e
