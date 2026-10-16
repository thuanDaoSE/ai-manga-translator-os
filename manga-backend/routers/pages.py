import os
import json
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
import db_models as models
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

router = APIRouter(prefix="/api/pages", tags=["pages"])

class BubbleListPayload(BaseModel):
    bubbles: List[Dict[str, Any]]

@router.get("/{page_id}")
async def get_page(page_id: str, db: AsyncSession = Depends(get_db)):
    """Lấy thông tin chi tiết một trang"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang")
    return page

@router.delete("/{page_id}")
async def delete_page(page_id: str, db: AsyncSession = Depends(get_db)):
    """Xóa một trang và file tương ứng"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        return {"status": "success", "message": "Trang không tồn tại hoặc đã bị xóa"}
        
    # Xóa file raw và clean
    if page.raw_url:
        raw_path = page.raw_url.lstrip('/')
        if os.path.exists(raw_path):
            try:
                os.remove(raw_path)
            except Exception:
                pass
                
    if page.clean_url:
        clean_path = page.clean_url.lstrip('/')
        if os.path.exists(clean_path):
            try:
                os.remove(clean_path)
            except Exception:
                pass
                
    await db.delete(page)
    await db.commit()
    return {"status": "success", "message": "Đã xóa trang"}

@router.get("/{page_id}/bubbles")
async def get_page_bubbles(page_id: str, db: AsyncSession = Depends(get_db)):
    """Lấy danh sách bong bóng thoại của trang"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang")
    try:
        bubbles = json.loads(page.bubbles_data or "[]")
    except Exception:
        bubbles = []
    return {"bubbles": bubbles}

@router.post("/{page_id}/bubbles")
async def save_page_bubbles(
    page_id: str,
    payload: BubbleListPayload,
    db: AsyncSession = Depends(get_db)
):
    """Lưu danh sách bong bóng thoại của trang"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang")
        
    page.bubbles_data = json.dumps(payload.bubbles, ensure_ascii=False)
    if page.status != "completed":
        page.status = "translating"
        
    await db.commit()
    return {"status": "success"}

@router.post("/{page_id}/save-results")
async def save_page_results(
    page_id: str,
    clean_url: str = Query(...),
    bubbles: List[Dict[str, Any]] = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """Lưu kết quả hoàn tất gồm ảnh sạch và bong bóng"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang")
        
    page.clean_url = clean_url
    page.bubbles_data = json.dumps(bubbles, ensure_ascii=False)
    page.status = "completed"
    
    await db.commit()
    return {"status": "success"}

@router.post("/{page_id}/cancel")
async def cancel_page_task(page_id: str, db: AsyncSession = Depends(get_db)):
    """Hủy xử lý trang"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if page and page.status == "processing":
        page.status = "unprocessed"
        await db.commit()
    return {"status": "cancelled"}

@router.get("/{page_id}/download-psd")
async def download_psd(page_id: str, db: AsyncSession = Depends(get_db)):
    """Xuất file PSD chứa layer chữ và ảnh nền sạch"""
    from fastapi.responses import FileResponse
    from psd_utils import create_manga_psd

    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang")

    raw_path = page.raw_url.lstrip('/') if page.raw_url else ""
    clean_path = page.clean_url.lstrip('/') if page.clean_url else raw_path
    if not os.path.exists(clean_path):
        clean_path = raw_path

    psd_dir = f"workspace/{page.project_id}/psd"
    os.makedirs(psd_dir, exist_ok=True)
    psd_output_path = f"{psd_dir}/{page_id}.psd"

    try:
        bubbles_list = json.loads(page.bubbles_data or "[]")
    except Exception:
        bubbles_list = []

    create_manga_psd(raw_path, clean_path, psd_output_path, bubbles_list)

    return FileResponse(
        path=psd_output_path,
        filename=f"MangaAI_{page.filename}.psd",
        media_type="application/octet-stream"
    )

import zipfile
import io
from fastapi.responses import StreamingResponse
from dependencies import get_local_path_from_url

@router.get("/{page_id}/export-manga")
async def export_manga(page_id: str, db: AsyncSession = Depends(get_db)):
    """Đóng gói Ảnh và Chữ thành file .manga (ZIP) để tải về"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Trang không tồn tại hoặc đã bị xóa!")

    img_path_url = page.clean_url if page.clean_url else page.raw_url
    local_img_path = get_local_path_from_url(img_path_url)

    if not os.path.exists(local_img_path):
        raise HTTPException(status_code=404, detail="File ảnh gốc đã bị xóa!")

    bubbles_json = page.bubbles_data or "[]"
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
        img_ext = local_img_path.split('.')[-1]
        zipf.write(local_img_path, arcname=f"image.{img_ext}")
        zipf.writestr("bubbles.json", bubbles_json)

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={page.filename}.manga"}
    )

@router.get("/{page_id}/jsx")
async def download_jsx(page_id: str, db: AsyncSession = Depends(get_db)):
    """Tạo và tải file script JSX Photoshop để tự động hóa typesetting"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Trang không tồn tại hoặc đã bị xóa!")

    bubbles = []
    if page.bubbles_data:
        try:
            bubbles = json.loads(page.bubbles_data)
        except Exception:
            bubbles = []

    if not bubbles:
        raise HTTPException(status_code=404, detail="Trang này chưa có chữ nào!")

    js_data = []
    for b in bubbles:
        text = (b.get("text") or "").strip()
        if not text:
            continue
        js_data.append({
            "text": text,
            "x": b.get("x", 0),
            "y": b.get("y", 0),
            "w": b.get("w", 100),
            "h": b.get("h", 100)
        })

    if not js_data:
        raise HTTPException(status_code=404, detail="Tất cả các hộp thoại đều đang để trống chữ tiếng Việt!")

    js_array_str = json.dumps(js_data, ensure_ascii=False)
    jsx_content = f"""// Script Tu Dong Hoa Typesetting
if (app.documents.length > 0) {{
    var doc = app.activeDocument;
    app.preferences.rulerUnits = Units.PIXELS;
    
    var mangaData = {js_array_str};
    var textGroup = doc.layerSets.add();
    textGroup.name = "[3] Text (Tu Dong)";
    
    for (var i = 0; i < mangaData.length; i++) {{
        var item = mangaData[i];
        var textLayer = textGroup.artLayers.add();
        textLayer.kind = LayerKind.TEXT;
        var ti = textLayer.textItem;
        ti.kind = TextType.PARAGRAPHTEXT;
        ti.width = item.w;
        ti.height = item.h;
        ti.position = [item.x, item.y];
        ti.contents = item.text;
        try {{
            ti.size = new UnitValue(16, "px");
            ti.justification = Justification.CENTER;
        }} catch(e) {{}}
    }}
    alert("Thành công! Đã chèn xong " + mangaData.length + " bong bóng thoại!");
}} else {{
    alert("Vui lòng mở file PSD lên trước khi chạy script!");
}}
"""
    clean_dir = f"workspace/{page.project_id}/clean"
    os.makedirs(clean_dir, exist_ok=True)
    jsx_path = f"{clean_dir}/{page_id}_Text.jsx"
    with open(jsx_path, 'w', encoding='utf-8') as f:
        f.write(jsx_content)

    return FileResponse(
        path=jsx_path,
        filename=f"Auto_Text_Script.jsx",
        media_type="text/plain"
    )

