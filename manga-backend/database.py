import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import create_engine

# Default to SQLite for standalone 1-click app / Vast.ai
default_sqlite_path = "/app/manga-backend/workspace/manga_studio.db" if os.path.exists("/app/manga-backend") else "workspace/manga_studio.db"

raw_db_url = os.getenv(
    "DATABASE_URL",
    f"sqlite+aiosqlite:///{default_sqlite_path}"
)

# Chuẩn hóa SQLite URL: sửa lỗi 3 dấu gạch chéo với đường dẫn tuyệt đối Linux (/app/...)
if raw_db_url.startswith("sqlite+aiosqlite:///app/"):
    raw_db_url = raw_db_url.replace("sqlite+aiosqlite:///app/", "sqlite+aiosqlite:////app/")
elif raw_db_url.startswith("sqlite:///app/"):
    raw_db_url = raw_db_url.replace("sqlite:///app/", "sqlite:////app/")

SQLALCHEMY_DATABASE_URL = raw_db_url
is_sqlite = "sqlite" in SQLALCHEMY_DATABASE_URL

if is_sqlite:
    # Đảm bảo thư mục cha của SQLite DB luôn tồn tại
    try:
        from sqlalchemy.engine.url import make_url
        parsed_url = make_url(SQLALCHEMY_DATABASE_URL)
        if parsed_url.database:
            db_dir = os.path.dirname(os.path.abspath(parsed_url.database))
            if db_dir:
                os.makedirs(db_dir, exist_ok=True)
    except Exception as e:
        print(f"⚠️ [DATABASE] Directory ensure notice: {e}")

    engine = create_async_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False
    )
else:
    engine = create_async_engine(
        SQLALCHEMY_DATABASE_URL,
        echo=False,
        pool_size=20,
        max_overflow=10
    )

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

default_sync_url = os.getenv(
    "SYNC_DATABASE_URL",
    SQLALCHEMY_DATABASE_URL.replace("sqlite+aiosqlite://", "sqlite://").replace("postgresql+asyncpg://", "postgresql+psycopg2://")
)

if is_sqlite:
    sync_engine = create_engine(
        default_sync_url,
        connect_args={"check_same_thread": False},
        echo=False
    )
else:
    sync_engine = create_engine(default_sync_url, echo=False, pool_size=10, max_overflow=5)

SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

Base = declarative_base()

# Dependency để FastAPI nhúng CSDL vào API
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session