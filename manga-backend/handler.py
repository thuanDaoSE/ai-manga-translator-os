import runpod
import base64
import cv2
import numpy as np
import os
import torch
import onnxruntime as ort
import sys
from PIL import Image

print("Khởi động AI Engine...")

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

def handler(job):
    job_input = job['input']
    action = job_input.get('action', 'translate') # Mặc định là dịch nguyên trang

    # 🟢 1. LỆNH PING: Giữ máy luôn thức
    if action == 'ping':
        return {"status": "success", "message": "pong"}

    # 🟢 2. LỆNH SCAN: Chỉ quét chữ MangaOCR
    elif action == 'scan':
        img_b64 = job_input['image_base64']
        nparr = np.frombuffer(base64.b64decode(img_b64), np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return {"status": "success", "text": extract_text_manga_ocr(image)}

    # 🟢 3. LỆNH ERASE: Chỉ xóa mảng nhỏ (LaMa)
    elif action == 'erase':
        img_b64 = job_input['image_base64']
        mask_b64 = job_input['mask_base64']
        crop_img = cv2.imdecode(np.frombuffer(base64.b64decode(img_b64), np.uint8), cv2.IMREAD_COLOR)
        crop_mask = cv2.imdecode(np.frombuffer(base64.b64decode(mask_b64), np.uint8), cv2.IMREAD_GRAYSCALE)

        h_crop, w_crop = crop_img.shape[:2]
        
        # Xử lý tự scale và padding cho LaMa
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

        if scale != 1.0:
            clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)

        _, buffer = cv2.imencode('.png', clean_crop)
        return {"status": "success", "clean_crop_base64": base64.b64encode(buffer).decode('utf-8')}

    # 🟢 4. LỆNH TRANSLATE: Dịch toàn bộ trang truyện (Giữ nguyên code cũ của sếp)
    img_b64 = job_input['image_base64']
    img_data = base64.b64decode(img_b64)
    nparr = np.frombuffer(img_data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    clean_image = image.copy()
    h_img, w_img = image.shape[:2]

    try:
        result = text_detector(image)
        ctd_mask = result[0] if isinstance(result, tuple) else result
        if ctd_mask.max() <= 1.0: ctd_mask = (ctd_mask * 255).astype(np.uint8)
        else: ctd_mask = ctd_mask.astype(np.uint8)
        
        _, ctd_mask = cv2.threshold(ctd_mask, 127, 255, cv2.THRESH_BINARY)
        fat_mask = cv2.dilate(ctd_mask, np.ones((7, 7), np.uint8), iterations=2)
        _, white_regions = cv2.threshold(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), 200, 255, cv2.THRESH_BINARY)
        
        smart_mask = cv2.dilate(cv2.bitwise_and(fat_mask, cv2.bitwise_or(ctd_mask, white_regions)), np.ones((3, 3), np.uint8), iterations=1)
        mask = smart_mask.copy()
        mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1)
        
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        extracted_data = []
        count = 1

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w < 16 or h < 16: continue 
            
            japanese_text = extract_text_manga_ocr(image[y:y+h, x:x+w])
            extracted_data.append({"id": count, "box_coordinates": {"x1": x, "y1": y, "x2": x+w, "y2": y+h}, "japanese": japanese_text, "vietnamese": ""})
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
            
        _, buffer = cv2.imencode('.jpg', clean_image)
        clean_b64 = base64.b64encode(buffer).decode('utf-8')

        return {
            "status": "success",
            "clean_image_base64": clean_b64,
            "data": extracted_data,
            "context": {
                "genre": job_input.get("genre", ""),
                "tone": job_input.get("tone", ""),
                "pronouns": job_input.get("pronouns", ""),
                "glossary": job_input.get("glossary", "")
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

runpod.serverless.start({"handler": handler})