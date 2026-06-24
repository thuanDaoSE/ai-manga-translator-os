# RunPod Serverless CPU Worker for LaMa ONNX

Dự án này là một Serverless Worker tối giản, được thiết kế để chạy trên **RunPod Serverless CPU** nhằm phục vụ duy nhất mô hình **LaMa ONNX inpainting** với thời gian Cold Start ngắn nhất có thể.

## Đặc điểm nổi bật & Tối ưu hóa Cold Start:
1. **Dung lượng Image siêu nhỏ**: Sử dụng base image `python:3.11-slim` và lược bỏ thư viện OpenCV cồng kềnh (~100MB). Thay thế hoàn toàn bằng **Pillow** nhẹ nhàng (~5MB) để xử lý hình ảnh.
2. **Không tải mạng lúc Runtime**: File model `lama.onnx` được COPY trực tiếp vào trong Docker Image tại thời điểm build. Worker sẽ không tải bất kỳ thứ gì qua internet khi khởi động.
3. **Model Caching (Singleton)**: ONNX Runtime Session được khởi tạo một lần duy nhất tại global scope ngay khi worker boot và được sử dụng lại cho mọi request tiếp theo.
4. **Tối ưu hóa đa luồng CPU**: Cho phép tinh chỉnh số lượng luồng thực thi thông qua các biến môi trường `ORT_INTRA_OP_THREADS` và `ORT_INTER_OP_THREADS`.

---

## Cấu trúc thư mục
```text
runpod-cpu-worker/
├── Dockerfile          # Dockerfile tối giản tối ưu cho CPU
├── requirements.txt    # Các thư viện python tối thiểu cần thiết
├── handler.py          # Script xử lý chính, kết nối RunPod serverless SDK
├── test_input.json     # File mock dữ liệu input để test
└── README.md           # Hướng dẫn sử dụng chi tiết (file này)
```

---

## Các bước chuẩn bị & Kiểm thử Cục bộ (Local)

### 1. Chuẩn bị file Model
Copy file model `lama-manga.onnx` từ thư mục backend vào thư mục này và đổi tên thành `lama.onnx`:
```bash
cp ../manga-backend/lama-manga.onnx ./lama.onnx
```

### 2. Thiết lập môi trường Python ảo và cài đặt thư viện
```bash
# Tạo môi trường ảo python
python -m venv venv

# Kích hoạt môi trường ảo
# Trên Windows:
.\venv\Scripts\activate
# Trên Linux/macOS:
source venv/bin/activate

# Cài đặt các thư viện
pip install -r requirements.txt
```

### 3. Chạy test mô phỏng cục bộ (không dùng Docker)
Chạy script handler với tham số `local` để mô phỏng một job Serverless bằng cách đọc payload từ file `test_input.json`:
```bash
python handler.py local
```
*Kết quả sẽ trả về JSON chứa output ảnh đã xóa nền dưới dạng chuỗi base64 (`result_b64`) và in ra thời gian load model để bạn đo lường.*

---

## Build Docker & Chạy thử bằng Container

### 1. Build Docker Image
Chạy lệnh sau tại thư mục `runpod-cpu-worker/`:
```bash
docker build -t runpod-lama-cpu:latest .
```

### 2. Chạy test container cục bộ
Chúng ta có thể chạy container và mô phỏng một lượt xử lý để kiểm tra xem runtime trong container có chạy tốt không:
```bash
docker run --rm \
  -e CPU_RUNPOD_ID=local_docker_test \
  -e ORT_INTRA_OP_THREADS=2 \
  -v ./test_input.json:/app/test_input.json \
  runpod-lama-cpu:latest \
  python handler.py local
```

---

## Deploy lên RunPod Serverless CPU

### 1. Push Image lên Docker Hub (hoặc Container Registry khác)
```bash
# Đăng nhập vào Docker Hub
docker login

# Tag image theo tài khoản của bạn
docker tag runpod-lama-cpu:latest <your_username>/runpod-lama-cpu:latest

# Push lên registry
docker push <your_username>/runpod-lama-cpu:latest
```

### 2. Cấu hình Endpoint trên RunPod
1. Truy cập trang quản trị **RunPod** -> **Serverless** -> **Endpoints** -> Bấm **New Endpoint**.
2. **Endpoint Name**: Đặt tên (ví dụ: `lama-cpu-inpainting`).
3. **Container Image**: Điền `<your_username>/runpod-lama-cpu:latest`.
4. **Select Category**: Chọn **CPU** (thay vì GPU).
5. **Active Worker Limits**: Tùy chỉnh số lượng worker tối thiểu và tối đa (Min: 0, Max: 10).
6. **Environment Variables**:
   - `CPU_RUNPOD_ID`: ID định danh cho cụm instance (ví dụ: `vps_cpu_pod_1`).
   - `ORT_INTRA_OP_THREADS`: Số luồng xử lý tính toán song song (Khuyên dùng: `2` hoặc `4` tương ứng với số vCPU được cấu hình cho Pod).
   - `ORT_INTER_OP_THREADS`: `1`.

### 3. Định dạng Input/Output của Endpoint
**Request JSON Payload:**
```json
{
  "input": {
    "image_b64": "Chuỗi_Base64_của_ảnh_RGB_hoặc_RGBA",
    "mask_b64": "Chuỗi_Base64_của_ảnh_mặt_nạ_grayscale"
  }
}
```

**Response JSON:**
```json
{
  "delayTime": 123,
  "executionTime": 450,
  "id": "job_id_abcxyz",
  "output": {
    "cpu_runpod_id": "vps_cpu_pod_1",
    "result_b64": "Chuỗi_Base64_kết_quả_sau_khi_xóa_nền",
    "shape": [512, 512, 3],
    "dtype": "uint8"
  },
  "status": "COMPLETED"
}
```
