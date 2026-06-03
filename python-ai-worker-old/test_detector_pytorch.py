import cv2
import torch
import os
import sys

# Khai báo đường dẫn để import được thư viện trong folder comic_text_detector
sys.path.append(os.path.join(os.path.dirname(__file__), "comic_text_detector"))
from comic_text_detector.inference import TextDetector

print("📥 [Bước 1] Khởi động AI Nhận diện (Phiên bản PyTorch Tối ưu)...")
device = "cuda" if torch.cuda.is_available() else "cpu"
model_path = os.path.join(os.path.dirname(__file__), "comic_text_detector", "data", "comictextdetector.pt")

# Gọi mô hình với bộ Wrapper chuẩn của tác giả
detector = TextDetector(model_path=model_path, device=device)

print("🖼️ [Bước 2] AI đang phân tích ảnh bằng thuật toán nâng cao...")
image_path = "test2.jpg"
image_bgr = cv2.imread(image_path)

# Bộ TextDetector sẽ tự động lo khâu Pre-processing và Post-processing
# Trả về: mask (Mặt nạ cắt lớp), mask_refined, và blk_list (Danh sách Bounding Boxes)
mask, mask_refined, blk_list = detector(image_bgr)

print(f"✅ Đã tìm thấy {len(blk_list)} vùng chữ!")

# --- VẼ HỘP ĐÃ CHUẨN HÓA ---
# Khác với ONNX phải tự NMS lằng nhằng, blk_list ở đây đã được AI gom nhóm cực chuẩn
for i, box in enumerate(blk_list):
    # box có format: [x1, y1, x2, y2]
    x1, y1, x2, y2 = map(int, box[:4])
    
    # Vẽ viền xanh lá cây bao quanh
    cv2.rectangle(image_bgr, (x1, y1), (x2, y2), (0, 255, 0), 2)
    # Ghi chú nhỏ ở góc
    cv2.putText(image_bgr, f"Text {i+1}", (x1, max(y1 - 5, 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

output_path = "test2_pytorch_detected.jpg"
cv2.imwrite(output_path, image_bgr)

# TIỆN THỂ LƯU LUÔN CÁI MẶT NẠ (MASK) ĐỂ SẾP XEM LAMA NÓ XÓA DỰA TRÊN CÁI GÌ
cv2.imwrite("test2_pytorch_mask.jpg", mask_refined)

print(f"🎯 Đã lưu kết quả bounding box tại: {output_path}")
print(f"👻 Đã lưu mặt nạ (mask) tẩy nền tại: test2_pytorch_mask.jpg")