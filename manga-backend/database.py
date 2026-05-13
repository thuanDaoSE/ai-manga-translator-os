from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker

# Dùng SQLite cho nhẹ, file CSDL sẽ được tạo ra là manga_studio.db
SQLALCHEMY_DATABASE_URL = "sqlite+aiosqlite:///./manga_studio_v2.db"

engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}, # Bắt buộc có cho SQLite
    echo=False # Đổi thành True nếu muốn xem log SQL chạy ngầm
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()

# Dependency để FastAPI nhúng CSDL vào API
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session