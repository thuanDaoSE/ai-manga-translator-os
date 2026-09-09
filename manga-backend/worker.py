import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "comic_text_detector"))
import cv2
import json
import time
import base64
import re
import httpx
import logging
import numpy as np
from PIL import Image
from openai import OpenAI
from dotenv import load_dotenv

# Tắt log spam
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

# Chống văng app trên Windows
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

load_dotenv()

from database import SyncSessionLocal as SessionLocal
from task_manager import local_task_manager

# Khởi tạo OpenAI/DeepSeek
def get_deepseek_client():
    return deepseek_client

deepseek_client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

_ocr_manager = None
_ocr_router = None
_yolo_model = None
_text_detector = None
_lama_session = None

def get_ocr_router():
    global _ocr_router
    if _ocr_router is None:
        from ocr_router import get_ocr_router as _init_router
        _ocr_router = _init_router()
    return _ocr_router

def get_ocr_manager():
    global _ocr_manager
    if _ocr_manager is None:
        from ocr_manager import OCRManager
        _ocr_manager = OCRManager()
    return _ocr_manager

def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        try:
            from ultralytics import YOLO
            model_path = os.path.join(os.path.dirname(__file__), "weights", "yolov8x.pt")
            if os.path.exists(model_path):
                _yolo_model = YOLO(model_path)
            else:
                _yolo_model = YOLO("yolov8x.pt")
        except Exception as e:
            print(f"⚠️ [YOLO INIT ERROR] {e}")
    return _yolo_model

def get_text_detector():
    global _text_detector
    if _text_detector is None:
        ctd_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "comic_text_detector")
        if ctd_dir not in sys.path:
            sys.path.insert(0, ctd_dir)
        from comic_text_detector.inference import TextDetector
        model_path = os.path.join(os.path.dirname(__file__), "comic_text_detector", "data", "comictextdetector.pt")
        if not os.path.exists(model_path):
            model_path = os.path.join(os.path.dirname(__file__), "weights", "comictextdetector.pt")
        _text_detector = TextDetector(model_path=model_path, input_size=1024, act='leaky')
    return _text_detector

def get_lama_session():
    global _lama_session
    if _lama_session is None:
        import onnxruntime as ort
        model_path = os.path.join(os.path.dirname(__file__), "weights", "lama-manga.onnx")
        if not os.path.exists(model_path):
            model_path = "weights/lama-manga.onnx"
            
        if os.path.exists(model_path):
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
            try:
                _lama_session = ort.InferenceSession(model_path, providers=providers)
                print(f"✅ [LAMA INIT] Khởi tạo LaMa ONNX thành công! Providers: {_lama_session.get_providers()}")
            except Exception as e:
                print(f"⚠️ [LAMA INIT CUDA FAIL] Lỗi GPU: {e}, fallback CPU...")
                _lama_session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
        else:
            raise FileNotFoundError(f"Missing lama-manga.onnx at {model_path}")
    return _lama_session

def get_image_ahash(image_path: str) -> str:
    try:
        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return ""
        img_resized = cv2.resize(img, (8, 8), interpolation=cv2.INTER_AREA)
        avg = img_resized.mean()
        diff = img_resized >= avg
        hash_val = 0
        for i, b in enumerate(diff.flatten()):
            if b:
                hash_val |= (1 << i)
        return f"{hash_val:016x}"
    except Exception as e:
        print(f"⚠️ [HASH ERROR] Lỗi hash ảnh: {e}")
        return ""

def run_local_lama(img: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Xóa chữ trên ảnh sử dụng LaMa ONNX cục bộ"""
    try:
        session = get_lama_session()
        if session is None:
            return img
        h_orig, w_orig = img.shape[:2]
        
        inputs = session.get_inputs()
        target_h, target_w = 512, 512
        if len(inputs[0].shape) == 4 and isinstance(inputs[0].shape[2], int) and inputs[0].shape[2] > 0:
            target_h = inputs[0].shape[2]
        if len(inputs[0].shape) == 4 and isinstance(inputs[0].shape[3], int) and inputs[0].shape[3] > 0:
            target_w = inputs[0].shape[3]

        img_resized = cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_AREA)
        mask_resized = cv2.resize(mask, (target_w, target_h), interpolation=cv2.INTER_NEAREST)

        img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        img_tensor = np.transpose(img_rgb, (2, 0, 1))[np.newaxis, ...]
        
        mask_norm = (mask_resized.astype(np.float32) / 255.0)
        mask_norm = (mask_norm > 0).astype(np.float32)
        mask_tensor = mask_norm[np.newaxis, np.newaxis, ...]

        input_feed = {
            inputs[0].name: img_tensor,
            inputs[1].name: mask_tensor
        }
        
        output = session.run(None, input_feed)[0]
        
        clean_out = output[0]
        clean_out = np.clip(clean_out * 255.0, 0, 255).astype(np.uint8)
        clean_out = np.transpose(clean_out, (1, 2, 0))
        clean_bgr = cv2.cvtColor(clean_out, cv2.COLOR_RGB2BGR)

        clean_restored = cv2.resize(clean_bgr, (w_orig, h_orig), interpolation=cv2.INTER_LANCZOS4)
        
        mask_binary = (mask > 0)[:, :, np.newaxis]
        result = np.where(mask_binary, clean_restored, img)
        return result
    except Exception as e:
        print(f"⚠️ [LAMA RUN ERROR] {e}")
        return img

def contains_cjk_characters(text: str) -> bool:
    if not text:
        return False
    cjk_pattern = re.compile(r'[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]')
    return bool(cjk_pattern.search(text))

def broadcast_progress(task_id: str, progress: int, message: str, state="PROCESSING", result=None):
    """Cập nhật tiến độ task vào Local Task Manager"""
    local_task_manager.update_progress(task_id, progress, message, state=state, result=result)

def is_task_cancelled(task_id: str) -> bool:
    return local_task_manager.is_cancelled(task_id)

def sync_update_page_db(page_id: str, clean_url: str, bubbles: list):
    """Cập nhật kết quả vào cơ sở dữ liệu SQLite"""
    import db_models as models
    with SessionLocal() as db:
        page = db.query(models.Page).filter(models.Page.id == page_id).first()
        if page:
            page.clean_url = clean_url
            page.bubbles_data = json.dumps(bubbles, ensure_ascii=False)
            page.status = "completed"
            db.commit()
            print(f"✅ [WORKER DB] Đã cập nhật kết quả dịch cho trang {page_id} vào SQLite!")

def process_manga_page(task_id: str, page_id: str, config: dict):
    """
    Hàm xử lý dịch trang truyện tranh (Single-tenant local mode)
    100% Native Python AI (comic-text-detector + LaMa ONNX + Manga-OCR + DeepSeek)
    """
    try:
        import db_models as models
        
        target_language = config.get("target_language", "Tiếng Việt") or "Tiếng Việt"
        source_language = config.get("source_language", "ja") or "ja"
        task_type = config.get("task_type", "clean_only")
        
        # 1. Kiểm tra checkpoint hủy
        if is_task_cancelled(task_id):
            print(f"🛑 [WORKER] Task {task_id} đã bị hủy.")
            return {"status": "cancelled", "message": "Task was cancelled"}

        # Lấy thông tin trang truyện từ CSDL SQLite
        with SessionLocal() as db:
            page = db.query(models.Page).filter(models.Page.id == page_id).first()
            if not page:
                raise ValueError(f"Không tìm thấy trang truyện cho page_id: {page_id}")
            raw_url = page.raw_url
            project_id = page.project_id
            
        if not raw_url:
            raise ValueError(f"Không tìm thấy URL ảnh gốc cho page_id: {page_id}")
            
        raw_path = raw_url.lstrip('/')
        if not os.path.exists(raw_path):
            raise ValueError(f"Không tìm thấy file ảnh gốc tại: {raw_path}")
            
        broadcast_progress(task_id, 15, "Đang đọc ảnh gốc...")
        
        img = cv2.imread(raw_path)
        if img is None:
            raise ValueError(f"Không thể giải mã file ảnh tại {raw_path}")
            
        # Kiểm tra hủy
        if is_task_cancelled(task_id):
            return {"status": "cancelled", "message": "Task was cancelled"}

        broadcast_progress(task_id, 30, "Đang nhận diện vùng chữ (ComicTextDetector)...")
        
        # 1. Chạy comic_text_detector để lấy mask chữ và bounding boxes
        detector = get_text_detector()
        result = detector(img)
        ctd_mask = result[1] if isinstance(result, tuple) else result
        if ctd_mask.max() <= 1.0:
            ctd_mask = (ctd_mask * 255).astype(np.uint8)
        else:
            ctd_mask = ctd_mask.astype(np.uint8)
            
        _, ctd_mask_bin = cv2.threshold(ctd_mask, 127, 255, cv2.THRESH_BINARY)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
        lama_mask = cv2.dilate(ctd_mask_bin, kernel, iterations=1)
        
        contours, _ = cv2.findContours(lama_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        detector_boxes = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w < 16 or h < 16:
                continue
            detector_boxes.append((x, y, x + w, y + h))
            
        # Sắp xếp theo thứ tự đọc
        if source_language == 'ja':
            detector_boxes.sort(key=lambda b: (-b[2], b[1]))
        else:
            detector_boxes.sort(key=lambda b: (b[1], b[0]))
            
        broadcast_progress(task_id, 50, "Đang xóa chữ trên ảnh (LaMa Inpainting)...")
        
        # 2. Xóa chữ bằng LaMa Inpainting
        clean_img = run_local_lama(img, lama_mask)
        
        broadcast_progress(task_id, 65, f"Đang nhận dạng văn bản ({source_language.upper()}) với OCR Router...")
        
        # 3. Quét OCR từng vùng chữ theo nguyên tắc "Detect-then-Crop"
        extracted_data = []
        count = 1
        ocr_router = get_ocr_router()
        
        for (bx1, by1, bx2, by2) in detector_boxes:
            box_crop = img[by1:by2, bx1:bx2]
            if box_crop.size == 0:
                continue
                
            try:
                recognized_text = ocr_router.recognize(
                    image_input=box_crop,
                    source_language=source_language,
                    box_id=count
                )
            except Exception as ocr_err:
                print(f"⚠️ [OCR ROUTER ERROR] Box ID {count} failed: {ocr_err}")
                recognized_text = ""
            
            if not recognized_text or not recognized_text.strip():
                continue
                
            extracted_data.append({
                "id": count,
                "box_coordinates": {"x1": bx1, "y1": by1, "x2": bx2, "y2": by2},
                "japanese": recognized_text.strip(),
                "vietnamese": ""
            })
            count += 1

        # 4. Dịch thuật bằng DeepSeek nếu có chữ và được yêu cầu
        if extracted_data and task_type != "clean_only":
            broadcast_progress(task_id, 80, "Đang dịch văn bản bằng DeepSeek AI...")
            try:
                ocr_batch_payload = [{"id": item["id"], "text": item["japanese"]} for item in extracted_data]
                system_prompt = (
                    "Bạn là một dịch giả truyện tranh chuyên nghiệp sang tiếng Việt.\n"
                    "Nhiệm vụ của bạn là dịch các bong bóng thoại được cung cấp.\n"
                    "QUY TẮC QUAN TRỌNG:\n"
                    "1. Tự động suy luận ngữ cảnh, giới tính, tuổi tác và mối quan hệ của nhân vật để sử dụng đại từ nhân xưng tiếng Việt tự nhiên nhất (anh-em, cậu-tớ, mày-tao, chú-cháu...).\n"
                    "2. Dịch sát nghĩa, giữ nguyên sắc thái biểu cảm (vui, buồn, tức giận).\n"
                    "3. Trả về đúng định dạng JSON được yêu cầu, tuyệt đối không thay đổi ID của bong bóng thoại."
                )
                user_prompt = (
                    f"Định dạng JSON yêu cầu: {{\"translations\": [{{\"id\": 1, \"translation\": \"bản dịch\"}}]}}.\n"
                    f"Dữ liệu cần dịch: {json.dumps(ocr_batch_payload, ensure_ascii=False)}"
                )

                response = deepseek_client.chat.completions.create(
                    model="deepseek-chat",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    response_format={'type': 'json_object'}
                )
                res_content = response.choices[0].message.content
                ai_data = json.loads(res_content)
                trans_map = {str(t["id"]): t["translation"] for t in ai_data.get("translations", [])}
                
                for item in extracted_data:
                    item_id = str(item["id"])
                    if item_id in trans_map:
                        item["vietnamese"] = trans_map[item_id]
                        item["text"] = trans_map[item_id]
            except Exception as de:
                print(f"⚠️ [DEEPSEEK ERROR] Lỗi dịch DeepSeek: {de}")
                for item in extracted_data:
                    item["vietnamese"] = item["japanese"]
                    item["text"] = item["japanese"]

        # 5. Lưu ảnh sạch lên ổ đĩa
        broadcast_progress(task_id, 90, "Đang lưu trữ ảnh sạch...")
        clean_dir = f"workspace/{project_id}/clean"
        os.makedirs(clean_dir, exist_ok=True)
        clean_file_path = f"{clean_dir}/{page_id}.jpg"
        cv2.imwrite(clean_file_path, clean_img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        clean_url = f"/{clean_file_path}"
        
        result_payload = {
            "clean_url": clean_url,
            "data": extracted_data
        }
        
        # 6. Cập nhật SQLite CSDL
        sync_update_page_db(page_id, clean_url, extracted_data)
        
        broadcast_progress(task_id, 100, "Hoàn tất!", state="SUCCESS", result=result_payload)
        return result_payload
        
    except Exception as e:
        import traceback
        print(f"❌ [WORKER ERROR] Lỗi xử lý: {e}")
        traceback.print_exc()
        try:
            with SessionLocal() as db:
                page = db.query(models.Page).filter(models.Page.id == page_id).first()
                if page:
                    page.status = "failed"
                    db.commit()
        except Exception:
            pass
            
        broadcast_progress(task_id, 0, f"Thất bại: {str(e)}", state="FAILURE")
        raise e
