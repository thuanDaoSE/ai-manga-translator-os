#!/bin/bash
set -e

echo "=========================================================="
echo "🚀 Khởi động AI Manga Translator 1-Click App (UFO-Space Cloud)"
echo "=========================================================="

cd /app/manga-backend || cd "$(dirname "$0")/manga-backend" || cd .

# 1. 🛡️ BẮT BUỘC KIỂM TRA BẢN QUYỀN ĐÁM MÂY UFO-SPACE (CLOUD DRM CHECK)
if [ -f "license_guard.py" ]; then
    echo "🔒 Đang kiểm tra bản quyền đám mây UFO-Space..."
    python3 license_guard.py || {
        echo "❌ [FATAL] Xác thực bản quyền thất bại! Thoát container."
        exit 42
    }
fi

# Nếu có tham số dòng lệnh được truyền vào (từ Vast.ai hoặc Docker CLI), ưu tiên thực thi sau khi đã kiểm tra bản quyền
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

# Tạo các thư mục workspace cần thiết
mkdir -p workspace/raw workspace/clean workspace/fonts workspace/psd

# Kiểm tra trạng thái GPU
if command -v nvidia-smi &> /dev/null; then
    echo "🎮 Thông tin GPU phát hiện:"
    nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader || true
else
    echo "⚠️ Đang chạy ở chế độ CPU hoặc container không gắn nvidia-smi"
fi

BIND_HOST="${HOST:-::}"
echo "🌐 Khởi chạy máy chủ FastAPI tại ${BIND_HOST}:8080 (IPv6/IPv4 Dual-Stack)..."
exec uvicorn main:app --host "${BIND_HOST}" --port 8080 --workers 1
