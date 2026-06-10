# Base Image: Stable PyTorch/CUDA developer base image
FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

# Prevent Python from writing .pyc files and buffering outputs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Working Directory set to /workspace
WORKDIR /workspace

# Install system dependencies required for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first to take advantage of Docker layer caching
# Note: Execute build from 'manga-backend' directory:
# docker build --build-arg HF_TOKEN=your_token -f runpod-serverless/Dockerfile -t your-tag .
COPY runpod-serverless/requirements.txt ./

# Upgrade pip and install Python packages
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Pre-download Models phase
# Define ARG HF_TOKEN to authenticate with Hugging Face during the build phase
ARG HF_TOKEN
COPY runpod-serverless/builder.py ./
RUN HF_TOKEN=$HF_TOKEN python builder.py

# Copy source code and ONNX models into the image
COPY handler.py redraw_utils.py lama-manga.onnx detector.onnx ./
COPY comic_text_detector/ ./comic_text_detector/

# Entrypoint for RunPod Serverless worker
CMD ["python", "-u", "handler.py"]
