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
    """Lấy chi tiết dự án"""
    result = await db.execute(
        select(models.Project).where(models.Project.id == project_id)
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
    return project

@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Xóa dự án và các trang liên quan"""
    result = await db.execute(
        select(models.Project).where(models.Project.id == project_id)
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
        
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
    )
    pages = result.scalars().all()
    return {"pages": pages}

@router.post("/{project_id}/upload")
async def upload_page(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Tải lên ảnh trang truyện vào dự án"""
    result = await db.execute(
        select(models.Project).where(models.Project.id == project_id)
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án")

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
