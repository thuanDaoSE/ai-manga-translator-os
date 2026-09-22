# syntax=docker/dockerfile:1.4
# ==============================================================================
# Production Single-Tenant GPU Runtime (UFO-Space / Vast.ai)
# App: AI Manga Translator (DeepKoma)
# Base: PyTorch 2.1.0 + CUDA 11.8 + cuDNN 8 Runtime
# Optimization: Caching Strategy (Models baked before app code) & Layer Consolidation
# ==============================================================================

FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

LABEL maintainer="UFO-Space DevSecOps Team <devops@ufospace.cloud>"
LABEL description="AI Manga Translator 1-Click App with Comic-Text-Detector, Hayai-OCR v2 (SigLIP 2) & LaMa Inpainting"

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080 \
    RUN_LOCAL_AI=true

# 1. Layer Consolidation: Cài đặt thư viện hệ thống cần thiết cho OpenCV, Pillow và dọn dẹp cache
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        curl \
        wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app/manga-backend

# 2. Caching Strategy: Cài đặt Python Dependencies trước (ít thay đổi)
COPY manga-backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt && \
    rm -rf /root/.cache/pip /tmp/* /var/tmp/*

# 3. Caching Strategy: "Nướng" sẵn AI Models trước khi copy mã nguồn ứng dụng
# Giúp Layer models (3-4GB) được lưu vĩnh viễn vào Docker cache, không bị re-download khi sửa code
COPY manga-backend/download_models.py ./
RUN python download_models.py && \
    rm -rf /root/.cache/pip /tmp/* /var/tmp/*

# 4. Copy mã nguồn ứng dụng (Thường xuyên thay đổi nhất - Đặt ở layer cuối cùng)
COPY manga-backend/ ./

# 5. Entrypoint script với quyền thực thi chuẩn
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Cổng Web mặc định của Vast.ai / UFO-Space
EXPOSE 8080

ENTRYPOINT ["/app/start.sh"]
