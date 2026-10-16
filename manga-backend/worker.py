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

import threading

# Khóa tuần tự hóa AI pipeline: ngăn chặn race condition trong C++/OpenMP/PyTorch/ONNX Runtime
ai_worker_lock = threading.Lock()

load_dotenv()

from database import SyncSessionLocal as SessionLocal
from task_manager import local_task_manager

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

def get_deepseek_client():
    return deepseek_client

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

_joycaption_engine = None

def get_joycaption_engine():
    global _joycaption_engine
    if _joycaption_engine is None:
        try:
            from joycaption_engine import get_joycaption_engine as _init_joycaption
            _joycaption_engine = _init_joycaption()
        except Exception as e:
            print(f"⚠️ [JoyCaption Init Error]: {e}")
    return _joycaption_engine

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
        import torch
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        _text_detector = TextDetector(model_path=model_path, input_size=1024, device=device, act='leaky')
        print(f"🚀 [TEXT DETECTOR INIT] Initialized Comic Text Detector on device: {device}")
    return _text_detector

def get_lama_session():
    global _lama_session
    if _lama_session is None:
        import onnxruntime as ort
        import torch
        model_path = os.path.join(os.path.dirname(__file__), "weights", "lama-manga.onnx")
        if not os.path.exists(model_path):
            model_path = "weights/lama-manga.onnx"
            
        if os.path.exists(model_path):
            available = ort.get_available_providers()
            if torch.cuda.is_available() and 'CUDAExecutionProvider' in available:
                try:
                    _lama_session = ort.InferenceSession(model_path, providers=['CUDAExecutionProvider', 'CPUExecutionProvider'])
                    print(f"✅ [LAMA INIT] Khởi tạo LaMa ONNX thành công trên GPU CUDA! Providers: {_lama_session.get_providers()}")
                except Exception as e:
                    print(f"⚠️ [LAMA INIT CUDA FAIL] Lỗi GPU: {e}, fallback CPU...")
                    _lama_session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
            else:
                _lama_session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
                print(f"ℹ️ [LAMA INIT] Khởi tạo LaMa trên CPU. Providers: {_lama_session.get_providers()}")
        else:
            raise FileNotFoundError(f"Missing lama-manga.onnx at {model_path}")
    return _lama_session

def warmup_gpu_models():
    """Khởi động và nạp trước các model AI lên GPU VRAM để tránh trễ và hiển thị đúng tài nguyên VRAM"""
    import torch
    if not torch.cuda.is_available():
        print("ℹ️ [WARMUP] Không phát hiện GPU CUDA, chạy chế độ CPU.")
        return
    print(f"🚀 [WARMUP] Đang tải trước các mô hình AI lên GPU ({torch.cuda.get_device_name(0)})...")
    try:
        get_text_detector()
        get_lama_session()
        get_ocr_router()
        print(f"✅ [WARMUP SUCCESS] Các model AI đã nạp sẵn vào VRAM: {torch.cuda.memory_allocated() / (1024**3):.2f} GB / {torch.cuda.get_device_properties(0).total_memory / (1024**3):.2f} GB")
    except Exception as e:
        print(f"⚠️ [WARMUP WARN] Lỗi khi warmup model: {e}")

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

def inpaint_crop_lama(session, crop_img: np.ndarray, crop_mask: np.ndarray) -> np.ndarray:
    """Inpaint một vùng crop cục bộ bằng LaMa 512x512 bảo toàn độ phân giải gốc 1:1"""
    try:
        h_crop, w_crop = crop_img.shape[:2]
        original_crop_mask = crop_mask.copy()

        scale = 1.0
        if h_crop > 512 or w_crop > 512:
            scale = 512.0 / max(h_crop, w_crop)
            new_w, new_h = int(w_crop * scale), int(h_crop * scale)
            crop_img_scaled = cv2.resize(crop_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            crop_mask_scaled = cv2.resize(crop_mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
        else:
            new_w, new_h = w_crop, h_crop
            crop_img_scaled = crop_img
            crop_mask_scaled = crop_mask

        pad_bottom = 512 - new_h
        pad_right = 512 - new_w
        if pad_bottom > 0 or pad_right > 0:
            crop_img_padded = cv2.copyMakeBorder(crop_img_scaled, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
            crop_mask_padded = cv2.copyMakeBorder(crop_mask_scaled, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)
        else:
            crop_img_padded = crop_img_scaled
            crop_mask_padded = crop_mask_scaled

        img_t = np.transpose(cv2.cvtColor(crop_img_padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
        mask_norm = (crop_mask_padded > 0).astype(np.float32)
        mask_t = mask_norm[np.newaxis, np.newaxis, ...]

        inputs = session.get_inputs()
        ort_outs = session.run(None, {inputs[0].name: img_t, inputs[1].name: mask_t})
        out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255.0).clip(0, 255).astype(np.uint8)
        clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]

        if scale != 1.0:
            clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)

        mask_bool = original_crop_mask > 0
        result = crop_img.copy()
        result[mask_bool] = clean_crop[mask_bool]
        return result
    except Exception as e:
        print(f"⚠️ [INPAINT CROP ERROR] {e}")
        return crop_img

def run_local_lama(img: np.ndarray, mask: np.ndarray, target_boxes: list = None) -> np.ndarray:
    """Xóa chữ trên ảnh sử dụng LaMa ONNX cục bộ với độ sắc nét 1:1 và context padding"""
    try:
        session = get_lama_session()
        if session is None:
            return img
        h_img, w_img = img.shape[:2]

        # Nếu ảnh đầu vào là một mẩu crop nhỏ (từ brush tẩy vẽ tay trong Editor)
        if max(h_img, w_img) <= 768:
            return inpaint_crop_lama(session, img, mask)

        clean_img = img.copy()

        # Xác định danh sách vùng cần xóa (dựa vào target_boxes hoặc tìm contour từ mask)
        regions = []
        if target_boxes:
            for (bx1, by1, bx2, by2) in target_boxes:
                regions.append((bx1, by1, bx2 - bx1, by2 - by1))
        else:
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                if w < 10 or h < 10:
                    continue
                regions.append((x, y, w, h))

        if not regions:
            return clean_img

        for (x, y, w, h) in regions:
            # Thêm context padding để LaMa hiểu bối cảnh xung quanh ô thoại (tối ưu 30-120px)
            pad_x = max(30, min(int(w * 0.4), 120))
            pad_y = max(30, min(int(h * 0.4), 120))
            x1_pad, y1_pad = max(0, x - pad_x), max(0, y - pad_y)
            x2_pad, y2_pad = min(w_img, x + w + pad_x), min(h_img, y + h + pad_y)

            crop_img = clean_img[y1_pad:y2_pad, x1_pad:x2_pad]
            crop_mask = mask[y1_pad:y2_pad, x1_pad:x2_pad]

            if cv2.countNonZero(crop_mask) == 0:
                continue

            cleaned_crop = inpaint_crop_lama(session, crop_img, crop_mask)
            clean_img[y1_pad:y2_pad, x1_pad:x2_pad] = cleaned_crop

        return clean_img
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
            page.bubbles_data = json.dumps(
                bubbles, 
                ensure_ascii=False, 
                default=lambda o: int(o) if hasattr(o, 'item') else str(o)
            )
            page.status = "completed"
            db.commit()
            print(f"✅ [WORKER DB] Đã cập nhật kết quả dịch cho trang {page_id} vào SQLite!")

def process_manga_page(task_id: str, page_id: str, config: dict):
    """
    Hàm xử lý dịch trang truyện tranh (Single-tenant local mode)
    100% Native Python AI (comic-text-detector + LaMa ONNX + Hayai-OCR v2 + DeepSeek)
    """
    broadcast_progress(task_id, 5, "Đang xếp hàng chờ xử lý...")
    ai_worker_lock.acquire()
    try:
        import db_models as models
        
        target_language = config.get("target_language") or config.get("targetLanguage") or "Tiếng Việt"
        source_language = config.get("source_language") or config.get("sourceLanguage") or "ja"
        task_type = config.get("task_type") or config.get("taskType") or "translate"
        
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
        
        # 1. Chạy comic_text_detector để lấy textline heatmap, stroke mask và cụm khối thoại (TextBlock)
        detector = get_text_detector()
        result = detector(img)

        mask_raw = result[0] if isinstance(result, tuple) else result
        mask_refined = result[1] if isinstance(result, tuple) and len(result) > 1 else mask_raw
        blk_list = result[2] if isinstance(result, tuple) and len(result) > 2 else []

        # Chuẩn hóa mặt nạ raw và refined về thang đo nhị phân 0-255
        if mask_raw.max() <= 1.0:
            mask_raw_bin = (mask_raw * 255).astype(np.uint8)
        else:
            mask_raw_bin = mask_raw.astype(np.uint8)
        _, mask_raw_bin = cv2.threshold(mask_raw_bin, 127, 255, cv2.THRESH_BINARY)

        # 2. Thuật toán Smart Masking kinh điển (Diệt viền trắng & Tự động gộp các dòng thoại trong cùng 1 bong bóng)
        kernel_fat = np.ones((7, 7), np.uint8)
        fat_mask = cv2.dilate(mask_raw_bin, kernel_fat, iterations=2)
        gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, white_regions = cv2.threshold(gray_img, 200, 255, cv2.THRESH_BINARY)
        smart_mask = cv2.bitwise_and(fat_mask, cv2.bitwise_or(mask_raw_bin, white_regions))
        smart_mask = cv2.dilate(smart_mask, np.ones((3, 3), np.uint8), iterations=1)
        lama_mask = cv2.dilate(smart_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1)

        # 3. Thu thập danh sách tọa độ khung thoại (Bounding Boxes)
        detector_boxes = []
        
        # Ưu tiên 1: Lấy trực tiếp từ blk_list (các TextBlock đã được YOLO phân tích hướng đọc và gom nhóm)
        if blk_list:
            for blk in blk_list:
                bx1, by1, bx2, by2 = blk.xyxy
                w_blk = bx2 - bx1
                h_blk = by2 - by1
                if w_blk >= 16 and h_blk >= 16:
                    detector_boxes.append((bx1, by1, bx2, by2))

        # Ưu tiên 2: Nếu blk_list không bắt được (hoặc trống), dùng contours từ smart_mask đã chập dòng
        if not detector_boxes:
            contours, _ = cv2.findContours(lama_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                if w < 16 or h < 16:
                    continue
                detector_boxes.append((x, y, x + w, y + h))
            
        # Sắp xếp theo thứ tự đọc (tiếng Nhật đọc từ phải sang trái, trên xuống dưới)
        if source_language == 'ja':
            detector_boxes.sort(key=lambda b: (-b[2], b[1]))
        else:
            detector_boxes.sort(key=lambda b: (b[1], b[0]))
            
        broadcast_progress(task_id, 50, "Đang xóa chữ trên ảnh (LaMa Inpainting)...")
        
        # 4. Xóa chữ bằng LaMa Inpainting chuẩn độ phân giải cao theo từng ô thoại
        clean_img = run_local_lama(img, lama_mask, target_boxes=detector_boxes)
        
        broadcast_progress(task_id, 65, "Đang nhận dạng văn bản đa ngữ (Hayai-OCR v2)...")
        
        # 3. Quét OCR vùng chữ bằng Hayai-OCR v2 (Tự động nhận diện Nhật, Hàn, Trung, Anh)
        extracted_data = []
        valid_boxes = []
        box_crops = []
        
        for (bx1, by1, bx2, by2) in detector_boxes:
            box_crop = img[by1:by2, bx1:bx2]
            if box_crop.size == 0:
                continue
            valid_boxes.append((bx1, by1, bx2, by2))
            box_crops.append(box_crop)

        if box_crops:
            ocr_router = get_ocr_router()
            try:
                recognized_texts = ocr_router.recognize_batch(
                    image_inputs=box_crops,
                    source_language="auto",
                    batch_size=16
                )
            except Exception as batch_ocr_err:
                print(f"⚠️ [BATCH OCR ERROR] Fallback to sequential: {batch_ocr_err}")
                recognized_texts = [
                    ocr_router.recognize(crop, source_language="auto", box_id=i + 1)
                    for i, crop in enumerate(box_crops)
                ]

            count = 1
            for (bx1, by1, bx2, by2), recognized_text in zip(valid_boxes, recognized_texts):
                if not recognized_text or not recognized_text.strip():
                    continue

                extracted_data.append({
                    "id": int(count),
                    "box_coordinates": {"x1": int(bx1), "y1": int(by1), "x2": int(bx2), "y2": int(by2)},
                    "japanese": recognized_text.strip(),
                    "original_text": recognized_text.strip(),
                    "vietnamese": ""
                })
                count += 1

        # 4. Sinh Caption Ngữ Cảnh Bằng JoyCaption 4-bit & Dịch thuật bằng DeepSeek
        if extracted_data and task_type != "clean_only":
            broadcast_progress(task_id, 75, "Đang phân tích bối cảnh tranh (JoyCaption VLM)...")
            scene_caption = ""
            try:
                joycaption = get_joycaption_engine()
                if joycaption:
                    scene_caption = joycaption.generate_caption(img)
            except Exception as jc_err:
                print(f"⚠️ [JOYCAPTION ERROR]: {jc_err}")

            broadcast_progress(task_id, 82, "Đang dịch văn bản chuẩn ngữ cảnh bằng DeepSeek AI...")
            try:
                ocr_batch_payload = [{"id": item["id"], "text": item.get("original_text") or item.get("japanese") or item.get("text", "")} for item in extracted_data]
                system_prompt = (
                    "Bạn là một dịch giả truyện tranh (Manga/Manhwa/Comic) chuyên nghiệp hàng đầu sang Tiếng Việt.\n"
                    "Nhiệm vụ của bạn là TỰ ĐỘNG NHẬN DIỆN ngôn ngữ gốc của từng bong bóng thoại (Tiếng Nhật, Hàn, Anh, Trung...) và dịch chuẩn xác sang Tiếng Việt.\n"
                    "ĐẶC BIỆT: Bạn được cung cấp BỐI CẢNH HÌNH ẢNH (Image Context Caption) của trang tranh được phân tích bởi mô hình thị giác AI.\n"
                    "QUY TẮC QUAN TRỌNG:\n"
                    "1. Kết hợp bối cảnh hình ảnh (khung cảnh, cảm xúc, cử chỉ, giới tính nhân vật) để chọn đại từ nhân xưng chuẩn xác và tự nhiên nhất (anh-em, cậu-tớ, mày-tao, tiền bối-hậu bối, sư phụ-đồ đệ...).\n"
                    "2. Tự động nhận diện ngôn ngữ nguồn và dịch sát nghĩa, chuẩn sắc thái biểu cảm.\n"
                    "3. Trả về đúng định dạng JSON được yêu cầu, tuyệt đối không thay đổi ID của bong bóng thoại."
                )
                user_prompt = (
                    f"Bối cảnh hình ảnh trang tranh: {scene_caption if scene_caption else 'Không có mô tả bối cảnh'}\n\n"
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
        
        try:
            from system_quota import global_quota
            global_quota.consume_quota(1)
        except Exception as qe:
            print(f"⚠️ [QUOTA CONSUME NOTICE] {qe}")

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
        return {"status": "failed", "error": str(e)}
    finally:
        if ai_worker_lock.locked():
            ai_worker_lock.release()
