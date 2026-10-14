import os
import cv2
import json
import base64
import asyncio
import httpx
from typing import Dict, Any, List
from database import AsyncSessionLocal
from task_manager import local_task_manager
import db_models as models
from sqlalchemy import select

RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "")
RUNPOD_TRANSLATE_ENDPOINT_ID = os.getenv("RUNPOD_TRANSLATE_ENDPOINT_ID") or os.getenv("RUNPOD_ENDPOINT_ID", "")

async def translate_bubbles_deepseek(extracted_data: list, config: dict) -> list:
    """Sử dụng DeepSeek để dịch nghĩa các khối văn bản sang Tiếng Việt chuẩn ngữ cảnh"""
    if not extracted_data:
        return extracted_data

    ocr_payload = []
    for b in extracted_data:
        text = b.get("japanese") or b.get("text") or ""
        if text.strip():
            ocr_payload.append({"id": b["id"], "text": text.strip()})

    if not ocr_payload:
        return extracted_data

    system_prompt = (
        "Bạn là một dịch giả truyện tranh (Manga/Manhwa/Comic) chuyên nghiệp hàng đầu sang Tiếng Việt.\n"
        "Nhiệm vụ của bạn là TỰ ĐỘNG NHẬN DIỆN ngôn ngữ gốc của từng bong bóng thoại (Tiếng Nhật, Hàn, Anh, Trung...) và dịch chuẩn xác sang Tiếng Việt.\n"
        "QUY TẮC QUAN TRỌNG:\n"
        "1. Tự động nhận diện ngôn ngữ nguồn và phong cách truyện.\n"
        "2. Tự động suy luận ngữ cảnh, giới tính, đại từ nhân xưng phù hợp (anh-em, cậu-tớ, mày-tao, tiền bối-hậu bối...).\n"
        "3. Dịch mượt mà, tự nhiên, văn phong truyện tranh.\n"
        "4. Trả về đúng định dạng JSON được yêu cầu, tuyệt đối không thay đổi ID."
    )
    user_prompt = (
        f"Định dạng JSON yêu cầu: {{\"translations\": [{{\"id\": 1, \"translation\": \"bản dịch tiếng Việt\"}}]}}.\n"
        f"Dữ liệu cần dịch: {json.dumps(ocr_payload, ensure_ascii=False)}"
    )

    try:
        from worker import get_deepseek_client
        client = get_deepseek_client()
        loop = asyncio.get_running_loop()

        def _sync_deepseek():
            return client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={'type': 'json_object'}
            )

        response = await loop.run_in_executor(None, _sync_deepseek)
        res_content = response.choices[0].message.content
        ai_data = json.loads(res_content)
        trans_map = {str(t["id"]): t["translation"] for t in ai_data.get("translations", [])}

        for item in extracted_data:
            item_id = str(item["id"])
            if item_id in trans_map:
                item["vietnamese"] = trans_map[item_id]
                item["text"] = trans_map[item_id]
            else:
                fallback_txt = item.get("japanese") or item.get("text") or ""
                item["vietnamese"] = fallback_txt
                item["text"] = fallback_txt
    except Exception as e:
        print(f"⚠️ [DEEPSEEK TRANSLATE ERROR] {e}")
        for item in extracted_data:
            if not item.get("vietnamese"):
                fallback_txt = item.get("japanese") or item.get("text") or ""
                item["vietnamese"] = fallback_txt
                item["text"] = fallback_txt

    return extracted_data

async def process_page_on_runpod(task_id: str, page_id: str, config: dict, user_id: str = None):
    """
    Xử lý dịch thuật bằng cách đẩy tác vụ GPU nặng lên RunPod Serverless
    (comic_text_detector + LaMa Inpainting + OCR trên GPU RunPod)
    """
    local_task_manager.update_progress(task_id, 10, "Đang chuẩn bị ảnh gửi lên RunPod GPU...")
    api_key = os.getenv("RUNPOD_API_KEY", RUNPOD_API_KEY)
    endpoint_id = os.getenv("RUNPOD_TRANSLATE_ENDPOINT_ID") or os.getenv("RUNPOD_ENDPOINT_ID", RUNPOD_TRANSLATE_ENDPOINT_ID)

    if not api_key or not endpoint_id:
        err = "Thiếu cấu hình RUNPOD_API_KEY hoặc RUNPOD_TRANSLATE_ENDPOINT_ID"
        local_task_manager.set_failure(task_id, err)
        return {"status": "failed", "error": err}

    try:
        # 1. Lấy thông tin trang từ DB
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(models.Page).where(models.Page.id == page_id))
            page = result.scalars().first()
            if not page:
                raise ValueError(f"Không tìm thấy trang truyện ID: {page_id}")
            raw_url = page.raw_url
            project_id = page.project_id

        if not raw_url:
            raise ValueError(f"Trang {page_id} chưa có raw_url")

        # Tìm đường dẫn file ảnh vật lý trên ổ đĩa
        candidate_paths = [
            raw_url.lstrip('/'),
            os.path.join("workspace", raw_url.lstrip('/')),
            os.path.join("/app/manga-backend", raw_url.lstrip('/'))
        ]
        raw_path = None
        for p in candidate_paths:
            if os.path.exists(p):
                raw_path = p
                break

        if not raw_path:
            raise ValueError(f"Không tìm thấy file ảnh gốc tại: {candidate_paths}")

        local_task_manager.update_progress(task_id, 20, "Đang nén ảnh gửi lên RunPod GPU...")

        # 2. Đọc ảnh và mã hóa Base64
        img = cv2.imread(raw_path)
        if img is None:
            with open(raw_path, "rb") as f:
                img_bytes = f.read()
        else:
            success, enc = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            img_bytes = enc.tobytes() if success else open(raw_path, "rb").read()

        img_b64 = base64.b64encode(img_bytes).decode('utf-8')

        # Chuẩn hóa ngôn ngữ cho RunPod OCR (Hỗ trợ: ja, ko, zh, en)
        # Client gửi 'auto' theo mặc định -> map về 'ja' (tiếng Nhật)
        src_lang = str(config.get("sourceLanguage") or config.get("source_language") or "ja").lower()
        if src_lang in ["ko", "korean"]:
            ocr_lang = "ko"
        elif src_lang in ["zh", "chinese", "ch", "cn"]:
            ocr_lang = "zh"
        elif src_lang in ["en", "english"]:
            ocr_lang = "en"
        else:
            ocr_lang = "ja"

        # 3. Chuẩn bị payload gửi lên RunPod
        runpod_payload = {
            "input": {
                "action": "translate",
                "image_base64": img_b64,
                "task_type": "clean_only",
                "language": ocr_lang,
                "genre": config.get("genre", ""),
                "tone": config.get("tone", ""),
                "pronouns": config.get("pronoun") or config.get("pronouns", ""),
                "glossary": config.get("glossary", "")
            }
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        local_task_manager.update_progress(task_id, 30, "Đang khởi động RunPod GPU Serverless...")

        async with httpx.AsyncClient(timeout=300.0) as client:
            submit_url = f"https://api.runpod.ai/v2/{endpoint_id}/run"
            res = await client.post(submit_url, json=runpod_payload, headers=headers)
            if res.status_code != 200:
                raise RuntimeError(f"Gửi task lên RunPod thất bại ({res.status_code}): {res.text}")

            job_data = res.json()
            runpod_job_id = job_data.get("id")
            if not runpod_job_id:
                raise RuntimeError(f"RunPod không trả về mã Job ID: {job_data}")

            status_url = f"https://api.runpod.ai/v2/{endpoint_id}/status/{runpod_job_id}"
            local_task_manager.update_progress(task_id, 40, "RunPod GPU đã nhận job, đang khởi động container...")

            # 4. Polling trạng thái RunPod
            max_attempts = 120  # Tối đa 4 phút
            for attempt in range(max_attempts):
                await asyncio.sleep(2)

                if local_task_manager.is_cancelled(task_id):
                    return {"status": "cancelled"}

                try:
                    status_res = await client.get(status_url, headers=headers)
                    if status_res.status_code != 200:
                        continue
                    status_json = status_res.json()
                except Exception as net_err:
                    print(f"⚠️ [RUNPOD POLL NETWORK WARN] {net_err}")
                    continue

                st = status_json.get("status")

                if st == "IN_QUEUE":
                    local_task_manager.update_progress(task_id, 45, "Đang xếp hàng chờ GPU worker khả dụng...")
                elif st == "IN_PROGRESS":
                    local_task_manager.update_progress(task_id, 65, "RunPod GPU đang nhận diện text & xóa chữ (LaMa)...")
                elif st == "COMPLETED":
                    local_task_manager.update_progress(task_id, 85, "RunPod hoàn tất xử lý ảnh! Đang lưu kết quả...")
                    output = status_json.get("output", {})
                    print(f"🔍 [RUNPOD RESPONSE] Output keys: {list(output.keys()) if isinstance(output, dict) else output}")
                    
                    if isinstance(output, dict) and output.get("status") == "error":
                        raise RuntimeError(f"RunPod AI Engine báo lỗi: {output.get('message')}")

                    clean_b64 = output.get("clean_image_base64") if isinstance(output, dict) else None
                    extracted_data = output.get("data", []) if isinstance(output, dict) else []

                    if not clean_b64:
                        raise RuntimeError(f"RunPod không trả về ảnh đã xóa chữ (clean_image_base64)! Data nhận được: {str(output)[:200]}")

                    # Lưu ảnh sạch vào thư mục workspace
                    clean_dir = f"workspace/{project_id}/clean"
                    os.makedirs(clean_dir, exist_ok=True)
                    clean_file_path = f"{clean_dir}/{page_id}.jpg"
                    clean_bytes = base64.b64decode(clean_b64)
                    with open(clean_file_path, "wb") as f:
                        f.write(clean_bytes)

                    clean_url = f"/{clean_file_path}"

                    # Dịch nghĩa văn bản bằng DeepSeek
                    local_task_manager.update_progress(task_id, 90, "Đang dịch nghĩa bằng DeepSeek AI...")
                    translated_bubbles = await translate_bubbles_deepseek(extracted_data, config)

                    # Lưu vào CSDL
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(select(models.Page).where(models.Page.id == page_id))
                        page = result.scalars().first()
                        if page:
                            page.clean_url = clean_url
                            page.bubbles_data = json.dumps(translated_bubbles, ensure_ascii=False)
                            page.status = "completed"
                            await db.commit()

                    if user_id:
                        try:
                            from main import deduct_balance
                            async with AsyncSessionLocal() as deduct_db:
                                await deduct_balance(deduct_db, user_id, 1.0, f"Dịch trang truyện {page_id}")
                                await deduct_db.commit()
                        except Exception as de:
                            print(f"⚠️ [DEDUCT NOTICE] {de}")

                    result_payload = {
                        "clean_url": clean_url,
                        "data": translated_bubbles
                    }
                    local_task_manager.set_success(task_id, result_payload)
                    print(f"✅ [RUNPOD SUCCESS] Trang {page_id} đã dịch xong qua RunPod GPU!")
                    return result_payload

                elif st in ["FAILED", "CANCELLED", "TIMED_OUT"]:
                    err_detail = status_json.get("error") or "RunPod Serverless báo lỗi."
                    raise RuntimeError(f"RunPod GPU lỗi: {err_detail}")

            raise TimeoutError("Quá thời gian chờ RunPod Serverless xử lý (Timeout 4 phút).")

    except Exception as e:
        print(f"❌ [RUNPOD WORKER ERROR] {e}")
        import traceback
        traceback.print_exc()

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(models.Page).where(models.Page.id == page_id))
                page = result.scalars().first()
                if page:
                    page.status = "failed"
                    await db.commit()
        except Exception:
            pass

        local_task_manager.set_failure(task_id, f"Lỗi: {str(e)}")
        return {"status": "failed", "error": str(e)}
