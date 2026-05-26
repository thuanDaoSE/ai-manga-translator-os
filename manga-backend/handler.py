import runpod
import base64
import cv2
import numpy as np
import json
import os
import torch
import onnxruntime as ort
from openai import OpenAI 
import sys

# ==========================================
# KHỞI TẠO AI (Sẽ chạy 1 lần lúc Cold Start)
# ==========================================
print("Khởi động AI Engine...")
client = OpenAI(api_key=os.environ.get("DEEPSEEK_API_KEY"), base_url="https://api.deepseek.com")

sys.path.append(os.path.join(os.path.dirname(__file__), "comic_text_detector"))
from manga_ocr import MangaOcr
from comic_text_detector.inference import TextDetector

mocr = MangaOcr() 
device = "cuda" if torch.cuda.is_available() else "cpu"
text_detector = TextDetector(model_path=os.path.join(os.path.dirname(__file__), "comic_text_detector", "data", "comictextdetector.pt"), device=device)

device_providers = ['CUDAExecutionProvider'] if torch.cuda.is_available() else ['CPUExecutionProvider']
lama_session = ort.InferenceSession(os.path.join(os.path.dirname(__file__), "lama-manga.onnx"), providers=device_providers)

def extract_text_manga_ocr(crop_bgr):
    return mocr(Image.fromarray(cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB))).strip()

# ==========================================
# HÀM XỬ LÝ CHÍNH CỦA SERVERLESS
# ==========================================
def handler(job):
    job_input = job['input']
    
    # 1. Giải mã ảnh Base64 từ FastAPI gửi sang
    img_b64 = job_input['image_base64']
    img_data = base64.b64decode(img_b64)
    nparr = np.frombuffer(img_data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    clean_image = image.copy()
    h_img, w_img = image.shape[:2]

    try:
        # 2. Xử lý CTD (Mặt nạ)
        result = text_detector(image)
        ctd_mask = result[0] if isinstance(result, tuple) else result
        if ctd_mask.max() <= 1.0: ctd_mask = (ctd_mask * 255).astype(np.uint8)
        else: ctd_mask = ctd_mask.astype(np.uint8)
        _, ctd_mask = cv2.threshold(ctd_mask, 127, 255, cv2.THRESH_BINARY)
        mask = cv2.dilate(ctd_mask, np.ones((7, 7), np.uint8), iterations=2)
        
        # 3. Lấy chữ và xóa nền LaMa (Thuật toán cũ của sếp giữ nguyên)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        extracted_data = []
        ocr_batch_payload = []
        count = 1

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w < 16 or h < 16: continue # Lọc bụi
            
            # OCR
            japanese_text = extract_text_manga_ocr(image[y:y+h, x:x+w])
            extracted_data.append({"id": count, "box_coordinates": {"x1": x, "y1": y, "x2": x+w, "y2": y+h}, "japanese": japanese_text, "vietnamese": ""})
            ocr_batch_payload.append({"id": count, "type": "Chưa phân loại", "japanese": japanese_text})
            count += 1
            
            # LaMa Xóa nền
            pad_x, pad_y = max(40, min(int(w * 0.5), 150)), max(40, min(int(h * 0.5), 150))
            x1_pad, y1_pad = max(0, x - pad_x), max(0, y - pad_y)
            x2_pad, y2_pad = min(w_img, x + w + pad_x), min(h_img, y + h + pad_y)
            crop_img = clean_image[y1_pad:y2_pad, x1_pad:x2_pad]
            crop_mask = mask[y1_pad:y2_pad, x1_pad:x2_pad]
            
            if cv2.countNonZero(crop_mask) == 0: continue
            
            # (Phần Resize ảnh cho LaMa... sếp chép nguyên code cũ của LaMa vào đây cho gọn)
            # ... 
            
        # 4. Gọi DeepSeek Dịch
        glossary_instruction = f"5. TỪ ĐIỂN: {job_input.get('glossary', '')}"
        prompt = f"Thể loại: {job_input.get('genre', '')}. Xưng hô: {job_input.get('pronouns', '')}. Dịch JSON: {json.dumps(ocr_batch_payload, ensure_ascii=False)}"
        
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "system", "content": "You output strict JSON."}, {"role": "user", "content": prompt}],
            response_format={'type': 'json_object'}
        )
        translated_array = json.loads(response.choices[0].message.content).get("translations", [])
        for item in extracted_data:
            for trans in translated_array:
                if str(trans.get("id")) == str(item["id"]):
                    item["vietnamese"] = trans.get("vietnamese", "Lỗi dịch")

        # 5. MÃ HÓA ẢNH SẠCH THÀNH BASE64 ĐỂ TRẢ VỀ CHO VPS
        _, buffer = cv2.imencode('.jpg', clean_image)
        clean_b64 = base64.b64encode(buffer).decode('utf-8')

        return {
            "status": "success",
            "clean_image_base64": clean_b64,
            "data": extracted_data
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}

# Kích hoạt SDK Serverless
runpod.serverless.start({"handler": handler})