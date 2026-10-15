import os
import io
import time
import json
import base64
import requests
import cv2
import numpy as np

API_KEY = os.getenv("RUNPOD_API_KEY", "your_runpod_api_key_here")
ENDPOINT_ID = os.getenv("RUNPOD_TRANSLATE_ENDPOINT_ID", "9aifh69gzg4gh5")
RUNPOD_URL = f"https://api.runpod.ai/v2/{ENDPOINT_ID}/run"
STATUS_URL_TEMPLATE = f"https://api.runpod.ai/v2/{ENDPOINT_ID}/status/{{job_id}}"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def test_runpod_webtoons():
    webtoon_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'testInputImage', 'webtoon'))
    print(f"📂 Webtoon Test Directory: {webtoon_dir}")
    
    files = [f for f in os.listdir(webtoon_dir) if f.endswith(('.jpg', '.png', '.webp'))]
    print(f"Found {len(files)} webtoon files to test on RunPod GPU Serverless.")

    results = []

    # Test first 3 webtoons to check live GPU Serverless OCR capability
    for filename in sorted(files)[:3]:
        filepath = os.path.join(webtoon_dir, filename)
        img = cv2.imread(filepath)
        if img is None:
            continue
            
        h, w = img.shape[:2]
        print(f"\n--- Submitting Webtoon: {filename} ({w}x{h} px, Ratio: {h/w:.2f}) ---")
        
        # Read image base64
        with open(filepath, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode("utf-8")

        payload = {
            "input": {
                "action": "translate",
                "task_type": "clean_only",
                "image_base64": img_b64,
                "language": "ja"
            }
        }

        t_start = time.time()
        try:
            res = requests.post(RUNPOD_URL, json=payload, headers=headers, timeout=30)
            if res.status_code != 200:
                print(f"❌ Failed to submit job: {res.status_code} {res.text}")
                continue

            job_id = res.json().get("id")
            print(f"Job queued successfully. ID: {job_id}. Polling status...")

            status_url = STATUS_URL_TEMPLATE.format(job_id=job_id)
            st = "IN_QUEUE"
            job_data = {}
            poll_count = 0

            while st in ["IN_QUEUE", "IN_PROGRESS"]:
                time.sleep(3)
                poll_count += 1
                res_st = requests.get(status_url, headers=headers, timeout=15)
                if res_st.status_code == 200:
                    job_data = res_st.json()
                    st = job_data.get("status", "IN_QUEUE")
                    print(f"  [{poll_count}] Job status: {st}")

            duration = time.time() - t_start

            if st == "COMPLETED":
                output = job_data.get("output", {})
                if isinstance(output, dict) and output.get("status") == "success":
                    boxes_data = output.get("data", [])
                    texts = [b.get("japanese", "").strip() for b in boxes_data if b.get("japanese", "").strip()]
                    print(f"✅ SUCCESS! Processed in {duration:.2f}s | Detected {len(boxes_data)} bubbles | Recognized {len(texts)} texts:")
                    for idx, t in enumerate(texts[:10], 1):
                        print(f"   {idx}. {t}")
                    results.append({
                        "filename": filename,
                        "status": "Success",
                        "duration": round(duration, 2),
                        "num_boxes": len(boxes_data),
                        "texts": texts
                    })
                else:
                    err = output.get("message", "") if isinstance(output, dict) else str(output)
                    print(f"❌ Handler Error: {err}")
            else:
                print(f"❌ Job Failed with status: {st}")

        except Exception as e:
            print(f"❌ Exception: {e}")

    with open('webtoon_runpod_results.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

if __name__ == '__main__':
    test_runpod_webtoons()
