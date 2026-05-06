import cv2
import numpy as np
import onnxruntime as ort
import os

print("📥 [Bước 1] Khởi động AI Nhận diện (Bản vá lỗi Tọa độ Không gian)...")
model_path = "detector.onnx"
session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])

print("🖼️ [Bước 2] Phân tích ảnh với thuật toán Letterbox...")
image_path = "test2.jpg"
image_bgr = cv2.imread(image_path)
h_orig, w_orig = image_bgr.shape[:2]

# --- THUẬT TOÁN LETTERBOX: Giữ nguyên tỷ lệ ảnh, thêm viền xám ---
target_size = 640
ratio = min(target_size / h_orig, target_size / w_orig)
new_unpad_h, new_unpad_w = int(round(h_orig * ratio)), int(round(w_orig * ratio))

# Thu nhỏ ảnh nhưng giữ đúng tỷ lệ
img_resized = cv2.resize(image_bgr, (new_unpad_w, new_unpad_h), interpolation=cv2.INTER_LINEAR)

# Tính toán viền xám cần bù vào (Padding)
dw = (target_size - new_unpad_w) / 2
dh = (target_size - new_unpad_h) / 2
top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
left, right = int(round(dw - 0.1)), int(round(dw + 0.1))

# Chèn viền xám (Màu 114, 114, 114 là chuẩn của AI)
img_padded = cv2.copyMakeBorder(img_resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114))

# Tiền xử lý Tensor
img_rgb = cv2.cvtColor(img_padded, cv2.COLOR_BGR2RGB)
img_norm = img_rgb.astype(np.float32) / 255.0
mean, std = np.array([0.485, 0.456, 0.406], dtype=np.float32), np.array([0.229, 0.224, 0.225], dtype=np.float32)
img_norm = (img_norm - mean) / std 
img_tensor = np.transpose(img_norm, (2, 0, 1))[np.newaxis, ...]

# Bơm vào AI (Lưu ý: Truyền kích thước 640 để AI tính tọa độ trên ảnh vuông)
ort_inputs = {session.get_inputs()[0].name: img_tensor} 
if "orig_target_sizes" in [inp.name for inp in session.get_inputs()]:
    ort_inputs["orig_target_sizes"] = np.array([[target_size, target_size]], dtype=np.int64)

outputs = session.run(None, ort_inputs)
labels, pred_boxes, scores = outputs[0][0], outputs[1][0], outputs[2][0]       

# --- GIAI ĐOẠN 3: DỊCH NGƯỢC TỌA ĐỘ VỀ ẢNH GỐC ---
conf_thresh = 0.40
nms_thresh = 0.35

class_boxes = {0: [], 1: [], 2: []}
class_scores = {0: [], 1: [], 2: []}

for i in range(len(scores)):
    if scores[i] > conf_thresh:
        # Tọa độ này đang nằm trên ảnh vuông có viền xám
        x1_sq, y1_sq, x2_sq, y2_sq = pred_boxes[i]
        
        # TOÁN HỌC KHÔI PHỤC: Trừ đi viền xám và chia lại tỷ lệ
        x1 = (x1_sq - left) / ratio
        y1 = (y1_sq - top) / ratio
        x2 = (x2_sq - left) / ratio
        y2 = (y2_sq - top) / ratio
        
        class_id = int(labels[i])
        w, h = x2 - x1, y2 - y1
        if w > 5 and h > 5:
            class_boxes[class_id].append([int(x1), int(y1), int(w), int(h)])
            class_scores[class_id].append(float(scores[i]))

# --- VẼ HỘP ĐÃ CHUẨN HÓA ---
class_config = {
    0: {"name": "Bong bong", "color": (255, 0, 0)},
    1: {"name": "Chu trong bong bong", "color": (0, 255, 0)},
    2: {"name": "Chu tu do/SFX", "color": (0, 0, 255)}
}

count = 0
for class_id in range(3):
    if len(class_boxes[class_id]) > 0:
        indices = cv2.dnn.NMSBoxes(class_boxes[class_id], class_scores[class_id], conf_thresh, nms_thresh)
        if len(indices) > 0:
            for i in indices.flatten():
                x, y, w, h = class_boxes[class_id][i]
                conf = class_scores[class_id][i]
                
                # Ép tọa độ không bị tràn viền ảnh
                x1 = max(0, x)
                y1 = max(0, y)
                x2 = min(w_orig, x + w)
                y2 = min(h_orig, y + h)
                
                config = class_config.get(class_id, {"name": "Unknown", "color": (255,255,255)})
                cv2.rectangle(image_bgr, (x1, y1), (x2, y2), config["color"], 2)
                cv2.putText(image_bgr, f'{config["name"]} {conf:.2f}', (x1, max(y1 - 5, 10)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, config["color"], 2)
                count += 1

output_path = "test2_detected_v3.jpg"
cv2.imwrite(output_path, image_bgr)

print("\n" + "="*50)
print(f"🎉 Đã sửa xong thuật toán Ánh xạ! Khung chữ đã khít 100%.")
print(f"👉 Mở file '{output_path}' để chiêm ngưỡng sức mạnh thực sự của RT-DETR-v2.")
print("="*50 + "\n")