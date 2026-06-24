# Sử dụng Python 3.11-slim để có dung lượng tối giản
FROM python:3.11-slim

# Thiết lập các biến môi trường tối ưu hóa runtime của Python
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Copy requirements và install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy file model (đóng gói sẵn trong image để tránh download khi khởi động)
# Lưu ý: Bạn cần copy file lama-manga.onnx từ manga-backend thành lama.onnx vào thư mục này trước khi build
COPY lama.onnx lama.onnx

# Copy source code handler
COPY handler.py .

# Command khởi chạy RunPod Serverless worker
CMD ["python", "-u", "handler.py"]
