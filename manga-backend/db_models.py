from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, BigInteger, UniqueConstraint, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from database import Base

# BẢNG 1: QUẢN LÝ VÍ TIỀN VÀ GÓI SUBSCRIPTION CỦA USER
class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, index=True) # ID từ Supabase/Firebase
    email = Column(String, unique=True, index=True)
    
    # Chiến lược Pay-as-you-go bằng thời gian chạy GPU (Time-Based Billing)
    balance_seconds = Column(Float, default=900.0)  # Tặng 900 giây (15 phút) dùng thử khi tạo nick mới
    
    # Chiến lược Subscription (Thuê bao tháng)
    is_pro = Column(Boolean, default=False)
    pro_until = Column(DateTime(timezone=True), nullable=True)

# BẢNG 2: LỊCH SỬ GIAO DỊCH (CHỐNG HACK & GHI NHẬN THANH TOÁN PAYOS)
class Transaction(Base):
    __tablename__ = "payos_transactions" 
    
    order_code = Column(BigInteger, primary_key=True) 
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    
    package_name = Column(String) 
    amount = Column(Integer) 
    seconds_added = Column(Float, default=0.0) 
    
    status = Column(String, default="PENDING") 
    checkout_url = Column(String, nullable=True) 
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# ==========================================
# CÁC BẢNG CŨ (Sếp giữ nguyên + Thêm Index & CASCADE)
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
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    filename = Column(String) 
    status = Column(String, default="pending") 
    raw_url = Column(String) 
    clean_url = Column(String, nullable=True) 
    bubbles_data = Column(Text, default="[]") 
    project = relationship("Project", back_populates="pages")

# ==========================================
# 🚀 CÁC BẢNG MỚI: KIẾN TRÚC TRANSLATION MEMORY & GLOSSARY (Thêm Index & Composite Unique)
# ==========================================

class TranslationMemory(Base):
    """Bảng lưu trữ bộ nhớ dịch thuật (Dùng cho Exact Match Cache)"""
    __tablename__ = "translation_memory"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    
    hash_key = Column(String, index=True) # Mã băm SHA-256 của câu tiếng Nhật
    japanese_text = Column(Text, nullable=False)
    vietnamese_text = Column(Text, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('project_id', 'hash_key', name='uq_project_hash_key'),
    )

class Character(Base):
    """Bảng quản lý nhân vật để phân tích xưng hô"""
    __tablename__ = "characters"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    
    original_name = Column(String, nullable=False) # Tên tiếng Nhật (vd: ナルト)
    translated_name = Column(String, nullable=False) # Tên tiếng Việt (vd: Naruto)
    gender = Column(String, nullable=True) # Nam/Nữ/Khác
    age_group = Column(String, nullable=True) # Trẻ em/Thanh niên/Người lớn/Người già
    
    project = relationship("Project", back_populates="characters")

class Terminology(Base):
    """Bảng quản lý thuật ngữ, chiêu thức, địa danh"""
    __tablename__ = "terminology"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    
    source_text = Column(String, nullable=False) # Ví dụ: 螺旋丸
    target_text = Column(String, nullable=False) # Ví dụ: Rasengan
    description = Column(String, nullable=True) # Ghi chú cho editor
    
    project = relationship("Project", back_populates="terminology")

class RelationalMatrix(Base):
    """🚀 MA TRẬN XƯNG HÔ (Trái tim của hệ thống dịch)"""
    __tablename__ = "relational_matrix"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    
    speaker_id = Column(String, ForeignKey("characters.id", ondelete="CASCADE"), index=True)
    listener_id = Column(String, ForeignKey("characters.id", ondelete="CASCADE"), index=True)
    
    self_reference = Column(String, nullable=False) # Tự xưng (vd: Tớ, Anh, Cháu)
    target_reference = Column(String, nullable=False) # Gọi đối phương (vd: Cậu, Em, Bác)
    
    context_rule = Column(String, nullable=True) # Điều kiện (vd: Khi nói chuyện bình thường)

class TranslationCorrection(Base):
    """Bảng lưu trữ dữ liệu hiệu chỉnh bản dịch của người dùng (Tập dữ liệu độc quyền để Fine-tune Model)"""
    __tablename__ = "translation_corrections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    page_id = Column(String, ForeignKey("pages.id", ondelete="CASCADE"), index=True)
    
    japanese_raw = Column(Text, nullable=False)
    ai_translation = Column(Text, nullable=False)
    user_corrected = Column(Text, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserTransaction(Base):
    __tablename__ = "transactions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount = Column(Float, nullable=False) # Số giây biến động (+ nếu nạp, - nếu trừ)
    type = Column(String, nullable=False) # "TOPUP" hoặc "DEDUCT"
    description = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    order_code = Column(BigInteger, nullable=True, index=True) # order_code từ PayOS nếu là nạp


class TimeLog(Base):
    __tablename__ = "time_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount = Column(Float, nullable=False) # Số giây thay đổi (âm hoặc dương)
    action_type = Column(String, nullable=False) # TRANSLATE_LAMA, VÀ_NỀN_RUNPOD, REGISTER_BONUS, REFUND, DEPOSIT
    description = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())