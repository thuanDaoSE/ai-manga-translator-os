import os
import uuid
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
import db_models as models
from task_manager import local_task_manager
from worker import process_manga_page
from runpod_service import process_page_on_runpod

router = APIRouter(prefix="/api", tags=["translation"])

@router.post("/pages/{page_id}/translate")
async def translate_page(
    page_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Kích hoạt dịch trang truyện (Ưu tiên RunPod GPU Serverless nếu có config, fallback local)"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang truyện")
        
    # Kiểm tra số dư năng lượng (Tối thiểu 1 điểm năng lượng / trang)
    from main import get_current_user_id, check_balance_before_task
    user_id = await get_current_user_id(request)
    await check_balance_before_task(db, user_id, min_balance=1.0)
    
    config = await request.json()
    task_id = str(uuid.uuid4())
    
    # Đăng ký task vào in-memory task manager
    local_task_manager.create_task(task_id, page_id=page_id)
    
    page.status = "processing"
    await db.commit()
    
    runpod_key = os.getenv("RUNPOD_API_KEY")
    runpod_endpoint = os.getenv("RUNPOD_TRANSLATE_ENDPOINT_ID") or os.getenv("RUNPOD_ENDPOINT_ID")

    if runpod_key and runpod_endpoint:
        # Bắn trực tiếp lên RunPod Serverless GPU
        asyncio.create_task(process_page_on_runpod(task_id, page_id, config, user_id=user_id))
    else:
        # Chạy tác vụ nền trên ThreadPool không làm nghẽn Event Loop
        asyncio.create_task(asyncio.to_thread(process_manga_page, task_id, page_id, config, user_id=user_id))
    
    return {"task_id": task_id}

@router.get("/task/{task_id}")
async def get_task_status(task_id: str):
    """Truy vấn trạng thái task (Polling endpoint cho Frontend)"""
    task_data = local_task_manager.get_task(task_id)
    return task_data

@router.get("/stream/{task_id}")
async def stream_task_progress(task_id: str):
    """Server-Sent Events (SSE) để Frontend cập nhật tiến độ mượt mà"""
    queue = asyncio.Queue()
    local_task_manager.subscribe(task_id, queue)
    
    async def event_generator():
        try:
            # Gửi trạng thái hiện tại trước
            current = local_task_manager.get_task(task_id)
            yield f"data: {json.dumps(current, ensure_ascii=False)}\n\n"
            
            while True:
                data = await queue.get()
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                if data.get("state") in ["SUCCESS", "FAILURE"]:
                    break
        except asyncio.CancelledError:
            pass
        finally:
            local_task_manager.unsubscribe(task_id, queue)
            
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Hủy task đang xử lý"""
    local_task_manager.cancel_task(task_id)
    return {"status": "cancelled", "task_id": task_id}

@router.post("/pages/{page_id}/retry-text-translation")
async def retry_text_translation(
    page_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Dịch lại toàn bộ văn bản của trang bằng DeepSeek AI"""
    result = await db.execute(select(models.Page).where(models.Page.id == page_id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="Không tìm thấy trang")
        
    try:
        bubbles = json.loads(page.bubbles_data or "[]")
    except Exception:
        bubbles = []
        
    if not bubbles:
        return {"status": "success", "message": "Không có bong bóng thoại nào để dịch"}

    # Gọi DeepSeek dịch lại
    from worker import deepseek_client
    ocr_payload = [{"id": b["id"], "text": b.get("japanese", "")} for b in bubbles if b.get("japanese")]
    
    if ocr_payload:
        system_prompt = (
            "Bạn là một dịch giả truyện tranh (Manga/Manhwa/Comic) chuyên nghiệp hàng đầu sang Tiếng Việt.\n"
            "Nhiệm vụ của bạn là TỰ ĐỘNG NHẬN DIỆN ngôn ngữ gốc của từng bong bóng thoại (Tiếng Nhật, Hàn, Anh, Trung...) và dịch chuẩn xác sang Tiếng Việt.\n"
            "QUY TẮC QUAN TRỌNG:\n"
            "1. Tự động nhận diện ngôn ngữ nguồn và phong cách truyện (Manga Nhật, Manhwa Hàn, hay Comic phương Tây).\n"
            "2. Tự động suy luận ngữ cảnh, giới tính, tuổi tác và mối quan hệ giữa các nhân vật để sử dụng đại từ nhân xưng tiếng Việt tự nhiên nhất (anh-em, cậu-tớ, mày-tao, tiền bối-hậu bối, sư phụ-đồ đệ, chú-cháu...).\n"
            "3. Dịch sát nghĩa, chuẩn sắc thái biểu cảm (vui, buồn, tức giận, hài hước, âm thanh SFX).\n"
            "4. Trả về đúng định dạng JSON được yêu cầu, tuyệt đối không thay đổi ID của bong bóng thoại."
        )
        user_prompt = (
            f"Định dạng JSON yêu cầu: {{\"translations\": [{{\"id\": 1, \"translation\": \"bản dịch\"}}]}}.\n"
            f"Dữ liệu cần dịch: {json.dumps(ocr_payload, ensure_ascii=False)}"
        )
        try:
            response = deepseek_client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={'type': 'json_object'}
            )
            res_content = response.choices[0].message.content
            ai_data = json.loads(res_content)
            trans_map = {str(t["id"]): t["translation"] for t in ai_data.get("translations", [])}
            for b in bubbles:
                b_id = str(b["id"])
                if b_id in trans_map:
                    b["vietnamese"] = trans_map[b_id]
                    b["text"] = trans_map[b_id]
                    
            page.bubbles_data = json.dumps(bubbles, ensure_ascii=False)
            await db.commit()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lỗi dịch lại: {str(e)}")

    return {"status": "success", "bubbles": bubbles}
