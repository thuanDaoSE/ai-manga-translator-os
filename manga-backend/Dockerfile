# Use official Python 3.10 slim image based on Debian Bookworm
FROM python:3.10-slim-bookworm

# Prevent Python from writing .pyc files and buffer outputs, non-interactive apt
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system-level dependencies for OpenCV and Node Canvas, and install Node.js + npm
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    # OpenCV dependencies
    libgl1-mesa-glx \
    libglib2.0-0 \
    # Node.js canvas dependencies
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    # Node.js and npm (Debian Bookworm default repository contains Node.js v18+)
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency definition files first to leverage Docker layer caching
COPY requirements.txt package.json package-lock.json ./

# Upgrade pip and install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install Node.js dependencies (production only to keep image light)
RUN npm ci --omit=dev

# Copy the rest of the application files
COPY . .

# Ensure the workspace directory is created for mount points
RUN mkdir -p /app/workspace

# Expose backend service port
EXPOSE 8000

# Start FastAPI application using Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
