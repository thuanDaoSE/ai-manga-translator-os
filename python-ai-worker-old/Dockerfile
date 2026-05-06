# Dùng bản Python 3.10 siêu nhẹ làm nền tảng (Base image)
FROM python:3.10-slim

# Thiết lập thư mục làm việc bên trong Container
WORKDIR /app

# Cài đặt các thư viện lõi của Linux để hỗ trợ OpenCV và AI
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
# Copy file requirements.txt vào trước để cài đặt thư viện (tối ưu cache của Docker)
COPY requirements.txt .

# Cài đặt toàn bộ thư viện AI (Bước này thường tốn thời gian nhất)
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ code (main.py), file HTML và model AI (.pt) vào Container
COPY . .

# Mở cổng 8000 để Web UI có thể giao tiếp
EXPOSE 8000

# Lệnh khởi động Server khi Container chạy
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# Thêm biến môi trường này vào Dockerfile để các thư viện AI hiểu là chạy CPU
ENV CUDA_VISIBLE_DEVICES=-1
ENV FORCE_CPU=success

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]