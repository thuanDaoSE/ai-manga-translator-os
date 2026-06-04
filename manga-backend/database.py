from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker

# 🚀 URL kết nối tới Docker PostgreSQL (Dùng asyncpg để tối ưu tốc độ bất đồng bộ)
# 🚀 URL kết nối tới Docker PostgreSQL (Đã đổi sang cổng 5433 để né Postgres của máy sếp)
SQLALCHEMY_DATABASE_URL = "postgresql+asyncpg://deepkoma:secretpassword@localhost:5433/manga_studio"

engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL, 
    # Bỏ connect_args={"check_same_thread": False} vì cái đó chỉ dành cho SQLite
    echo=False, 
    pool_size=20, # Tối ưu connection pool cho FastAPI
    max_overflow=10
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()

# Dependency để FastAPI nhúng CSDL vào API
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session