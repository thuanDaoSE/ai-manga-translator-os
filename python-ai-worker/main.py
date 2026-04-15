from fastapi import FastAPI, UploadFile, File
from manga_ocr import MangaOcr
import shutil
import os

# Khởi tạo Server FastAPI
app = FastAPI(title="Manga OCR Microservice")

# Nạp model AI lên RAM 1 lần duy nhất khi khởi động server
print("Đang nạp mô hình AI vào RAM. Vui lòng đợi...")
mocr = MangaOcr()
print("Mô hình đã sẵn sàng nhận Request!")

@app.post("/api/ocr")
async def extract_text(file: UploadFile = File(...)):
    """
    API nhận một file ảnh (crop bong bóng thoại) và trả về text tiếng Nhật/Hàn.
    """
    # 1. Lưu file ảnh người dùng gửi lên vào bộ nhớ tạm
    temp_file_path = f"temp_{file.filename}"
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # 2. Đưa ảnh cho AI đọc
    extracted_text = mocr(temp_file_path)
    
    # 3. Xóa ảnh tạm để dọn dẹp ổ cứng
    if os.path.exists(temp_file_path):
        os.remove(temp_file_path)
    
    # 4. Trả kết quả về dạng JSON chuẩn mực
    return {
        "status": "success",
        "filename": file.filename,
        "text": extracted_text
    }