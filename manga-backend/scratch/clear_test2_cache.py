import redis
import json
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db_models as models

# 1. Connect to Redis
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = int(os.getenv("REDIS_PORT", 6379))
redis_client = redis.Redis(host=redis_host, port=redis_port, db=0)

# 2. Connect to PostgreSQL
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://deepkoma:secretpassword@localhost:5433/manga_studio"
)
if "asyncpg" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("asyncpg", "psycopg2")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def clear_cache():
    img_hash = "1d7f79d9b19012b2"
    page_id = "7f1a7412-75a0-4138-adae-310049d3ac58"
    
    # Keys to delete
    keys_to_delete = [
        f"ocr_translate_cache:{img_hash}:Tiếng Việt",
        f"ocr_translate_cache:{img_hash}"
    ]
    
    print("=== CLEARING REDIS CACHE ===")
    for key in keys_to_delete:
        if redis_client.exists(key):
            redis_client.delete(key)
            print(f"Deleted Redis Key: {key}")
        else:
            print(f"Redis Key not found (already deleted or doesn't exist): {key}")
            
    # Scan for other keys matching this hash pattern to be thorough
    pattern = f"ocr_translate_cache:{img_hash}:*"
    for key in redis_client.scan_iter(match=pattern):
        redis_client.delete(key)
        print(f"Deleted pattern key: {key.decode('utf-8')}")

    print("\n=== RESETTING POSTGRES PAGE STATUS ===")
    with SessionLocal() as db:
        page = db.query(models.Page).filter(models.Page.id == page_id).first()
        if page:
            page.status = "unprocessed"
            page.bubbles_data = "[]"
            page.clean_url = None
            db.commit()
            print(f"Successfully reset Page ID {page_id} to status='unprocessed' and cleared bubbles_data.")
        else:
            print(f"Page ID {page_id} not found in database.")

if __name__ == "__main__":
    clear_cache()
