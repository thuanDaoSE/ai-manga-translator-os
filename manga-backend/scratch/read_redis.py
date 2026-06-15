import redis
import json
import os

redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = int(os.getenv("REDIS_PORT", 6379))
redis_client = redis.Redis(host=redis_host, port=redis_port, db=0)

def scan_keys():
    print("=== REDIS CACHE KEYS ===")
    keys = redis_client.keys("ocr_translate_cache:*")
    print(f"Found {len(keys)} keys.")
    for key in keys:
        key_str = key.decode("utf-8")
        val = redis_client.get(key)
        try:
            val_json = json.loads(val.decode("utf-8"))
            data_sample = val_json.get("data", [])[:2]
            clean_url = val_json.get("clean_url", "")
            print(f"Key: {key_str} | Clean URL: {clean_url}")
            for idx, item in enumerate(data_sample):
                print(f"  Item {idx}: jp='{item.get('japanese')}' | vi='{item.get('vietnamese')}' | text='{item.get('text')}'")
        except Exception as e:
            print(f"Key: {key_str} | Error parsing: {e}")
        print("-" * 50)

if __name__ == "__main__":
    scan_keys()
