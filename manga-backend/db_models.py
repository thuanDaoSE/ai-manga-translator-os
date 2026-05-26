from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True) 
    user_id = Column(String, index=True) # 🚀 CHIA PHÒNG CHO USER
    name = Column(String, default="Dự án mới")
    glossary = Column(Text, default="") 
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    pages = relationship("Page", back_populates="project", cascade="all, delete-orphan")

class Page(Base):
    __tablename__ = "pages"

    id = Column(String, primary_key=True, index=True) 
    project_id = Column(String, ForeignKey("projects.id"))
    filename = Column(String) 
    status = Column(String, default="pending") 
    
    raw_url = Column(String) 
    clean_url = Column(String, nullable=True) 
    
    bubbles_data = Column(Text, default="[]") # 🚀 CHỈ LƯU JSON VÀO ĐÂY

    project = relationship("Project", back_populates="pages")

