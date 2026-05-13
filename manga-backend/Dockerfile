# 1. DÙNG CHÍNH BASE IMAGE CỦA RUNPOD (CUDA 12.4 + cuDNN 9) - ĐÂY LÀ CHÌA KHÓA VÀNG
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
# Ép ONNX nạp đúng thư viện CUDA 12
ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64:/usr/local/nvidia/lib64:$LD_LIBRARY_PATH

# 2. Cài đặt các thư viện lõi hệ điều hành
RUN apt-get update && apt-get install -y --no-install-recommends \
    zlib1g zlib1g-dev libgl1 libglib2.0-0 redis-server psmisc lsof git wget nano \
    && rm -rf /var/lib/apt/lists/*

# 3. Cài đặt thư viện Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Xóa bản ONNX cũ dính dáng tới CPU và cài bản GPU xịn nhất cho CUDA 12
RUN pip uninstall -y onnxruntime onnxruntime-gpu && \
    pip install --no-cache-dir onnxruntime-gpu==1.19.2

# 4. Copy Code
COPY . .
RUN mkdir -p /app/workspace/projects

# 🚀 5. ĐÃ SỬA LỖI XUỐNG DÒNG: Kịch bản khởi động ngầm an toàn tuyệt đối
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'redis-server --daemonize yes' >> /app/start.sh && \
    echo 'sleep infinity' >> /app/start.sh && \
    chmod +x /app/start.sh

CMD ["/app/start.sh"]