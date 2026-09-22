import asyncio
from typing import Dict, Any, Optional

class LocalTaskManager:
    """Quản lý trạng thái Task trong bộ nhớ RAM cho môi trường Single-Tenant (không cần Redis)"""

    def __init__(self):
        self._tasks: Dict[str, Dict[str, Any]] = {}
        self._cancelled_tasks = set()
        self._event_queues: Dict[str, list] = {}

    def create_task(self, task_id: str, page_id: str = ""):
        self._tasks[task_id] = {
            "state": "PROCESSING",
            "progress": 5,
            "message": "Đang khởi tạo tác vụ...",
            "page_id": page_id,
            "result": None
        }

    def update_progress(self, task_id: str, progress: int, message: str, state: str = "PROCESSING", result: Any = None):
        if task_id in self._tasks:
            self._tasks[task_id]["state"] = state
            self._tasks[task_id]["progress"] = progress
            self._tasks[task_id]["message"] = message
            if result is not None:
                self._tasks[task_id]["result"] = result

        # Gửi dữ liệu tới các SSE Subscribers
        if task_id in self._event_queues:
            payload = {
                "state": state,
                "progress": progress,
                "message": message,
                "result": result
            }
            for q in list(self._event_queues[task_id]):
                try:
                    q.put_nowait(payload)
                except Exception:
                    pass

    def set_success(self, task_id: str, result: Any):
        self.update_progress(task_id, 100, "Hoàn tất!", state="SUCCESS", result=result)

    def set_failure(self, task_id: str, message: str):
        self.update_progress(task_id, 0, message, state="FAILURE")

    def cancel_task(self, task_id: str):
        self._cancelled_tasks.add(task_id)
        self.update_progress(task_id, 0, "Tác vụ đã bị hủy.", state="FAILURE")

    def is_cancelled(self, task_id: str) -> bool:
        return task_id in self._cancelled_tasks

    def get_task(self, task_id: str) -> Dict[str, Any]:
        return self._tasks.get(task_id, {
            "state": "FAILURE",
            "progress": 0,
            "message": "Không tìm thấy tác vụ",
            "result": None
        })

    def subscribe(self, task_id: str, queue: asyncio.Queue):
        if task_id not in self._event_queues:
            self._event_queues[task_id] = []
        self._event_queues[task_id].append(queue)

    def unsubscribe(self, task_id: str, queue: asyncio.Queue):
        if task_id in self._event_queues:
            if queue in self._event_queues[task_id]:
                self._event_queues[task_id].remove(queue)
            if not self._event_queues[task_id]:
                del self._event_queues[task_id]

local_task_manager = LocalTaskManager()
