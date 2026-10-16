import os
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["system"])

def get_hardware_telemetry() -> dict:
    """Lấy thông số phần cứng GPU / RAM thực tế"""
    telemetry = {
        "cuda_available": False,
        "device_name": "CPU",
        "vram_total_gb": 0.0,
        "vram_allocated_gb": 0.0,
        "engine": "Python Native (comic-text-detector + LaMa ONNX + Hayai-OCR v2)"
    }
    try:
        import torch
        if torch.cuda.is_available():
            dev_idx = 0
            dev_name = torch.cuda.get_device_name(dev_idx)
            total_vram = torch.cuda.get_device_properties(dev_idx).total_memory / (1024 ** 3)
            allocated_vram = torch.cuda.memory_allocated(dev_idx) / (1024 ** 3)
            telemetry.update({
                "cuda_available": True,
                "device_name": dev_name,
                "vram_total_gb": round(total_vram, 2),
                "vram_allocated_gb": round(allocated_vram, 2)
            })
    except Exception as e:
        telemetry["error"] = str(e)
        
    return telemetry

@router.get("/health")
async def health_check():
    """Kiểm tra tình trạng hoạt động của Backend"""
    hw = get_hardware_telemetry()
    return {
        "status": "healthy",
        "mode": "single-tenant-native-gpu",
        "database": "sqlite",
        "hardware": hw
    }

@router.get("/v1/server-status")
async def get_server_status():
    """Trạng thái máy chủ AI GPU (Luôn HOT trên môi trường GPU chuyên dụng UFO-Space)"""
    return {
        "status": "HOT",
        "message": "AI GPU Cluster is hot and ready"
    }

@router.get("/gpu/status")
async def get_gpu_status():
    """Kiểm tra trạng thái GPU thực tế trên máy ảo GPU UFO-Space"""
    hw = get_hardware_telemetry()
    is_ready = hw.get("cuda_available", False)
    return {
        "status": "online" if is_ready else "cpu_mode",
        "provider": "ufo-space-native-gpu",
        "details": hw
    }

@router.get("/users/me")
async def get_current_user_profile():
    """Thông tin người dùng cục bộ (Single-Tenant Local Mode)"""
    return {
        "id": "local_user",
        "email": "local@ufo-space.gpu",
        "is_pro": True,
        "credits": 999999,
        "balance_seconds": 999999,
        "lens_free_remaining": 999999
    }

@router.post("/users/me/deduct")
async def dummy_deduct():
    """Bypass trừ xu / trừ giây trên môi trường local GPU"""
    return {
        "status": "success",
        "balance_seconds": 999999
    }

from pydantic import BaseModel
from typing import Optional
from system_quota import global_quota

class QuotaResetPayload(BaseModel):
    new_limit: Optional[int] = 300

@router.get("/system/quota")
async def get_system_quota_api():
    """Lấy thông tin hạn mức trang miễn phí toàn hệ thống"""
    return global_quota.get_status()

@router.post("/system/quota/reset")
async def reset_system_quota_api(payload: Optional[QuotaResetPayload] = None):
    """Đặt lại hạn mức 300 trang miễn phí"""
    limit = (payload.new_limit if payload and payload.new_limit else 300)
    res = global_quota.reset_quota(new_limit=limit)
    return {"status": "success", "message": f"Đã đặt lại thành công {limit} trang miễn phí!", "quota": res}
