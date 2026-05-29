import os
import cv2
import json
import time
import shutil
import base64
import httpx
import numpy as np
import urllib.request
from typing import List
from pydantic import BaseModel
from PIL import Image
from fastapi import FastAPI, UploadFile, File,Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import torch
import onnxruntime as ort
from transformers import AutoProcessor, AutoModelForCausalLM
from openai import OpenAI 
from dotenv import load_dotenv

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI() # Chỗ này sếp đã có sẵn rồi

# 🚀 DÁN NGUYÊN KHỐI NÀY VÀO NGAY DƯỚI DÒNG Khởi tạo app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Cho phép tất cả các web (cổng 5500, 3000...) được gọi vào
    allow_credentials=True,
    allow_methods=["*"],  # Cho phép mọi loại request (GET, POST, PUT, DELETE)
    allow_headers=["*"],
)

# ==========================================
# KHAI BÁO CLASS DỮ LIỆU (PYDANTIC)
# ==========================================
class Point(BaseModel):
    x: int
    y: int

class ErasePayload(BaseModel):
    filename: str
    points: List[Point]
    brush_size: int = 25 

# 1. Cập nhật Payload để nhận thêm Ngữ cảnh (Context)
class QuickScanPayload(BaseModel):
    filename: str
    x1: int
    y1: int
    x2: int
    y2: int
    # Bổ sung các trường ngữ cảnh (cho phép rỗng để tương thích ngược)
    genre: str = "Truyện tranh chung"
    tone: str = "Tự nhiên"
    pronouns: str = "Linh hoạt"

    
class MaskPayload(BaseModel):
    filename: str
    mask_base64: str

print("🚀 Đang khởi động hệ thống AI Manga Translator OS (Bản Full Web API)...")

# ==========================================
# CẤU HÌNH API DEEPSEEK
# ==========================================
load_dotenv()
client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"), # Đảm bảo đúng base_url
    http_client=httpx.Client(timeout=120.0) # 🚀 BÍ QUYẾT LÀ DÒNG NÀY
)

# ==========================================
# NẠP CÁC AI LOCAL (CTD & LAMA ONNX)
# ==========================================
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), "comic_text_detector"))

from manga_ocr import MangaOcr
from comic_text_detector.inference import TextDetector

print("🧠 Đang nạp Bộ não MangaOCR (Đọc chữ)...")
mocr = MangaOcr() 

def extract_text_manga_ocr(crop_bgr):
    image_pil = Image.fromarray(cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB))
    text = mocr(image_pil)
    return text.strip()

print("👁️ Đang nạp Đôi mắt Thần thánh Comic-Text-Detector...")
device = "cuda" if torch.cuda.is_available() else "cpu"
ctd_model_path = os.path.join(os.path.dirname(__file__), "comic_text_detector", "data", "comictextdetector.pt")
text_detector = TextDetector(model_path=ctd_model_path, device=device)

print("🎨 Đang nạp Họa sĩ LaMa (Bản Manga ONNX Tối thượng - lama-manga.onnx)...")
try:
    lama_model_path = os.path.join(os.path.dirname(__file__), "lama-manga.onnx")
    
    if not os.path.exists(lama_model_path):
        print("   -> Đang tải file lama-manga.onnx (khoảng 207MB) từ HuggingFace...")
        
        # Link xịn 100% từ đúng kho của tác giả mayocream
        url = "https://huggingface.co/mayocream/lama-manga-onnx/resolve/main/lama-manga.onnx"
        
        # NGỤY TRANG: Đóng giả làm trình duyệt Chrome để HuggingFace không chặn 401/403
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        )
        
        # Mở luồng tải và lưu file
        with urllib.request.urlopen(req) as response, open(lama_model_path, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
            
        print("   -> ✅ Đã tải xong file lama-manga.onnx!")
    else:
        print("   -> Đã tìm thấy file lama-manga.onnx sẵn có trong máy.")

    # Khởi tạo ONNX Runtime
    device_providers = ['CUDAExecutionProvider'] if torch.cuda.is_available() else ['CPUExecutionProvider']
    lama_session = ort.InferenceSession(lama_model_path, providers=device_providers)
    print("✅ KHỞI TẠO LAMA MANGA ONNX THÀNH CÔNG!")
    
except Exception as e:
    print(f"❌ LỖI KHỞI TẠO LAMA: {e}")
    print("💡 HƯỚNG DẪN TẢI THỦ CÔNG (Nếu mạng vẫn chặn):")
    print("1. Vào trình duyệt, dán link này để tải: https://huggingface.co/mayocream/lama-manga-onnx/resolve/main/lama-manga.onnx")
    print("2. Đợi tải xong file (khoảng 207MB), để file vào cùng thư mục với main.py")
# ==========================================
# KHỞI TẠO MÁY CHỦ FASTAPI
# ==========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], # 🚀 Thêm port của React vào đây
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Cho phép Web UI lấy các file ảnh Clean, Preview trực tiếp từ thư mục
# Đảm bảo thư mục hiện tại của bạn có các file này
app.mount("/static", StaticFiles(directory="."), name="static")

@app.post("/api/upload-raw")
async def upload_raw(file: UploadFile = File(...)):
    # CÚ LÁCH LUẬT: Lưu thẳng ảnh gốc với tiền tố Clean_ 
    # để lót đường cho Cọ xóa và Lens dịch hoạt động được ngay lập tức
    raw_path = f"Clean_{file.filename}"
    
    # Ghi file xuống ổ cứng siêu tốc
    with open(raw_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    print(f"📥 [Upload Ngầm] Đã lưu tạm {file.filename} để sẵn sàng thao tác.")
    return {"status": "success"}


@app.post("/api/translate-page")
async def translate_full_page(
    file: UploadFile = File(...),
    genre: str = Form("Truyện tranh chung"),
    tone: str = Form("Tự nhiên"),
    pronouns: str = Form("Linh hoạt"),
    glossary: str = Form("")
):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    
    # 1. CTD QUÉT TOÀN TRANG ĐỂ LẤY MẶT NẠ HOÀN HẢO
    print("🎯 CTD đang dò quét và tạo mặt nạ Pixel-Perfect...")
    result = text_detector(image)
    
    # Ép kiểu mặt nạ về chuẩn trắng đen của OpenCV (0 - 255)
    ctd_mask = result[0] if isinstance(result, tuple) else result
    if ctd_mask.max() <= 1.0:
        ctd_mask = (ctd_mask * 255).astype(np.uint8)
    else:
        ctd_mask = ctd_mask.astype(np.uint8)

    # ==========================================
    # 👇 BẢN VÁ TỐI THƯỢNG: SMART MASKING (DIỆT VIỀN TRẮNG) 👇
    # ==========================================
    # 1. Ép mask của CTD về Trắng/Đen tuyệt đối
    _, ctd_mask = cv2.threshold(ctd_mask, 127, 255, cv2.THRESH_BINARY)
    
    # 2. Tạo mặt nạ "Béo" (Cố tình phình to cực đại để nuốt trọn viền trắng)
    kernel_fat = np.ones((7, 7), np.uint8)
    fat_mask = cv2.dilate(ctd_mask, kernel_fat, iterations=2)
    
    # 3. Quét ảnh gốc để tìm những vùng màu TRẮNG SÁNG (chính là cái viền halo)
    gray_img = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, white_regions = cv2.threshold(gray_img, 200, 255, cv2.THRESH_BINARY)
    
    # 4. Xác định vùng an toàn: "Được phép xóa nếu nó là nét chữ HOẶC là nền màu trắng"
    allowed_to_erase = cv2.bitwise_or(ctd_mask, white_regions)
    
    # 5. Toán học tập hợp: Ép mặt nạ béo bị cắt xén bởi vùng an toàn
    # Lúc này mặt nạ sẽ ăn sạch viền trắng, nhưng KHÔNG THỂ cắn vào ngón tay đen hay vân lưới xám!
    smart_mask = cv2.bitwise_and(fat_mask, allowed_to_erase)
    
    # 6. Phình to thêm đúng 1 pixel nhẹ cuối cùng để làm mượt cạnh cắt, giúp LaMa dễ vẽ bù
    kernel_smooth = np.ones((3, 3), np.uint8)
    smart_mask = cv2.dilate(smart_mask, kernel_smooth, iterations=1)
    
    # Đưa mặt nạ thông minh này làm mặt nạ tổng
    mask = smart_mask.copy()
    # ==========================================

    # 2. TÌM TỌA ĐỘ BONG BÓNG TỪ MẶT NẠ ĐỂ GỌI MANGA-OCR
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    extracted_data = []
    ocr_batch_payload = []
    count = 1
    
    h_img, w_img = image.shape[:2]
    clean_image = image.copy()

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        
        # Lọc rác li ti (CTD rất xịn nên hiếm khi có rác, nhưng cứ để bảo vệ)
        if w < 10 or h < 10:
            continue
            
        x1, y1, x2, y2 = x, y, x + w, y + h
        
        # Cắt mẩu ảnh để MangaOCR đọc chữ
        cropped_image = image[y1:y2, x1:x2]
        
        print(f"🔎 OCR đang đọc khối chữ {count}...")
        japanese_text = extract_text_manga_ocr(cropped_image)
        
        extracted_data.append({
            "id": count,
            "box_coordinates": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            "japanese": japanese_text,
            "vietnamese": ""
        })
        
        ocr_batch_payload.append({
            "id": count,
            "type": "Chưa phân loại", 
            "japanese": japanese_text
        })
        count += 1
        
    # ==========================================
    # TRẠM INPAINTING NÂNG CAO (KỸ THUẬT SOFT INPAINTING & DYNAMIC PADDING)
    # ==========================================
    print("🎨 LaMa đang dùng phép thuật vẽ bù hậu cảnh...")
    clean_image = image.copy()
    
    # Tìm các cụm chữ đã được gộp lại trên mặt nạ toàn trang
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        
        if w < 10 or h < 10: 
            continue
            
        # 1. Tính toán Padding Động (Context Area)
        # Cho LaMa nhìn thấy bối cảnh xung quanh gấp rưỡi kích thước chữ để nó hiểu đường nét hàng rào/cửa
        pad_x = int(w * 0.5) 
        pad_y = int(h * 0.5)
        # Giới hạn an toàn, tránh padding quá nhỏ hoặc vượt qua biên ảnh
        pad_x = max(40, min(pad_x, 150))
        pad_y = max(40, min(pad_y, 150))
        
        x1_pad, y1_pad = max(0, x - pad_x), max(0, y - pad_y)
        x2_pad, y2_pad = min(w_img, x + w + pad_x), min(h_img, y + h + pad_y)
        
        crop_img = clean_image[y1_pad:y2_pad, x1_pad:x2_pad]
        crop_mask = mask[y1_pad:y2_pad, x1_pad:x2_pad]
        
        # Bỏ qua nếu vùng mask trống (do quá trình tính toán viền lân cận)
        if cv2.countNonZero(crop_mask) == 0:
            continue

        # ... (Phần 1. Tính toán Padding Động giữ nguyên)

        # ==========================================
        # 2. XỬ LÝ ẢNH CHUẨN KÍCH THƯỚC 512x512 CHO ONNX
        # ==========================================
        h_crop, w_crop = crop_img.shape[:2]
        
        # Lưu lại mask gốc nguyên thủy để lát dán
        original_crop_mask = crop_mask.copy()
        
        # Thu nhỏ nếu ảnh to hơn 512
        scale = 1.0
        if h_crop > 512 or w_crop > 512:
            scale = 512.0 / max(h_crop, w_crop)
            new_w = int(w_crop * scale)
            new_h = int(h_crop * scale)
            crop_img = cv2.resize(crop_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            crop_mask = cv2.resize(crop_mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
        else:
            new_w, new_h = w_crop, h_crop

        # Bù thêm pixel (Padding) để đạt đúng 512x512
        pad_bottom = 512 - new_h
        pad_right = 512 - new_w

        if pad_bottom > 0 or pad_right > 0:
            crop_img = cv2.copyMakeBorder(crop_img, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
            crop_mask = cv2.copyMakeBorder(crop_mask, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)

        # ==========================================
        # 3. CHẠY LAMA MANGA ONNX (BẢN GỐC CHÂN ÁI)
        # ==========================================
        img_t = cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        mask_t = (crop_mask > 0).astype(np.float32)[:, :, np.newaxis]
        
        # TUYỆT ĐỐI KHÔNG làm đen ảnh. Cứ để ONNX tự nhìn và xử lý.
        img_t = np.transpose(img_t, (2, 0, 1))[np.newaxis, ...]
        mask_t = np.transpose(mask_t, (2, 0, 1))[np.newaxis, ...]

        ort_inputs = {
            lama_session.get_inputs()[0].name: img_t,
            lama_session.get_inputs()[1].name: mask_t
        }
        ort_outs = lama_session.run(None, ort_inputs)
        
        out_img = ort_outs[0][0] 
        out_img = np.transpose(out_img, (1, 2, 0)) 
        out_img = (out_img * 255).clip(0, 255).astype(np.uint8)
        clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)

        # ==========================================
        # 4. GỌT LẠI KÍCH THƯỚC GỐC
        # ==========================================
        clean_crop = clean_crop[0:new_h, 0:new_w]
        
        if scale != 1.0:
            clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)

        # ==========================================
        # 5. HARD PASTE (KHÔNG TRỘN VIỀN, BẢO TOÀN VÂN LƯỚI)
        # ==========================================
        mask_bool = original_crop_mask > 0
        clean_image[y1_pad:y2_pad, x1_pad:x2_pad][mask_bool] = clean_crop[mask_bool]

    # ... [Phần gọi DeepSeek API giữ nguyên] ...
        
    # ==========================================
    # TÌM ĐẾN TRẠM 4: DEEPSEEK API VÀ SỬA LẠI PROMPT NHƯ SAU
    # ==========================================
    try:
        # Xử lý Glossary để định hướng AI mạnh mẽ hơn
        glossary_instruction = ""
        if glossary.strip():
            glossary_instruction = f"""
        5. TỪ ĐIỂN BẮT BUỘC (GLOSSARY): 
        Bạn PHẢI tuân thủ tuyệt đối tên riêng và cách xưng hô của các nhân vật sau đây:
        {glossary}
            """

        # Tích hợp Ngữ cảnh vào Prompt
        prompt = f"""
        Bạn là dịch giả truyện tranh chuyên nghiệp. Dưới đây là mảng JSON chứa các câu thoại tiếng Nhật.

        📖 BỐI CẢNH DỰ ÁN (HÃY DỊCH THEO HƯỚNG NÀY):
        - Thể loại truyện: {genre}
        - Văn phong yêu cầu: {tone}
        - Quy tắc xưng hô chung (nếu không có trong từ điển): {pronouns}

        ĐẶC ĐIỂM DỮ LIỆU & QUY TẮC DỊCH:
        1. LỖI OCR: Dữ liệu này RẤT DỄ CHỨA LỖI chính tả do nền truyện tranh bị nhiễu.
        2. TỰ CHỮA LỖI: Hãy dùng logic và BỐI CẢNH DỰ ÁN bên trên để đoán từ gốc tiếng Nhật.
        3. PHÂN LOẠI CHỮ (QUAN TRỌNG): Mỗi câu có một trường "type". 
           + Nếu type là "Thoại trong bong bóng": Hãy dịch thành lời nói có chủ ngữ/vị ngữ bình thường.
           + Nếu type là "Từ tượng thanh (SFX) / Chữ tự do": Hãy dịch ngắn gọn thành các từ tượng thanh tiếng Việt (Ví dụ: Rầm, Bùm, Lạch cạch, Vút) hoặc các dòng suy nghĩ ngắn. TUYỆT ĐỐI không thêm chủ ngữ vào SFX.
        4. VĂN PHONG: Ưu tiên ngôn từ tự nhiên, đúng với 'Văn phong yêu cầu' đã nêu.{glossary_instruction}

        NHIỆM VỤ BẮT BUỘC:
        Dịch mảng JSON tiếng Nhật sau sang tiếng Việt. TUYỆT ĐỐI trả về một đối tượng JSON có key là "translations" chứa mảng kết quả, không giải thích gì thêm.
        
        Dữ liệu cần dịch:
        {json.dumps(ocr_batch_payload, ensure_ascii=False)}
        """
        
        print("🧠 Đang gửi yêu cầu dịch thuật (Có ngữ cảnh) cho DeepSeek...")
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You are a helpful translator that fixes OCR errors and outputs strict JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={'type': 'json_object'} # Giữ nguyên cơ chế ép JSON của API
        )
        
       # Bóc tách kết quả từ DeepSeek
        result_content = response.choices[0].message.content
        parsed_json = json.loads(result_content)
        translated_array = parsed_json.get("translations", [])
        
        # Ghép bản dịch vào dữ liệu gốc
        for item in extracted_data:
            for trans in translated_array:
                if trans.get("id") == item["id"]:
                    # Dùng .get để nếu AI không trả về chữ vietnamese thì dùng chữ "Lỗi dịch"
                    item["vietnamese"] = trans.get("vietnamese", "Lỗi dịch thuật (API)")
                    break
    except Exception as e:
        print(f"❌ Lỗi gọi API DeepSeek: {e}")

        
    # Lưu lại file kết quả cuối cùng xuống ổ cứng (Lót đường cho Cọ Xóa làm việc tiếp)
    clean_path = f"Clean_{file.filename}"
    cv2.imwrite(clean_path, clean_image)
    
    print("✅ Hoàn tất luồng xử lý AI. Đã sẵn sàng trả về cho Web!")

    return {
        "status": "success",
        "file_name": file.filename,
        "clean_background_generated": True,
        "total_bubbles_found": len(extracted_data),
        "data": extracted_data 
    }

import base64

class MaskPayload(BaseModel):
    filename: str
    mask_base64: str

# ==========================================
# SỬA LỖI 1: CỌ XÓA NỀN (ÉP KÍCH THƯỚC ĐÚNG 512x512 CHO ONNX)
# ==========================================
@app.post("/api/erase-mask")
def erase_mask(payload: MaskPayload):
    base_image_path = payload.filename 
    
    if not os.path.exists(base_image_path):
        return {"status": "error", "message": "File gốc không tồn tại"}

    image = cv2.imread(base_image_path)
    
    # Giải mã Mask từ Base64
    encoded_data = payload.mask_base64.split(',')[1]
    nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
    mask_rgba = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    
    # Lấy kênh Alpha làm Mask trắng đen
    mask = mask_rgba[:, :, 3] 

    # Thuật toán Cắt mẩu (Crop)
    x, y, w, h = cv2.boundingRect(mask)
    if w > 0 and h > 0:
        pad = 80 
        h_img, w_img = image.shape[:2]
        x1, y1 = max(0, x-pad), max(0, y-pad)
        x2, y2 = min(w_img, x+w+pad), min(h_img, y+h+pad)

        crop_image = image[y1:y2, x1:x2]
        crop_mask = mask[y1:y2, x1:x2]

        h_crop, w_crop = crop_image.shape[:2]
        
        # 🚀 SỬA LỖI ONNX: Bắt buộc Scale/Pad thành 512x512
        scale = 1.0
        if h_crop > 512 or w_crop > 512:
            # Nếu ảnh to hơn 512, thu nhỏ nó lại sao cho cạnh dài nhất bằng 512
            scale = 512.0 / max(h_crop, w_crop)
            new_w = int(w_crop * scale)
            new_h = int(h_crop * scale)
            crop_image = cv2.resize(crop_image, (new_w, new_h), interpolation=cv2.INTER_AREA)
            crop_mask = cv2.resize(crop_mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
        else:
            new_w, new_h = w_crop, h_crop

        # Bù thêm pixel (Padding) để đạt ĐÚNG 512x512
        pad_bottom = 512 - new_h
        pad_right = 512 - new_w

        if pad_bottom > 0 or pad_right > 0:
            crop_image = cv2.copyMakeBorder(crop_image, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
            crop_mask = cv2.copyMakeBorder(crop_mask, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)

        # 🚀 CHẠY LAMA MANGA ONNX
        img_t = cv2.cvtColor(crop_image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        mask_t = (crop_mask > 0).astype(np.float32)[:, :, np.newaxis]
        
        img_t = np.transpose(img_t, (2, 0, 1))[np.newaxis, ...]
        mask_t = np.transpose(mask_t, (2, 0, 1))[np.newaxis, ...]

        ort_inputs = {
            lama_session.get_inputs()[0].name: img_t,
            lama_session.get_inputs()[1].name: mask_t
        }
        ort_outs = lama_session.run(None, ort_inputs)
        
        out_img = ort_outs[0][0] 
        out_img = np.transpose(out_img, (1, 2, 0)) 
        out_img = (out_img * 255).clip(0, 255).astype(np.uint8)
        clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)

        # Cắt bỏ chính xác phần bù (Padding)
        clean_crop = clean_crop[0:new_h, 0:new_w]
        crop_mask = crop_mask[0:new_h, 0:new_w] 

        # 🚀 Nếu lúc nãy thu nhỏ, giờ phải phóng to lại cho vừa ảnh gốc
        if scale != 1.0:
            clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)
            crop_mask = cv2.resize(crop_mask, (w_crop, h_crop), interpolation=cv2.INTER_NEAREST)

        # Dán lại vào ảnh chính
        mask_bool = crop_mask > 0
        image[y1:y2, x1:x2][mask_bool] = clean_crop[mask_bool]
        
        new_filename = f"v{int(time.time())}_{payload.filename.split('_')[-1]}"
        cv2.imwrite(new_filename, image)
        return {"status": "success", "new_filename": new_filename}
    
    return {"status": "error", "message": "Mask rỗng"}
# 2. Cập nhật hàm API Quick Scan
@app.post("/api/quick-scan")
async def quick_scan(payload: QuickScanPayload):
    vietnamese_text = "⚠️ Lỗi dịch thuật (Vui lòng thử lại)"
    
    clean_path = payload.filename
    if not os.path.exists(clean_path):
        return {"status": "error", "message": f"File không tồn tại: {clean_path}"}
    
    image = cv2.imread(clean_path)
    h, w = image.shape[:2]
    x1, x2 = sorted([max(0, min(payload.x1, w)), max(0, min(payload.x2, w))])
    y1, y2 = sorted([max(0, min(payload.y1, h)), max(0, min(payload.y2, h))])
    
    if x2 - x1 < 10 or y2 - y1 < 10:
        return {"status": "error", "message": "Vùng quét quá nhỏ"}
        
    crop = image[y1:y2, x1:x2]
    crop_upscaled = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    japanese_text = extract_text_manga_ocr(crop_upscaled)
    
    if not japanese_text.strip():
        return {"status": "success", "japanese": "", "vietnamese": "Không đọc được chữ"}
        
    print(f"🧠 [LENS] Đang dịch nhanh câu: {japanese_text}")
    
    # 🚀 PROMPT MỚI: TỐI ƯU CHO CA KHÓ & CÓ NGỮ CẢNH
    system_prompt = f"""
    Bạn là dịch giả truyện tranh chuyên nghiệp. 
    Bối cảnh truyện: Thể loại [{payload.genre}], Văn phong [{payload.tone}], Xưng hô [{payload.pronouns}].
    
    ĐẶC ĐIỂM DỮ LIỆU ĐẦU VÀO: 
    Đoạn text tiếng Nhật dưới đây được người dùng khoanh vùng quét thủ công vì hệ thống tự động đã bỏ sót. Nó có khả năng rất cao là:
    1. Chữ tượng thanh (SFX) vẽ tay nghệ thuật.
    2. Một phần của câu bị đứt đoạn / bị che khuất.
    3. Chữ chứa nhiều lỗi OCR (nhận diện sai ký tự do nền nhiễu).
    
    NHIỆM VỤ: Hãy dùng logic suy luận để ĐOÁN và SỬA LỖI OCR. Nếu nó là SFX, hãy dịch sang âm thanh tiếng Việt tương ứng (VD: Rầm, Vút, Bùm).
    CHỈ trả về kết quả dịch tiếng Việt, tuyệt đối không giải thích gì thêm.
    """

    try:
       response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": japanese_text}
            ]
        )
       vietnamese_text = response.choices[0].message.content
    except Exception as e:
        vietnamese_text = "Lỗi dịch thuật API."
        
    return {
        "status": "success",
        "japanese": japanese_text,
        "vietnamese": vietnamese_text
    }

if __name__ == "__main__":
    import uvicorn
    # Tham số host="0.0.0.0" để cho phép mạng Lan truy cập, port=8000 là cổng chạy
    uvicorn.run(app, host="0.0.0.0", port=8000)