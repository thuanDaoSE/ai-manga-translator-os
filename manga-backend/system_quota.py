import os
import json
import threading
from datetime import datetime, timezone
from typing import Dict, Any

try:
    from fastapi import HTTPException
except ImportError:
    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

DEFAULT_LIMIT = 300

def get_quota_file_path() -> str:
    candidates = [
        "/app/manga-backend/workspace",
        "/app/workspace",
        "workspace",
        "data"
    ]
    for c in candidates:
        if os.path.exists(c):
            return os.path.join(c, "system_quota.json")
    os.makedirs("workspace", exist_ok=True)
    return os.path.join("workspace", "system_quota.json")

class SystemQuotaManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._file_path = get_quota_file_path()
        self._data: Dict[str, Any] = self._load()

    def _load(self) -> Dict[str, Any]:
        self._file_path = get_quota_file_path()
        if os.path.exists(self._file_path):
            try:
                with open(self._file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "total_limit" in data and "used_pages" in data:
                        return data
            except Exception as e:
                print(f"⚠️ [SYSTEM QUOTA] Error reading quota file: {e}")
        
        # Default initialization
        init_data = {
            "total_limit": DEFAULT_LIMIT,
            "used_pages": 0,
            "last_reset_at": datetime.now(timezone.utc).isoformat()
        }
        self._save(init_data)
        return init_data

    def _save(self, data: Dict[str, Any]):
        try:
            self._file_path = get_quota_file_path()
            temp_path = self._file_path + ".tmp"
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(temp_path, self._file_path)
        except Exception as e:
            print(f"⚠️ [SYSTEM QUOTA] Error saving quota file: {e}")

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            # Re-read file to stay in sync if multiple workers
            if os.path.exists(self._file_path):
                try:
                    with open(self._file_path, "r", encoding="utf-8") as f:
                        self._data = json.load(f)
                except Exception:
                    pass

            total = int(self._data.get("total_limit", DEFAULT_LIMIT))
            used = int(self._data.get("used_pages", 0))
            remaining = max(0, total - used)
            is_exhausted = remaining <= 0

            return {
                "total_limit": total,
                "used_pages": used,
                "remaining_pages": remaining,
                "is_exhausted": is_exhausted,
                "last_reset_at": self._data.get("last_reset_at")
            }

    def check_quota(self, num_pages: int = 1):
        status = self.get_status()
        if status["is_exhausted"] or status["remaining_pages"] < num_pages:
            raise HTTPException(
                status_code=402,
                detail=f"Hệ thống đã đạt giới hạn {status['total_limit']} trang thử nghiệm miễn phí (Còn lại {status['remaining_pages']} trang). Vui lòng liên hệ quản trị viên để mở thêm!"
            )
        return True

    def consume_quota(self, num_pages: int = 1) -> Dict[str, Any]:
        with self._lock:
            total = int(self._data.get("total_limit", DEFAULT_LIMIT))
            used = int(self._data.get("used_pages", 0)) + num_pages
            self._data["used_pages"] = used
            self._data["total_limit"] = total
            self._save(self._data)
            
            remaining = max(0, total - used)
            print(f"📊 [SYSTEM QUOTA] Consumed {num_pages} page(s). Total used: {used}/{total} (Remaining: {remaining})")
            return {
                "total_limit": total,
                "used_pages": used,
                "remaining_pages": remaining,
                "is_exhausted": remaining <= 0,
                "last_reset_at": self._data.get("last_reset_at")
            }

    def reset_quota(self, new_limit: int = DEFAULT_LIMIT) -> Dict[str, Any]:
        with self._lock:
            self._data = {
                "total_limit": new_limit,
                "used_pages": 0,
                "last_reset_at": datetime.now(timezone.utc).isoformat()
            }
            self._save(self._data)
            print(f"🔄 [SYSTEM QUOTA RESET] Quota has been reset to {new_limit} free pages!")
            return {
                "total_limit": new_limit,
                "used_pages": 0,
                "remaining_pages": new_limit,
                "is_exhausted": False,
                "last_reset_at": self._data["last_reset_at"]
            }

global_quota = SystemQuotaManager()
