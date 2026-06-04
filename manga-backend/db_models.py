from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from database import Base

# ==========================================
# CÁC BẢNG CŨ (Sếp giữ nguyên)
# ==========================================
class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, index=True) 
    user_id = Column(String, index=True)
    name = Column(String, default="Dự án mới")
    glossary = Column(Text, default="") # Có thể bỏ sau khi dùng hệ thống mới
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    pages = relationship("Page", back_populates="project", cascade="all, delete-orphan")
    
    # Quan hệ mới
    characters = relationship("Character", back_populates="project", cascade="all, delete-orphan")
    terminology = relationship("Terminology", back_populates="project", cascade="all, delete-orphan")

class Page(Base):
    __tablename__ = "pages"
    id = Column(String, primary_key=True, index=True) 
    project_id = Column(String, ForeignKey("projects.id"))
    filename = Column(String) 
    status = Column(String, default="pending") 
    raw_url = Column(String) 
    clean_url = Column(String, nullable=True) 
    bubbles_data = Column(Text, default="[]") 
    project = relationship("Project", back_populates="pages")

# ==========================================
# 🚀 CÁC BẢNG MỚI: KIẾN TRÚC TRANSLATION MEMORY & GLOSSARY
# ==========================================

class TranslationMemory(Base):
    """Bảng lưu trữ bộ nhớ dịch thuật (Dùng cho Exact Match Cache)"""
    __tablename__ = "translation_memory"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), index=True)
    
    hash_key = Column(String, index=True, unique=True) # Mã băm SHA-256 của câu tiếng Nhật
    japanese_text = Column(Text, nullable=False)
    vietnamese_text = Column(Text, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Character(Base):
    """Bảng quản lý nhân vật để phân tích xưng hô"""
    __tablename__ = "characters"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    
    original_name = Column(String, nullable=False) # Tên tiếng Nhật (vd: ナルト)
    translated_name = Column(String, nullable=False) # Tên tiếng Việt (vd: Naruto)
    gender = Column(String, nullable=True) # Nam/Nữ/Khác
    age_group = Column(String, nullable=True) # Trẻ em/Thanh niên/Người lớn/Người già
    
    project = relationship("Project", back_populates="characters")

class Terminology(Base):
    """Bảng quản lý thuật ngữ, chiêu thức, địa danh"""
    __tablename__ = "terminology"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    
    source_text = Column(String, nullable=False) # Ví dụ: 螺旋丸
    target_text = Column(String, nullable=False) # Ví dụ: Rasengan
    description = Column(String, nullable=True) # Ghi chú cho editor
    
    project = relationship("Project", back_populates="terminology")

class RelationalMatrix(Base):
    """🚀 MA TRẬN XƯNG HÔ (Trái tim của hệ thống dịch)"""
    __tablename__ = "relational_matrix"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    
    speaker_id = Column(String, ForeignKey("characters.id"))
    listener_id = Column(String, ForeignKey("characters.id"))
    
    self_reference = Column(String, nullable=False) # Tự xưng (vd: Tớ, Anh, Cháu)
    target_reference = Column(String, nullable=False) # Gọi đối phương (vd: Cậu, Em, Bác)
    
    context_rule = Column(String, nullable=True) # Điều kiện (vd: Khi nói chuyện bình thường)