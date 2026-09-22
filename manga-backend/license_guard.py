#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UFO-Space Cloud DRM & Intellectual Property License Guardian.
=============================================================
Đảm bảo ứng dụng AI Manga Translator (DeepKoma) CHỈ ĐƯỢC PHÉP CHẠY
trên hạ tầng máy chủ GPU hợp lệ và được ủy quyền của UFO-Space Cloud.

Chống trích xuất Docker image, sao chép mã nguồn và tự ý chạy offline 
trên máy tính cá nhân hoặc hạ tầng không trả phí qua UFO-Space.
"""

import os
import sys
import json
import time
import socket
import logging
import threading
import urllib.request
import urllib.error

logger = logging.getLogger("UFOLicenseGuard")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [UFO-DRM] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# Cấu hình máy chủ xác thực bản quyền chính thức
DEFAULT_LICENSE_SERVER = "https://ufospace.cloud"
HEARTBEAT_INTERVAL_SECONDS = 900  # 15 phút tái kiểm tra 1 lần

def get_instance_identity():
    """Trích xuất ID của Instance và Token bản quyền từ môi trường UFO-Space."""
    # 1. Tìm instance / job id
    instance_id = (
        os.environ.get("UFO_JOB_ID")
        or os.environ.get("UFO_INSTANCE_ID")
        or os.environ.get("CONTAINER_ID")
    )
    if not instance_id:
        for p in ["/etc/vastai_instance_id", "/root/vastai_instance_id"]:
            if os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        c = f.read().strip()
                        if c:
                            instance_id = c
                            break
                except Exception:
                    pass

    # 2. Tìm license token / proxy secret
    token = (
        os.environ.get("UFO_LICENSE_TOKEN")
        or os.environ.get("UFO_PROXY_SECRET")
        or os.environ.get("PROXY_SECRET")
    )

    license_server = os.environ.get("UFO_LICENSE_SERVER") or DEFAULT_LICENSE_SERVER
    return instance_id, token, license_server.rstrip("/")

def is_dev_bypass_active() -> bool:
    """Kiểm tra cờ cho phép chạy thử nghiệm ở môi trường phát triển nội bộ."""
    dev_bypass = os.environ.get("UFO_DEV_BYPASS", "").lower() in ("true", "1", "yes")
    env_mode = os.environ.get("UFO_ENV", "").lower()
    return dev_bypass or env_mode == "development"

def verify_license_or_die():
    """
    Thực hiện bắt tay xác thực bản quyền với UFO-Space Cloud.
    Nếu thất bại -> In thông báo vi phạm bản quyền và tắt ngay tiến trình (sys.exit(42)).
    """
    if is_dev_bypass_active():
        logger.warning("⚠️ CHẾ ĐỘ PHÁT TRIỂN NỘI BỘ (UFO_DEV_BYPASS): Bỏ qua xác thực bản quyền đám mây.")
        return True

    instance_id, token, license_server = get_instance_identity()

    if not instance_id or not token:
        print("\n" + "=" * 80, file=sys.stderr)
        print("🚨 [FATAL ERROR] KHÓA BẢN QUYỀN UFO-SPACE (CLOUD DRM GUARDIAN)", file=sys.stderr)
        print("=" * 80, file=sys.stderr)
        print("❌ LỖI TRUY CẬP: Thiếu License Token hoặc UFO Instance ID hợp lệ.", file=sys.stderr)
        print("Phần mềm AI Manga Translator là tài sản trí tuệ độc quyền của UFO-Space Cloud.", file=sys.stderr)
        print("Hành vi trích xuất Docker image, sao chép và tự chạy offline là bất hợp pháp.", file=sys.stderr)
        print("Vui lòng khởi chạy ứng dụng chính thức tại: https://ufospace.cloud/dashboard", file=sys.stderr)
        print("=" * 80 + "\n", file=sys.stderr)
        sys.exit(42)

    verify_url = f"{license_server}/api/v1/internal/license/verify"
    payload = json.dumps({
        "instanceId": str(instance_id).strip(),
        "token": str(token).strip(),
        "app": "AI_MANGA_TRANSLATOR",
        "hostname": socket.gethostname()
    }).encode("utf-8")

    # Thử lại tối đa 3 lần với backoff ngắn (phòng trường hợp mạng GPU vừa khởi tạo chưa phân giải DNS xong)
    max_retries = 3
    last_error = ""

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(
                verify_url,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "UFOSpace-LicenseGuard/1.0",
                    "X-UFO-Instance-Id": str(instance_id).strip()
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                if resp.status == 200:
                    body = json.loads(resp.read().decode("utf-8"))
                    if body.get("valid") is True:
                        logger.info(f"✅ Bản quyền UFO-Space Cloud hợp lệ! Instance: {instance_id} | Hạn thuê: {body.get('leaseSeconds', 1800)}s")
                        return True
                    else:
                        last_error = body.get("message") or "Mã xác thực không hợp lệ"
                        break
        except urllib.error.HTTPError as he:
            try:
                err_body = json.loads(he.read().decode("utf-8"))
                last_error = f"HTTP {he.code}: {err_body.get('message', he.reason)}"
            except Exception:
                last_error = f"HTTP {he.code}: {he.reason}"
            if he.code in (401, 403):
                # Lỗi từ chối quyền - không cần retry
                break
        except Exception as ex:
            last_error = str(ex)
            if attempt < max_retries:
                time.sleep(2 * attempt)

    print("\n" + "=" * 80, file=sys.stderr)
    print("🚨 [FATAL ERROR] XÁC THỰC BẢN QUYỀN UFO-SPACE THẤT BẠI", file=sys.stderr)
    print("=" * 80, file=sys.stderr)
    print(f"❌ Chi tiết lỗi: {last_error}", file=sys.stderr)
    print("Máy chủ UFO-Space từ chối cấp phép thực thi cho máy trạm này.", file=sys.stderr)
    print("Nguyên nhân: Máy đã bị hủy/dừng trên dashboard hoặc token không chính chủ.", file=sys.stderr)
    print("Tiến trình sẽ bị chấm dứt ngay lập tức.", file=sys.stderr)
    print("=" * 80 + "\n", file=sys.stderr)
    sys.exit(42)

def _heartbeat_worker(interval: int):
    """Luồng chạy ngầm tuần hoàn kiểm tra bản quyền định kỳ."""
    while True:
        time.sleep(interval)
        try:
            verify_license_or_die()
        except SystemExit:
            os._exit(42)
        except Exception as e:
            logger.warning(f"⚠️ Cảnh báo kiểm tra bản quyền ngầm: {e}")

def start_license_heartbeat(interval: int = HEARTBEAT_INTERVAL_SECONDS):
    """Kích hoạt Background Daemon Thread để kiểm tra bản quyền định kỳ."""
    if is_dev_bypass_active():
        return
    t = threading.Thread(target=_heartbeat_worker, args=(interval,), daemon=True, name="UFOLicenseHeartbeat")
    t.start()
    logger.info(f"🛡️ Khóa Bản Quyền UFO-Space đã kích hoạt bộ theo dõi Heartbeat định kỳ ({interval}s).")

if __name__ == "__main__":
    logger.info("🔒 Đang kiểm tra bản quyền đám mây UFO-Space trước khi khởi động ứng dụng...")
    verify_license_or_die()
    logger.info("🎉 Xác thực bản quyền thành công!")
