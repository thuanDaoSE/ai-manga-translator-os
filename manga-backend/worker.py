import os
# 🚀 VŨ KHÍ TỐI THƯỢNG: Chống văng App im lặng trên Windows
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"


import cv2
import json
import time
import numpy as np
import torch
import onnxruntime as ort
from celery import Celery
from PIL import Image
from openai import OpenAI 
from dotenv import load_dotenv
import sys
import traceback
import redis # 🚀 IMPORT THƯ VIỆN REDIS

# Khởi tạo Celery
celery_app = Celery("manga_tasks", broker="redis://localhost:6379/0", backend="redis://localhost:6379/0")
celery_app.conf.update(worker_prefetch_multiplier=1, worker_max_tasks_per_child=50)

# 🚀 KHỞI TẠO BỘ PHÁT SÓNG REDIS PUB/SUB
redis_client = redis.Redis(host='localhost', port=6379, db=0)

def broadcast_progress(task_id, progress, message, state="PROCESSING"):
    """Hàm helper để vừa báo cho Celery, vừa bắn tốc độ cao qua Redis Pub/Sub"""
    # Đóng gói tin nhắn
    payload = json.dumps({"progress": progress, "message": message, "state": state})
    # Bắn vào kênh riêng của task này
    redis_client.publish(f"task_progress:{task_id}", payload)

def get_base_url():
    pod_id = os.getenv("RUNPOD_POD_ID")
    if pod_id:
        return f"https://{pod_id}-8000.proxy.runpod.net"
    return "http://localhost:8000"

# ==========================================
# KHỞI TẠO AI TRONG WORKER
# ==========================================
load_dotenv()
client = OpenAI(api_key=os.getenv("DEEPSEEK_API_KEY"), base_url="https://api.deepseek.com")

sys.path.append(os.path.join(os.path.dirname(__file__), "comic_text_detector"))
from manga_ocr import MangaOcr
from comic_text_detector.inference import TextDetector

print("👷 [WORKER] Đang nạp MangaOCR...")
mocr = MangaOcr() 

print("👷 [WORKER] Đang nạp CTD...")
device = "cuda" if torch.cuda.is_available() else "cpu"
text_detector = TextDetector(model_path=os.path.join(os.path.dirname(__file__), "comic_text_detector", "data", "comictextdetector.pt"), device=device)

print("👷 [WORKER] Đang nạp LaMa ONNX...")
device_providers = ['CUDAExecutionProvider'] if torch.cuda.is_available() else ['CPUExecutionProvider']
lama_session = ort.InferenceSession(os.path.join(os.path.dirname(__file__), "lama-manga.onnx"), providers=device_providers)

def extract_text_manga_ocr(crop_bgr):
    return mocr(Image.fromarray(cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB))).strip()

# ==========================================
# TASK XỬ LÝ CHÍNH
# ==========================================
@celery_app.task(bind=True, name="process_manga_page")
def process_manga_page(self, filename: str, genre: str, tone: str, pronouns: str, glossary: str):
    task_id = self.request.id
    try:
        print(f"🚀 [CELERY] Bắt đầu chính thức xử lý ảnh: {filename}")
        
        # ... 
        # 🚀 Bắn log: 10%
        self.update_state(state='PROCESSING', meta={'progress': 10, 'message': 'CTD đang quét mặt nạ...'})
        broadcast_progress(task_id, 10, 'CTD đang định vị bong bóng thoại...')
        
        # 🚀 ĐÃ SỬA: Đọc thẳng đường dẫn vật lý do main.py gửi sang, KHÔNG nối chữ Clean_ lằng nhằng nữa!
        img_path = filename 
        image = cv2.imread(img_path)
        if image is None:
            raise ValueError(f"Không thể đọc được file ảnh: {img_path}")
        # ...

       # ... (Phần trên giữ nguyên: img_path = ..., h_img, w_img = ...)
        h_img, w_img = image.shape[:2]
        clean_image = image.copy()

        # ==========================================
        # 1. TẠO MẶT NẠ (PHỤC HỒI AI CTD CHẤT LƯỢNG CAO)
        # ==========================================
        self.update_state(state='PROCESSING', meta={'progress': 10, 'message': 'CTD đang quét mặt nạ...'})
        broadcast_progress(task_id, 10, 'AI CTD đang định vị bong bóng thoại...')
        
        # Chạy lại AI CTD xịn
        result = text_detector(image)
        ctd_mask = result[0] if isinstance(result, tuple) else result
        if ctd_mask.max() <= 1.0: ctd_mask = (ctd_mask * 255).astype(np.uint8)
        else: ctd_mask = ctd_mask.astype(np.uint8)

        _, ctd_mask = cv2.threshold(ctd_mask, 127, 255, cv2.THRESH_BINARY)
        fat_mask = cv2.dilate(ctd_mask, np.ones((7, 7), np.uint8), iterations=2)
        _, white_regions = cv2.threshold(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), 200, 255, cv2.THRESH_BINARY)
        
        # Lọc thông minh
        smart_mask = cv2.dilate(cv2.bitwise_and(fat_mask, cv2.bitwise_or(ctd_mask, white_regions)), np.ones((3, 3), np.uint8), iterations=1)
        mask = smart_mask.copy()

        # 🚀 Bắn log: 30%
        self.update_state(state='PROCESSING', meta={'progress': 30, 'message': 'Đang trích xuất tiếng Nhật (OCR)...'})
        broadcast_progress(task_id, 30, 'Đang đọc chữ & Tẩy nền (LaMa)...')
        
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        extracted_data = []
        ocr_batch_payload = []
        count = 1

        # 2. ĐỌC CHỮ & XÓA NỀN CÙNG LÚC (Giữ nguyên phần dưới này)
        for cnt in contours:
        # ...
            x, y, w, h = cv2.boundingRect(cnt)
            if w < 10 or h < 10: continue
                
            japanese_text = extract_text_manga_ocr(image[y:y+h, x:x+w])
            extracted_data.append({"id": count, "box_coordinates": {"x1": x, "y1": y, "x2": x+w, "y2": y+h}, "japanese": japanese_text, "vietnamese": ""})
            ocr_batch_payload.append({"id": count, "type": "Chưa phân loại", "japanese": japanese_text})
            count += 1
            
            pad_x, pad_y = max(40, min(int(w * 0.5), 150)), max(40, min(int(h * 0.5), 150))
            x1_pad, y1_pad = max(0, x - pad_x), max(0, y - pad_y)
            x2_pad, y2_pad = min(w_img, x + w + pad_x), min(h_img, y + h + pad_y)
            
            crop_img = clean_image[y1_pad:y2_pad, x1_pad:x2_pad]
            crop_mask = mask[y1_pad:y2_pad, x1_pad:x2_pad]
            if cv2.countNonZero(crop_mask) == 0: continue
            
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

            ort_outs = lama_session.run(None, {lama_session.get_inputs()[0].name: img_t, lama_session.get_inputs()[1].name: mask_t})
            out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255).clip(0, 255).astype(np.uint8)
            clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]
            
            if scale != 1.0: clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)
            mask_bool = original_crop_mask > 0
            clean_image[y1_pad:y2_pad, x1_pad:x2_pad][mask_bool] = clean_crop[mask_bool]

        # 3. DỊCH DEEPSEEK
        # 🚀 Bắn log: 70%
        self.update_state(state='PROCESSING', meta={'progress': 70, 'message': 'DeepSeek đang dịch nội dung...'})
        broadcast_progress(task_id, 70, 'DeepSeek đang dịch nội dung...')
        
        try:
            glossary_instruction = f"5. TỪ ĐIỂN: {glossary}" if glossary.strip() else ""
            prompt = f"""Bạn là dịch giả truyện tranh. 
            BỐI CẢNH: Thể loại: {genre}, Văn phong: {tone}, Xưng hô: {pronouns}.
            NHIỆM VỤ: Dịch mảng JSON sau sang tiếng Việt. 
            QUY TẮC SỐNG CÒN:
            1. BẮT BUỘC giữ nguyên số lượng ID của từng mục. 
            2. KHÔNG ĐƯỢC tóm tắt hay gộp chung các dòng lại với nhau.
            3. Trả về đúng định dạng JSON: {{"translations": [{{"id": 1, "vietnamese": "..."}}, ...]}}
            {glossary_instruction}
            
            Dữ liệu cần dịch: {json.dumps(ocr_batch_payload, ensure_ascii=False)}"""
            
            response = client.chat.completions.create(
                model="deepseek-chat",
                messages=[{"role": "system", "content": "You output strict JSON."}, {"role": "user", "content": prompt}],
                response_format={'type': 'json_object'}
            )
            
            translated_array = json.loads(response.choices[0].message.content).get("translations", [])
            for item in extracted_data:
                for trans in translated_array:
                    if str(trans.get("id")) == str(item["id"]):
                        item["vietnamese"] = trans.get("vietnamese", "Lỗi dịch thuật")
                        break
        except Exception as e:
            print(f"❌ Lỗi API DeepSeek: {e}")

        # 🚀 Bắn log: 100% (HOÀN THÀNH)
        self.update_state(state='PROCESSING', meta={'progress': 99, 'message': 'Đang hoàn thiện...'})
        broadcast_progress(task_id, 100, 'Hoàn tất!', state='SUCCESS')
        
        # 🚀 SỬA ĐỂ LƯU VÀO THƯ MỤC CLEAN CỦA PROJECT
        clean_path = filename.replace("/raw/", "/clean/")
        
        # 🚀 BẢN VÁ 1: Bắt buộc tạo thư mục /clean/ trước khi lưu, nếu không cv2 sẽ im lặng thất bại!
        os.makedirs(os.path.dirname(clean_path), exist_ok=True)
        
        cv2.imwrite(clean_path, clean_image)
        
        return {
            "status": "success",
            "clean_url": f"{get_base_url()}/{clean_path}",
            "data": extracted_data 
        }
    except Exception as e:
        print("\n" + "="*50)
        print("🚨 LỖI NGHIÊM TRỌNG TRONG CELERY WORKER:")
        traceback.print_exc()
        print("="*50 + "\n")
        self.update_state(state='FAILURE', meta={'exc_type': type(e).__name__, 'exc_message': str(e)})
        # 🚀 Bắn log lỗi
        broadcast_progress(task_id, 0, f"Lỗi: {str(e)}", state='FAILURE')
        raise e