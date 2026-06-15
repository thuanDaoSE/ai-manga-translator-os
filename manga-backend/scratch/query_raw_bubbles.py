import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db_models as models

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://deepkoma:secretpassword@localhost:5433/manga_studio"
)
if "asyncpg" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("asyncpg", "psycopg2")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def inspect():
    with SessionLocal() as db:
        page_id = "7f1a7412-75a0-4138-adae-310049d3ac58"
        page = db.query(models.Page).filter(models.Page.id == page_id).first()
        if not page:
            print("Page not found.")
            return
        print(page.bubbles_data[:2000])

if __name__ == "__main__":
    inspect()
