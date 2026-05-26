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

        # 🚀 CHÈN BÍ THUẬT VÀO ĐÂY: Phình to mặt nạ bằng Elip để nuốt trọn viền đen (Anti-Aliasing)
        dilation_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.dilate(mask, dilation_kernel, iterations=1)

        # 🚀 Bắn log: 30%
        self.update_state(state='PROCESSING', meta={'progress': 30, 'message': 'Đang trích xuất tiếng Nhật (OCR)...'})
        broadcast_progress(task_id, 30, 'Đang đọc chữ & Tẩy nền (LaMa)...')
        
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        extracted_data = []
        ocr_batch_payload = []
        count = 1

        # 2. ĐỌC CHỮ & XÓA NỀN CÙNG LÚC
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            
            # 🚀 BẢN VÁ: BỘ LỌC BỤI VÀ RÁC (MICRO-NOISE FILTER)
            # Sếp vặn thông số MIN_SIZE ở đây.
            # - Để 15 hoặc 20: Lọc rác cực sạch, nhưng có thể bỏ sót chữ Furigana siêu nhỏ.
            # - Để 10 hoặc 12: Bắt chữ nhỏ tốt, nhưng dễ dính bụi.
            MIN_SIZE = 16 
            
            if w < MIN_SIZE or h < MIN_SIZE: 
                continue # Kích thước quá nhỏ -> Đích thị là hạt bụi, bỏ qua luôn!
                
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
            # 🚀 ÉP KHUÔN TỪ ĐIỂN MẠNH HƠN
            glossary_instruction = f"5. TỪ ĐIỂN BẮT BUỘC SỬ DỤNG (Không được tự ý dịch khác):\n{glossary}" if glossary.strip() else ""
            
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
                response_format={'type': 'json_object'},
                temperature=0.3 # 🚀 HẠ TEMPERATURE ĐỂ AI BỚT SÁNG TẠO VÀ TUÂN THỦ TỪ ĐIỂN
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
        # ... (Các đoạn code lưu clean_image ở trên giữ nguyên)
        clean_path = filename.replace("/raw/", "/clean/")
        os.makedirs(os.path.dirname(clean_path), exist_ok=True)
        cv2.imwrite(clean_path, clean_image)
        
        self.update_state(state='PROCESSING', meta={'progress': 100, 'message': 'Hoàn thiện...'})
        broadcast_progress(task_id, 100, 'Hoàn tất!', state='SUCCESS')
        
        # 🚀 ĐÃ SỬA: Xóa bỏ psd_url và jsx_url đi vì Frontend và main.py đã tự lo!
        return {
            "status": "success",
            "clean_url": f"{get_base_url()}/{clean_path}",
            "data": extracted_data 
        }
        
    except Exception as e:
        print("\n" + "="*50)
        print("🚨 LỖI NGHIÊM TRỌNG TRONG CELERY WORKER:")



import json
import os

def create_jsx_script(extracted_data, output_jsx_path):
    """
    Hàm này nhận dữ liệu từ AI và đẻ ra 1 file Script (.jsx) cho Photoshop.
    """
    js_data = []
    for item in extracted_data:
        # Lấy tọa độ khung chứa chữ
        box = item.get('box', [0, 0, 100, 100])
        x, y, x_max, y_max = box[0], box[1], box[2], box[3]
        
        # Bỏ các box không có bản dịch
        text = item.get('vietnamese', '').strip()
        if not text:
            continue
            
        js_data.append({
            "text": text,
            "x": x,
            "y": y,
            "w": x_max - x,
            "h": y_max - y
        })
    
    # Biến List Python thành Array Javascript an toàn
    js_array_str = json.dumps(js_data, ensure_ascii=False)
    
    # Đóng gói thành mã Adobe ExtendScript
    jsx_content = f"""// Script Tu Dong Hoa Typesetting Mangaf
// Duoc tao boi He thong AI SaaS

if (app.documents.length > 0) {{
    var doc = app.activeDocument;
    app.preferences.rulerUnits = Units.PIXELS; // Ep he toa do Pixel
    
    var mangaData = {js_array_str};
    
    // Tao 1 Group xit xam de chua toan bo Text
    var textGroup = doc.layerSets.add();
    textGroup.name = "[3] Text AI (Tu Dong)";
    
    for (var i = 0; i < mangaData.length; i++) {{
        var item = mangaData[i];
        
        // Tao Text Layer moi
        var textLayer = textGroup.artLayers.add();
        textLayer.kind = LayerKind.TEXT;
        
        var ti = textLayer.textItem;
        ti.kind = TextType.PARAGRAPHTEXT; // Chuan Paragraph de chu tu xuong dong
        ti.width = item.w;
        ti.height = item.h;
        ti.position = [item.x, item.y];
        ti.contents = item.text;
        
        // Dinh dang font chu co ban (Can giua, Size)
        try {{
            ti.size = new UnitValue(16, "px");
            ti.justification = Justification.CENTER;
        }} catch(e) {{}}
    }}
    
    // Thong bao khi xong
    alert("Thanh cong! Đã do xong " + mangaData.length + " bong bong thoai!");
}} else {{
    alert("Vui long mo file PSD len truoc khi chay script!");
}}
"""
    # Lưu file ra ổ cứng
    with open(output_jsx_path, 'w', encoding='utf-8') as f:
        f.write(jsx_content)
        
    return output_jsx_path


