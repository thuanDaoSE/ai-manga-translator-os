from ultralytics import YOLO
import cv2
import os

print("🤖 Đang khởi động Trạm 1: Đôi mắt AI YOLOv8m (Bản nâng cấp)...")

# 1. Trỏ thẳng vào file Não AI MỚI bạn vừa tải
model_path = "comic-speech-bubble-detector.pt" # <-- Đổi tên file ở đây

# 2. Nạp AI vào RAM
print("⏳ Đang khởi động AI...")
model = YOLO(model_path)

# 3. Đọc ảnh gốc
image_path = 'test.jpg'
image = cv2.imread(image_path)

# 4. Cho AI quét ảnh
print("🔍 Đang quét ảnh tìm bong bóng thoại...")
results = model(image_path)

# 5. Tạo thư mục xuất kết quả
output_dir = "yolo_crops"
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

count = 0
# 6. Bóc tách tọa độ và Cắt ảnh
for box in results[0].boxes.xyxy:
    x1, y1, x2, y2 = map(int, box.tolist())
    
    # BỘ LỌC RÁC: Bỏ qua khung quá nhỏ
    if (x2 - x1) < 20 or (y2 - y1) < 20:
        continue
        
    count += 1
    # Vẽ khung XANH LÁ
    cv2.rectangle(image, (x1, y1), (x2, y2), (0, 255, 0), 2)
    
    # Cắt ảnh và lưu
    cropped_image = image[y1:y2, x1:x2]
    cv2.imwrite(f"{output_dir}/yolo_crop_{count}.jpg", cropped_image)

cv2.imwrite("test_yolo_boxed.jpg", image)

print(f"\n✅ AI YOLO đã quét xong! TÌM THẤY ĐÚNG {count} KHUNG CHỮ.")
print(f"👉 Hãy mở file 'test_yolo_boxed.jpg' để nghiệm thu!")