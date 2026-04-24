import os
import cv2
import json
import textwrap
import numpy as np
import shutil
import time
import threading

# 1. IMPORT TẤT CẢ THƯ VIỆN LÊN TRÊN CÙNG
from typing import List
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from manga_ocr import MangaOcr
from ultralytics import YOLO
from simple_lama_inpainting import SimpleLama
from openai import OpenAI 

class Point(BaseModel):
    x: int
    y: int

# 2. ĐỊNH NGHĨA CLASS DỮ LIỆU SAU KHI ĐÃ IMPORT
class ErasePayload(BaseModel):
    filename: str
    points: List[Point]
    brush_size: int = 25 # Độ to mặc định của cọ là 25 pixel

class QuickScanPayload(BaseModel):
    filename: str
    x1: int
    y1: int
    x2: int
    y2: int

print("🚀 Đang khởi động hệ thống AI Manga Translator OS (Bản Full Web API)...")

# 3. CẤU HÌNH API DEEPSEEK

import os
from dotenv import load_dotenv

# Tải biến môi trường từ file .env lên RAM
load_dotenv()

# Lấy Key ra (Nếu không có file .env, nó sẽ báo lỗi ngay)
api_key = os.getenv("DEEPSEEK_API_KEY")
if not api_key:
    raise ValueError("🚨 Thiếu DEEPSEEK_API_KEY trong file .env!")
client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

# 4. KHỞI TẠO CÁC AI LOCAL
print("👁️ Đang nạp Đôi mắt YOLO...")
yolo_model = YOLO("comic-speech-bubble-detector.pt")

print("🧠 Đang nạp Bộ não MangaOCR...")
mocr = MangaOcr()

print("🪄 Đang nạp Họa sĩ LaMa...")
lama = SimpleLama()

app = FastAPI(title="Manga AI Worker")

def garbage_collector():
    while True:
        # 1. Xác định thư mục chứa ảnh (ở đây là thư mục gốc của project)
        folder_path = "." 
        current_time = time.time()
        
        # 2. Quét toàn bộ file trong thư mục
        for filename in os.listdir(folder_path):
            # Chỉ tìm những file do hệ thống tự sinh ra (bắt đầu bằng Clean_ hoặc v)
            if filename.startswith("Clean_") or filename.startswith("v"):
                file_path = os.path.join(folder_path, filename)
                
                # 3. Kiểm tra tuổi đời của file
                file_age = current_time - os.path.getmtime(file_path)
                
                # 4. Nếu file CŨ HƠN 3 GIỜ (3 * 60 * 60 giây) -> XÓA KHÔNG THƯƠNG TIẾC
                if file_age > 10800: 
                    try:
                        os.remove(file_path)
                        print(f"🗑️ Đã dọn rác: {filename}")
                    except Exception as e:
                        pass
        
        # Ngủ 1 tiếng rồi dậy dọn tiếp
        time.sleep(3600)

# Khởi chạy "Người dọn rác" ở một luồng (thread) chạy ngầm riêng biệt
# để không làm kẹt luồng xử lý API chính của FastAPI
gc_thread = threading.Thread(target=garbage_collector, daemon=True)
gc_thread.start()

# ... [GIỮ NGUYÊN TOÀN BỘ PHẦN CODE BÊN DƯỚI TỪ app.add_middleware TRỞ ĐI] ...

# 1. Cho phép Web UI gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
async def translate_full_page(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    results = yolo_model(image)
    
    extracted_data = []
    ocr_batch_payload = []
    count = 1
    
    mask = np.zeros(image.shape[:2], dtype=np.uint8)
    
    # --- TRẠM 1: TẠO MẶT NẠ THÔNG MINH (BẢN CHỐNG BÓNG MA "WHITE GHOST") ---
    for box in results[0].boxes.xyxy:
        x1, y1, x2, y2 = map(int, box.tolist())
        
        if (x2 - x1) < 15 or (y2 - y1) < 15:
            continue
            
        # 1. Cắt nguyên bản khung YOLO
        cropped_image = image[y1:y2, x1:x2]
        gray_crop = cv2.cvtColor(cropped_image, cv2.COLOR_BGR2GRAY)
        
        # 2. Ngưỡng Otsu bắt chữ đen và viền đen
        _, thresh = cv2.threshold(gray_crop, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        # =======================================================
        # 3. THUẬT TOÁN ĐỔ MỰC (Lọc riêng chữ và viền)
        # =======================================================
        h_crop, w_crop = thresh.shape
        mask_flood = np.zeros((h_crop + 2, w_crop + 2), np.uint8) 
        text_only_mask = thresh.copy()
        
        for i in range(w_crop):
            if text_only_mask[0, i] == 255: cv2.floodFill(text_only_mask, mask_flood, (i, 0), 0)
            if text_only_mask[h_crop-1, i] == 255: cv2.floodFill(text_only_mask, mask_flood, (i, h_crop-1), 0)
        for i in range(h_crop):
            if text_only_mask[i, 0] == 255: cv2.floodFill(text_only_mask, mask_flood, (0, i), 0)
            if text_only_mask[i, w_crop-1] == 255: cv2.floodFill(text_only_mask, mask_flood, (w_crop-1, i), 0)
            
        # =======================================================
        # 4. KHIÊN BẢO VỆ VIỀN VÀ CÚ ĐẤM XUYÊN BÓNG MA
        # =======================================================
        # Lấy Viền (Bằng cách lấy tổng trừ đi chữ)
        border_mask = cv2.bitwise_xor(thresh, text_only_mask)
        
        # Tạo Khiên: Làm béo cái viền lên 1 chút để tạo vùng an toàn
        kernel_small = np.ones((3, 3), np.uint8)
        fat_border = cv2.dilate(border_mask, kernel_small, iterations=1)
        
        # Cú Đấm: Làm béo mặt nạ chữ CỰC MẠNH (Dùng kernel 5x5, tô 2 lần) 
        # Việc này đảm bảo nuốt trọn mọi quầng sáng trắng, nhiễu ảnh xung quanh chữ gốc
        kernel_big = np.ones((5, 5), np.uint8)
        fat_text = cv2.dilate(text_only_mask, kernel_big, iterations=2)
        
        # Kết Hợp Ma Trận: Lấy "Chữ béo" TRỪ ĐI "Khiên bảo vệ".
        # Kết quả: Mặt nạ chữ được phình to hết cỡ, nhưng hễ chạm vào gần viền là bị gọt phẳng!
        final_clean_mask = cv2.bitwise_and(fat_text, cv2.bitwise_not(fat_border))
        
        # 5. Đắp mặt nạ hoàn hảo vào hệ thống
        mask[y1:y2, x1:x2] = cv2.bitwise_or(mask[y1:y2, x1:x2], final_clean_mask)
        
        # 6. Phần OCR (Giữ nguyên)
        temp_crop_path = f"temp_crop_{count}.jpg"
        cv2.imwrite(temp_crop_path, cropped_image)
        japanese_text = mocr(temp_crop_path)
        os.remove(temp_crop_path)
        
        extracted_data.append({
            "id": count,
            "box_coordinates": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            "japanese": japanese_text,
            "vietnamese": ""
        })
        
        ocr_batch_payload.append({
            "id": count,
            "japanese": japanese_text
        })
        count += 1
        
    # ==========================================
    # TRẠM 4: DEEPSEEK API (DỊCH HÀNG LOẠT)
    # ==========================================
    try:
        # Tích hợp "Bộ bối cảnh OCR" vào yêu cầu JSON
        prompt = """
        Bạn là dịch giả truyện tranh chuyên nghiệp. Dưới đây là mảng JSON chứa các câu thoại tiếng Nhật được trích xuất tự động bằng phần mềm quét chữ (OCR).

        ĐẶC ĐIỂM DỮ LIỆU & QUY TẮC DỊCH:
        1. LỖI OCR: Dữ liệu này RẤT DỄ CHỨA LỖI chính tả do nền truyện tranh bị nhiễu (ví dụ: nhìn nhầm Kanji, dính ký tự rác, hoặc bị cụt mất chữ đầu/cuối).
        2. TỰ CHỮA LỖI: Trước khi dịch, hãy dùng logic và ngữ cảnh của toàn bộ các câu thoại để đoán xem từ gốc tiếng Nhật thực sự là gì. Bỏ qua các ký tự rác vô nghĩa.
        3. SFX: Nếu phát hiện từ tượng thanh (tiếng động), hãy dịch thành âm thanh tiếng Việt tương ứng (VD: Rầm, Bùm, Xào xạc).
        4. VĂN PHONG: Ưu tiên ngôn từ tự nhiên, đời thường, đậm chất truyện tranh.

        NHIỆM VỤ BẮT BUỘC:
        Dịch mảng JSON tiếng Nhật sau sang tiếng Việt. TUYỆT ĐỐI trả về một đối tượng JSON có key là "translations" chứa mảng kết quả, không giải thích gì thêm.
        Ví dụ định dạng: {"translations": [{"id": 1, "vietnamese": "Này, cậu làm được không đấy?"}]}
        
        Dữ liệu cần dịch:
        """ + json.dumps(ocr_batch_payload, ensure_ascii=False)
        
        print("🧠 Đang gửi yêu cầu dịch thuật và tự sửa lỗi cho DeepSeek...")
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
                if trans["id"] == item["id"]:
                    item["vietnamese"] = trans["vietnamese"]
                    break
    except Exception as e:
        print(f"❌ Lỗi gọi API DeepSeek: {e}")

    # ==========================================
    # TRẠM 2 ĐẶC BIỆT: LAMA INPAINTING (TÁI CẤU TRÚC - CHIA ĐỂ TRỊ)
    # ==========================================
    print("🎨 LaMa đang dùng phép thuật vẽ bù hậu cảnh (Chế độ Cắt mẩu tối ưu CPU)...")
    clean_image = image.copy()
    
    # TÌM CÁC CỤM CHỮ: Biến mặt nạ toàn trang thành danh sách các vùng chữ cục bộ
    # Việc này giúp gộp các khung YOLO bị đè lên nhau thành 1 vùng duy nhất để tránh LaMa chạy đè
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    pad = 80 # Vùng đệm lân cận để AI hiểu bối cảnh (giống hệ thống Cọ xóa)
    h_img, w_img = clean_image.shape[:2]
    
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        
        # Bỏ qua các mẩu nhiễu quá nhỏ
        if w < 10 or h < 10: 
            continue
            
        # 1. Tính toán tọa độ mở rộng (Padding) an toàn, không bị tràn viền
        x1, y1 = max(0, x - pad), max(0, y - pad)
        x2, y2 = min(w_img, x + w + pad), min(h_img, y + h + pad)
        
        # 2. Cắt mẩu ảnh và mẩu mask
        crop_img = clean_image[y1:y2, x1:x2]
        crop_mask = mask[y1:y2, x1:x2]
        
        # 3. Chạy AI LaMa cho RIÊNG mẩu nhỏ này (Nhanh gấp chục lần, không tốn RAM)
        crop_pil = Image.fromarray(cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB))
        mask_pil = Image.fromarray(crop_mask)
        clean_crop_pil = lama(crop_pil, mask_pil)
        clean_crop = cv2.cvtColor(np.array(clean_crop_pil), cv2.COLOR_RGB2BGR)
        
        # 4. Ép kích thước chuẩn và dán trả lại vào ảnh gốc
        clean_crop = cv2.resize(clean_crop, (crop_img.shape[1], crop_img.shape[0]))
        mask_bool = crop_mask > 0
        clean_image[y1:y2, x1:x2][mask_bool] = clean_crop[mask_bool]
        
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

@app.post("/api/erase-mask")
def erase_mask(payload: MaskPayload):
    # Lấy tên file gốc mà người dùng đang hiển thị trên màn hình
    # Thay vì dùng f"Clean_{payload.filename}", hãy dùng trực tiếp tên file gửi từ Frontend
    base_image_path = payload.filename 
    
    if not os.path.exists(base_image_path):
        return {"status": "error", "message": "File gốc không tồn tại"}

    image = cv2.imread(base_image_path)
    
    # 1. Giải mã Mask từ Base64
    encoded_data = payload.mask_base64.split(',')[1]
    nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
    mask_rgba = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    
    # Lấy kênh Alpha (kênh minh họa vùng đỏ) làm Mask trắng đen
    mask = mask_rgba[:, :, 3] 

    # 2. Thuật toán Cắt mẩu (Crop) tối ưu như cũ
    x, y, w, h = cv2.boundingRect(mask)
    if w > 0 and h > 0:
        pad = 80 # Ngữ cảnh cho LaMa
        h_img, w_img = image.shape[:2]
        x1, y1 = max(0, x-pad), max(0, y-pad)
        x2, y2 = min(w_img, x+w+pad), min(h_img, y+h+pad)

        crop_image = image[y1:y2, x1:x2]
        crop_mask = mask[y1:y2, x1:x2]

        # Chạy LaMa
        crop_pil = Image.fromarray(cv2.cvtColor(crop_image, cv2.COLOR_BGR2RGB))
        mask_pil = Image.fromarray(crop_mask)
        clean_crop_pil = lama(crop_pil, mask_pil)
        clean_crop = cv2.cvtColor(np.array(clean_crop_pil), cv2.COLOR_RGB2BGR)
        
        # Resize và Dán trả lại
        clean_crop = cv2.resize(clean_crop, (crop_image.shape[1], crop_image.shape[0]))
        clean_image = image.copy()
        mask_bool = crop_mask > 0
        clean_image[y1:y2, x1:x2][mask_bool] = clean_crop[mask_bool]
        
        # CHÚ Ý THỤT LỀ: 3 dòng này phải nằm BÊN TRONG khối if (cùng cấp với clean_image)
        new_filename = f"v{int(time.time())}_{payload.filename.split('_')[-1]}"
        cv2.imwrite(new_filename, clean_image)
        return {"status": "success", "new_filename": new_filename}
    
    # NẾU USER KHÔNG VẼ GÌ, trả về lỗi rỗng (Lùi ra bằng cấp với chữ if)
    return {"status": "error", "message": "Mask rỗng"}

@app.post("/api/quick-scan")
async def quick_scan(payload: QuickScanPayload):
    vietnamese_text = "⚠️ Lỗi dịch thuật (Vui lòng thử lại)"
    clean_path = f"Clean_{payload.filename}"
    if not os.path.exists(clean_path):
        return {"status": "error", "message": "File không tồn tại"}
    
    image = cv2.imread(clean_path)
    
    # 1. Chốt tọa độ an toàn (Tránh user quét ngược từ dưới lên hoặc quét ra ngoài ảnh)
    h, w = image.shape[:2]
    x1, x2 = sorted([max(0, min(payload.x1, w)), max(0, min(payload.x2, w))])
    y1, y2 = sorted([max(0, min(payload.y1, h)), max(0, min(payload.y2, h))])
    
    if x2 - x1 < 10 or y2 - y1 < 10:
        return {"status": "error", "message": "Vùng quét quá nhỏ"}
        
    # 2. Cắt mẩu ảnh
    crop = image[y1:y2, x1:x2]
    crop_upscaled = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    temp_path = f"temp_scan_{payload.filename}.jpg"
    cv2.imwrite(temp_path, crop_upscaled)
    
    print(f"🔍 Đang quét OCR một vùng siêu nhỏ...")
    japanese_text = mocr(temp_path)
    os.remove(temp_path)
    
    if not japanese_text.strip():
        return {"status": "success", "japanese": "", "vietnamese": "Không đọc được chữ"}
        
    # 3. Dịch siêu tốc bằng DeepSeek (Không cần ép JSON cho trường hợp câu đơn này)
    print(f"🧠 Đang dịch nhanh câu: {japanese_text}")
    try:
       response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": """Bạn là dịch giả truyện tranh chuyên nghiệp.
                
                ĐẦU VÀO ĐẶC BIỆT: 
                Đoạn text tiếng Nhật dưới đây được trích xuất bằng phần mềm nhận diện hình ảnh (OCR) từ một khung truyện tranh do người dùng tự khoanh vùng. 
                Nó RẤT DỄ CHỨA LỖI: sai Kanji do nét chữ giống nhau, dính ký tự rác do nền nhiễu, hoặc bị cụt mất chữ đầu/cuối do người dùng khoanh thiếu.
                
                NHIỆM VỤ:
                1. TỰ CHỮA LỖI: Hãy dùng logic và ngữ cảnh để đoán xem từ gốc tiếng Nhật thực sự là gì trước khi dịch. Bỏ qua các ký tự rác vô nghĩa (như 'わよ' lơ lửng, v.v.).
                2. DỊCH THUẬT: Chỉ trả về kết quả tiếng Việt, TUYỆT ĐỐI không giải thích quá trình sửa lỗi.
                3. SFX: Nếu là từ tượng thanh (tiếng động, hiệu ứng), hãy dịch thoát nghĩa sang âm thanh truyện tranh tiếng Việt (VD: Rầm, Bùm, Lạch cạch).
                4. VĂN PHONG: Ưu tiên câu cú tự nhiên, đời thường, đậm chất truyện tranh."""},
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