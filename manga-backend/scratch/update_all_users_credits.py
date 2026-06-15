import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import db_models as models

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://deepkoma:secretpassword@localhost:5433/manga_studio"
)
if "asyncpg" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("asyncpg", "psycopg2")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def update():
    with SessionLocal() as db:
        users = db.query(models.User).all()
        print(f"Found {len(users)} users in database. Setting all to 10000 credits...")
        for user in users:
            print(f"User ID: {user.id} | Email: {user.email} | Old Credits: {user.credits} -> New Credits: 10000")
            user.credits = 10000
        db.commit()
        print("Database update committed successfully!")

if __name__ == "__main__":
    update()
