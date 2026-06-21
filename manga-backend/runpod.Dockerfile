# Lấy Base Image xịn chuẩn CUDA 12.4 của sếp
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64:/usr/local/nvidia/lib64:$LD_LIBRARY_PATH

# Cài đặt thư viện lõi (Thêm git phòng khi cần thiết)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 git \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt thư viện Python AI
COPY requirements-serverless.txt .
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements-serverless.txt

# Cài đặt flash-attn bằng lệnh riêng có --no-build-isolation
RUN pip install --no-cache-dir flash-attn>=2.5.0 --no-build-isolation

# Cài bản ONNX GPU xịn nhất cho CUDA 12 giống sếp đã làm
RUN pip uninstall -y onnxruntime onnxruntime-gpu && \
    pip install --no-cache-dir onnxruntime-gpu==1.19.2

# Tải trước trọng số model về cache của Docker để tránh cold-start latency
RUN pip install --no-cache-dir huggingface_hub && \
    huggingface-cli download gigass03/PaddleOCR-VL-1.6-Manga-Finetuned --exclude "*.gguf" "*.onnx" "*.md"

# Copy bộ não AI vào Docker
COPY handler.py /app/handler.py
COPY lama-manga.onnx /app/lama-manga.onnx
COPY comic_text_detector /app/comic_text_detector

# 🚀 LỆNH KHỞI ĐỘNG SERVERLESS (Không được dùng sleep infinity)
CMD ["python", "-u", "/app/handler.py"]