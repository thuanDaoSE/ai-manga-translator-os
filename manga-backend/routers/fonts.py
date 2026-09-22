import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/fonts", tags=["fonts"])
FONT_DIR = "workspace/fonts"
os.makedirs(FONT_DIR, exist_ok=True)

@router.get("")
async def list_fonts():
    """Lấy danh sách font chữ đã cài đặt trên máy ảo GPU"""
    os.makedirs(FONT_DIR, exist_ok=True)
    fonts = [f for f in os.listdir(FONT_DIR) if f.lower().endswith(('.ttf', '.otf', '.woff', '.woff2'))]
    return {"fonts": fonts}

@router.post("/upload")
async def upload_font(file: UploadFile = File(...)):
    """Tải lên font chữ mới (.ttf, .otf)"""
    ext = file.filename.split('.')[-1].lower()
    if ext not in ['ttf', 'otf', 'woff', 'woff2']:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file font .ttf, .otf, .woff, .woff2")

    save_path = os.path.join(FONT_DIR, file.filename)
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"status": "success", "filename": file.filename}

@router.get("/{font_name}")
async def get_font_file(font_name: str):
    """Phục vụ file font chữ"""
    font_path = os.path.join(FONT_DIR, font_name)
    if not os.path.exists(font_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy font")
    return FileResponse(font_path)
