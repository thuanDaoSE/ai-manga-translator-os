# 🚀 Nâng cấp RunPod Serverless Worker lên v2.0 trên nền v1.5 đã có sẵn toàn bộ model AI
FROM thuandaose/manga-translate:v1.5

WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.11/dist-packages/nvidia/cudnn/lib:/usr/local/lib/python3.11/dist-packages/nvidia/cublas/lib:/usr/local/cuda/lib64:/usr/local/nvidia/lib64:$LD_LIBRARY_PATH
ENV VLM_MOCK=false
ENV RUNPOD_ENDPOINT_TYPE=translate

# Cài đặt thêm các package cần thiết cho SOTA Hayai-OCR v2
COPY requirements-serverless.txt /app/requirements-serverless.txt
RUN pip install --no-cache-dir -r /app/requirements-serverless.txt

# Copy bộ não AI xử lý đa luồng & GPU tối ưu
COPY handler.py /app/handler.py
COPY ocr_manager.py /app/ocr_manager.py
COPY ocr_router.py /app/ocr_router.py

CMD ["python", "-u", "/app/handler.py"]
