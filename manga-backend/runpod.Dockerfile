# Lấy Base Image xịn chuẩn CUDA 12.4 của RunPod
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.11/dist-packages/nvidia/cudnn/lib:/usr/local/lib/python3.11/dist-packages/nvidia/cublas/lib:/usr/local/cuda/lib64:/usr/local/nvidia/lib64:$LD_LIBRARY_PATH
ENV VLM_MOCK=false
ENV RUNPOD_ENDPOINT_TYPE=translate

# Cài đặt thư viện lõi cho OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt thư viện Python AI
COPY requirements-serverless.txt .
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements-serverless.txt

# Cài bản ONNX GPU xịn nhất cho CUDA 12
RUN pip uninstall -y onnxruntime onnxruntime-gpu && \
    pip install --no-cache-dir onnxruntime-gpu==1.19.2

# Pre-download MangaOcr weights directly into Docker image so runtime loads instantly with 0 internet dependency
RUN python -c "from manga_ocr import MangaOcr; m = MangaOcr()"

# Copy bộ não AI vào Docker
COPY handler.py /app/handler.py
COPY ocr_manager.py /app/ocr_manager.py
COPY ocr_router.py /app/ocr_router.py
COPY detector.onnx /app/detector.onnx
COPY lama-manga.onnx /app/lama-manga.onnx
COPY comic_text_detector /app/comic_text_detector

# 🚀 LỆNH KHỞI ĐỘNG SERVERLESS
CMD ["python", "-u", "/app/handler.py"]