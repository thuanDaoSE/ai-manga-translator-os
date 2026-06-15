import sys
import os
import json
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
            
        print(f"Page ID: {page.id}")
        print(f"Filename: {page.filename}")
        print(f"Status: {page.status}")
        
        proj = db.query(models.Project).filter(models.Project.id == page.project_id).first()
        if proj:
            print(f"Project Name: {proj.name}")
            print(f"Project Glossary: '{proj.glossary}'")
            
        bubbles = json.loads(page.bubbles_data) if page.bubbles_data else []
        print(f"Total Bubbles: {len(bubbles)}")
        for i, b in enumerate(bubbles):
            print(f"Bubble {i:02d}: id={b.get('id')} | jp='{b.get('japanese')}' | vi='{b.get('vietnamese')}' | text='{b.get('text')}'")

if __name__ == "__main__":
    inspect()
