import os
import base64
import time
import requests
import json

def test_runpod_endpoints():
    api_key = os.getenv('RUNPOD_API_KEY', 'your_runpod_api_key_here')
    endpoint_id = os.getenv('RUNPOD_TRANSLATE_ENDPOINT_ID', '9aifh69gzg4gh5')
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }

    base_dir = r"d:\Workspaces\VSCode-workspace\AI_Manga_Translator\testInputImage\manga"
    folders = {
        'engInput': 'en',
        'japanInput': 'ja'
    }

    results = []

    for folder_name, lang in folders.items():
        folder_path = os.path.join(base_dir, folder_name)
        if not os.path.exists(folder_path):
            print(f"Directory {folder_path} not found. Skipping...")
            continue

        files = [f for f in os.listdir(folder_path) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        print(f"Found {len(files)} files in {folder_name} (Language: {lang})")

        for filename in files:
            file_path = os.path.join(folder_path, filename)
            file_size_kb = os.path.getsize(file_path) / 1024.0
            print(f"\n--- Processing {filename} ({file_size_kb:.1f} KB) ---")

            try:
                # Read file and encode to base64
                with open(file_path, 'rb') as f:
                    img_data = f.read()
                    img_b64 = base64.b64encode(img_data).decode('utf-8')

                payload = {
                    'input': {
                        'action': 'translate',
                        'task_type': 'clean_only',
                        'image_base64': img_b64,
                        'language': lang
                    }
                }

                # Submit job
                t_start = time.time()
                run_url = f"https://api.runpod.ai/v2/{endpoint_id}/run"
                print(f"Submitting job for {filename} to RunPod...")
                res = requests.post(run_url, json=payload, headers=headers, timeout=30)
                
                if res.status_code != 200:
                    print(f"❌ Failed to submit job: {res.status_code} - {res.text}")
                    results.append({
                        'filename': filename,
                        'folder': folder_name,
                        'lang': lang,
                        'status': f"Submission Error ({res.status_code})",
                        'duration': 0,
                        'num_boxes': 0,
                        'texts': []
                    })
                    continue

                job_id = res.json().get('id')
                if not job_id:
                    print(f"❌ No job ID returned: {res.json()}")
                    results.append({
                        'filename': filename,
                        'folder': folder_name,
                        'lang': lang,
                        'status': "No Job ID",
                        'duration': 0,
                        'num_boxes': 0,
                        'texts': []
                    })
                    continue

                print(f"Job queued successfully. ID: {job_id}. Polling status...")
                status_url = f"https://api.runpod.ai/v2/{endpoint_id}/status/{job_id}"
                
                st = 'IN_QUEUE'
                job_data = {}
                max_polls = 120  # Max 6 minutes
                poll_count = 0

                while st in ['IN_QUEUE', 'IN_PROGRESS'] and poll_count < max_polls:
                    time.sleep(3)
                    poll_count += 1
                    try:
                        res_st = requests.get(status_url, headers=headers, timeout=15)
                        if res_st.status_code == 200:
                            job_data = res_st.json()
                            st = job_data.get('status', 'IN_QUEUE')
                            print(f"[{poll_count}] Job status: {st}")
                        else:
                            print(f"Warning: status check got code {res_st.status_code}")
                    except Exception as e:
                        print(f"Connection warning during poll: {e}")

                duration = time.time() - t_start

                if st == 'COMPLETED':
                    output = job_data.get('output', {})
                    if isinstance(output, dict) and output.get('status') == 'success':
                        boxes_data = output.get('data', [])
                        # Extract the recognized texts
                        texts = [b.get('japanese', '') for b in boxes_data]
                        print(f"✅ Success! Detected {len(boxes_data)} text bubbles.")
                        results.append({
                            'filename': filename,
                            'folder': folder_name,
                            'lang': lang,
                            'status': 'Success',
                            'duration': round(duration, 2),
                            'num_boxes': len(boxes_data),
                            'texts': texts
                        })
                    else:
                        error_msg = output.get('message', 'Unknown processing error') if isinstance(output, dict) else str(output)
                        print(f"❌ RunPod handler reported error: {error_msg}")
                        results.append({
                            'filename': filename,
                            'folder': folder_name,
                            'lang': lang,
                            'status': f"Handler Error: {error_msg[:100]}",
                            'duration': round(duration, 2),
                            'num_boxes': 0,
                            'texts': []
                        })
                else:
                    print(f"❌ Job ended with status: {st}")
                    results.append({
                        'filename': filename,
                        'folder': folder_name,
                        'lang': lang,
                        'status': f"Failed ({st})",
                        'duration': round(duration, 2),
                        'num_boxes': 0,
                        'texts': []
                    })

            except Exception as e:
                print(f"❌ Exception occurred: {e}")
                results.append({
                    'filename': filename,
                    'folder': folder_name,
                    'lang': lang,
                    'status': f"Exception: {str(e)[:100]}",
                    'duration': 0,
                    'num_boxes': 0,
                    'texts': []
                })

    # Save results to a json file for record keeping
    with open('batch_test_results.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print("\n=== Batch Test Completed ===")
    print(f"Tested {len(results)} files.")

if __name__ == '__main__':
    test_runpod_endpoints()
