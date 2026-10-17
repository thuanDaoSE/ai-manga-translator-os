import os
import uuid
import shutil
import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
import db_models as models
from image_utils import preprocess_image as pil_preprocess_image, export_image

router = APIRouter(prefix="/api/projects", tags=["projects"])
LOCAL_USER_ID = "local_user"

@router.get("")
async def list_projects(db: AsyncSession = Depends(get_db)):
    """Lấy danh sách dự án (Single-tenant local mode)"""
    result = await db.execute(
        select(models.Project)
        .order_by(models.Project.created_at.desc())
    )
    projects = result.scalars().all()
    return projects

@router.post("")
async def create_project(payload: dict, db: AsyncSession = Depends(get_db)):
    """Tạo dự án mới"""
    project_id = str(uuid.uuid4())
    name = payload.get("name", "Dự án mới")
    
    project = models.Project(
        id=project_id,
        name=name,
        user_id=LOCAL_USER_ID
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    # Tạo sẵn thư mục lưu trữ cho dự án
    os.makedirs(f"workspace/{project_id}/raw", exist_ok=True)
    os.makedirs(f"workspace/{project_id}/clean", exist_ok=True)
    
    return project

@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Lấy chi tiết dự án (Tự động khởi tạo nếu chưa tồn tại)"""
    result = await db.execute(
        select(models.Project).where(models.Project.id == project_id)
    )
    project = result.scalars().first()
    if not project:
        project = models.Project(
            id=project_id,
            name="Dự án AI Manga",
            user_id=LOCAL_USER_ID
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)
    return project

@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Xóa dự án và các trang liên quan"""
    result = await db.execute(
        select(models.Project).where(models.Project.id == project_id)
    )
    project = result.scalars().first()
    if not project:
        return {"status": "success", "message": "Dự án không tồn tại hoặc đã được xóa"}
        
    await db.delete(project)
    await db.commit()
    
    # Xóa thư mục trên đĩa
    proj_dir = f"workspace/{project_id}"
    if os.path.exists(proj_dir):
        shutil.rmtree(proj_dir, ignore_errors=True)
        
    return {"status": "success", "message": "Đã xóa dự án"}

@router.get("/{project_id}/pages")
async def get_project_pages(project_id: str, db: AsyncSession = Depends(get_db)):
    """Lấy danh sách các trang trong dự án"""
    result = await db.execute(
        select(models.Page)
        .where(models.Page.project_id == project_id)
        .order_by(models.Page.filename.asc())
    )
    pages = result.scalars().all()
    return {"pages": pages}

@router.post("/{project_id}/upload")
async def upload_page(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Tải lên ảnh trang truyện vào dự án (Tự động phục hồi dự án nếu cần)"""
    result = await db.execute(
        select(models.Project).where(models.Project.id == project_id)
    )
    project = result.scalars().first()
    if not project:
        project = models.Project(
            id=project_id,
            name="Dự án AI Manga",
            user_id=LOCAL_USER_ID
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)

    page_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    ext_lower = ext.lower()
    
    raw_dir = f"workspace/{project_id}/raw"
    clean_dir = f"workspace/{project_id}/clean"
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(clean_dir, exist_ok=True)
    
    raw_path = f"{raw_dir}/{page_id}.{ext_lower}"
    
    file_bytes = await file.read()
    
    # ⚡ TỐI ƯU HÓA: Ghi trực tiếp luồng byte ảnh xuống đĩa (Không giải mã/nén lại bằng CPU để tốc độ đạt tối đa)
    def direct_save(data: bytes, path: str):
        with open(path, "wb") as f:
            f.write(data)
                
    await asyncio.to_thread(direct_save, file_bytes, raw_path)
    
    # Ghi nhận vào SQLite
    new_page = models.Page(
        id=page_id,
        project_id=project_id,
        filename=file.filename,
        status="unprocessed",
        raw_url=f"/{raw_path}",
        bubbles_data="[]"
    )
    db.add(new_page)
    await db.commit()
    await db.refresh(new_page)
    
    return {
        "page_id": page_id,
        "filename": file.filename,
        "raw_url": f"/{raw_path}",
        "status": "unprocessed"
    }

import tempfile
import zipfile
import io
import json
from fastapi import Query, BackgroundTasks
from fastapi.responses import FileResponse
from psd_utils import create_manga_psd
from dependencies import get_local_path_from_url, get_current_user_id

@router.get("/{project_id}/export-batch")
async def export_batch(
    project_id: str,
    export_type: str = Query("clean", description="Loại xuất: raw, clean, psd"),
    page_ids: str = Query(None, description="Danh sách ID trang (cách nhau dấu phẩy) từ Frontend gửi lên"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Xuất hàng loạt ảnh thô, ảnh đã xóa nền, hoặc file PSD theo layer"""
    proj_result = await db.execute(select(models.Project).where(models.Project.id == project_id))
    project = proj_result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Dự án không tồn tại hoặc đã bị xóa!")

    stmt = select(models.Page).where(models.Page.project_id == project_id)
    if page_ids:
        id_list = [pid.strip() for pid in page_ids.split(",") if pid.strip()]
        if id_list:
            stmt = stmt.where(models.Page.id.in_(id_list))

    page_result = await db.execute(stmt)
    pages = page_result.scalars().all()

    if not pages:
        raise HTTPException(status_code=404, detail="Không có ảnh nào thỏa mãn để tải!")

    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    temp_zip_path = temp_zip.name
    temp_zip.close()

    try:
        with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for i, page in enumerate(pages):
                safe_name = f"{i:03d}_{page.filename.split('.')[0]}"
                raw_path = get_local_path_from_url(page.raw_url) if page.raw_url else None
                clean_path = get_local_path_from_url(page.clean_url) if page.clean_url else raw_path

                if not raw_path or not os.path.exists(raw_path):
                    continue

                if export_type == "raw":
                    ext = raw_path.split('.')[-1]
                    zipf.write(raw_path, arcname=f"{safe_name}_RAW.{ext}")
                elif export_type == "clean":
                    if not os.path.exists(clean_path):
                        clean_path = raw_path
                    ext = clean_path.split('.')[-1]
                    zipf.write(clean_path, arcname=f"{safe_name}_CLEAN.{ext}")
                elif export_type == "psd":
                    if not os.path.exists(clean_path):
                        clean_path = raw_path
                    psd_temp_path = f"workspace/temp_{page.id}.psd"
                    page_bubbles = []
                    if page.bubbles_data:
                        try:
                            page_bubbles = json.loads(page.bubbles_data)
                        except Exception:
                            pass
                    try:
                        create_manga_psd(raw_path, clean_path, psd_temp_path, page_bubbles)
                        zipf.write(psd_temp_path, arcname=f"{safe_name}.psd")
                    except Exception:
                        pass
                    finally:
                        if os.path.exists(psd_temp_path):
                            os.remove(psd_temp_path)

        def cleanup_temp_zip(path: str):
            if os.path.exists(path):
                os.remove(path)

        background_tasks = BackgroundTasks()
        background_tasks.add_task(cleanup_temp_zip, temp_zip_path)

        return FileResponse(
            path=temp_zip_path,
            filename=f"Project_{project.name}_{export_type.upper()}.zip",
            media_type="application/zip",
            background=background_tasks
        )
    except Exception as e:
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{project_id}/import-manga")
async def import_manga_file(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Khôi phục dự án từ file nén .manga hoặc file .zip"""
    result = await db.execute(select(models.Project).where(models.Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy Dự án!")

    file_bytes = await file.read()
    pages_created = []

    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            namelist = z.namelist()

            if 'bubbles.json' in namelist:
                img_name = next((f for f in namelist if f.startswith("image.") or f == "raw.jpg" or f == "clean.jpg"), None)
                if not img_name:
                    raise Exception("Không tìm thấy ảnh gốc trong file sao lưu .manga!")

                bubbles_json = z.read("bubbles.json").decode('utf-8')
                page_id = str(uuid.uuid4())

                ext = img_name.split('.')[-1]
                os.makedirs(f"workspace/{project_id}/raw", exist_ok=True)
                os.makedirs(f"workspace/{project_id}/clean", exist_ok=True)

                raw_filename = f"workspace/{project_id}/raw/{page_id}.{ext}"
                with open(raw_filename, "wb") as f_out:
                    f_out.write(z.read(img_name))

                clean_url = None
                if 'clean.jpg' in namelist:
                    clean_filename = f"workspace/{project_id}/clean/{page_id}.jpg"
                    with open(clean_filename, "wb") as f_out:
                        f_out.write(z.read('clean.jpg'))
                    clean_url = f"/{clean_filename}"

                db_page = models.Page(
                    id=page_id,
                    project_id=project_id,
                    filename=file.filename.replace(".manga", "").replace(".zip", ""),
                    raw_url=f"/workspace/{project_id}/raw/{page_id}.{ext}",
                    clean_url=clean_url,
                    status="completed" if clean_url else "unprocessed",
                    bubbles_data=bubbles_json
                )
                db.add(db_page)
                pages_created.append(db_page)
            else:
                supported_exts = ('.jpg', '.jpeg', '.png', '.webp')
                img_files = [f for f in namelist if f.lower().endswith(supported_exts) and not f.startswith('__MACOSX') and not os.path.basename(f).startswith('.')]

                if not img_files:
                    raise Exception("Không tìm thấy ảnh hoặc file bubbles.json trong file nén!")

                os.makedirs(f"workspace/{project_id}/raw", exist_ok=True)
                for img_path_in_zip in img_files:
                    img_data = z.read(img_path_in_zip)
                    basename = os.path.basename(img_path_in_zip)
                    page_id = str(uuid.uuid4())
                    ext = basename.split('.')[-1]

                    raw_filename = f"workspace/{project_id}/raw/{page_id}.{ext}"
                    with open(raw_filename, "wb") as f_out:
                        f_out.write(img_data)

                    db_page = models.Page(
                        id=page_id,
                        project_id=project_id,
                        filename=basename,
                        raw_url=f"/workspace/{project_id}/raw/{page_id}.{ext}",
                        status="unprocessed"
                    )
                    db.add(db_page)
                    pages_created.append(db_page)

        await db.commit()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không thể đọc file sao lưu: {str(e)}")

    return {
        "status": "success",
        "pages": [{"id": p.id, "filename": p.filename, "status": p.status} for p in pages_created]
    }
