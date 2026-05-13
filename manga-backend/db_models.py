from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True) # Sẽ dùng UUID
    user_id = Column(String, index=True) # 🚀 BẠN ĐANG BỊ THIẾU DÒNG NÀY Ở ĐÂY
    name = Column(String, default="Dự án mới")
    glossary = Column(Text, default="") 
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    pages = relationship("Page", back_populates="project", cascade="all, delete-orphan")

# ... các class khác giữ nguyên ...

class Page(Base):
    __tablename__ = "pages"

    id = Column(String, primary_key=True, index=True) # UUID
    project_id = Column(String, ForeignKey("projects.id"))
    filename = Column(String) # Tên gốc của ảnh
    status = Column(String, default="pending") # pending, processing, completed
    
    # Đường dẫn file ảo để Frontend lấy ảnh
    raw_url = Column(String) 
    clean_url = Column(String, nullable=True) 

    project = relationship("Project", back_populates="pages")
    bubbles = relationship("TextBubble", back_populates="page", cascade="all, delete-orphan")

class TextBubble(Base):
    __tablename__ = "text_bubbles"

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(String, ForeignKey("pages.id"))
    
    # Tọa độ bounding box
    box_x1 = Column(Float)
    box_y1 = Column(Float)
    box_x2 = Column(Float)
    box_y2 = Column(Float)
    
    japanese_text = Column(Text, default="")
    vietnamese_text = Column(Text, default="")

    page = relationship("Page", back_populates="bubbles")