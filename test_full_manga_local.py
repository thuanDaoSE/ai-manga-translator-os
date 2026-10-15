import os
import sys
import time
import json
import cv2
import numpy as np

backend_dir = r"D:\Workspaces\VSCode-workspace\AI_Manga_Translator\manga-backend"
sys.path.insert(0, backend_dir)
sys.path.insert(0, os.path.join(backend_dir, "comic_text_detector"))
os.chdir(backend_dir)

from worker import get_text_detector, run_local_lama, get_ocr_router, deepseek_client

test_img_path = r"D:\Workspaces\VSCode-workspace\AI_Manga_Translator\testInputImage\manga\japanInput\test7.jpg"
print(f"📖 Step 1: Loading test image: {test_img_path}")
img = cv2.imread(test_img_path)
if img is None:
    raise FileNotFoundError(f"Cannot read image at {test_img_path}")
h, w, c = img.shape
print(f"✅ Image loaded successfully! Shape: {w}x{h}, {c} channels")

print("\n🔍 Step 2: Running ComicTextDetector...")
t0 = time.time()
detector = get_text_detector()
result = detector(img)
mask_raw = result[0] if isinstance(result, tuple) else result
mask_refined = result[1] if isinstance(result, tuple) and len(result) > 1 else mask_raw
blk_list = result[2] if isinstance(result, tuple) and len(result) > 2 else []
print(f"✅ Detection completed in {time.time() - t0:.2f}s! Found {len(blk_list)} text blocks.")

# Build mask
if mask_raw.max() <= 1.0:
    mask_raw_bin = (mask_raw * 255).astype(np.uint8)
else:
    mask_raw_bin = mask_raw.astype(np.uint8)
_, mask_raw_bin = cv2.threshold(mask_raw_bin, 127, 255, cv2.THRESH_BINARY)

kernel_fat = np.ones((7, 7), np.uint8)
fat_mask = cv2.dilate(mask_raw_bin, kernel_fat, iterations=2)
gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
_, white_regions = cv2.threshold(gray_img, 200, 255, cv2.THRESH_BINARY)
smart_mask = cv2.bitwise_and(fat_mask, cv2.bitwise_or(mask_raw_bin, white_regions))
smart_mask = cv2.dilate(smart_mask, np.ones((3, 3), np.uint8), iterations=1)
lama_mask = cv2.dilate(smart_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1)

detector_boxes = []
if blk_list:
    for blk in blk_list:
        bx1, by1, bx2, by2 = blk.xyxy
        if (bx2 - bx1) >= 16 and (by2 - by1) >= 16:
            detector_boxes.append((int(bx1), int(by1), int(bx2), int(by2)))

if not detector_boxes:
    contours, _ = cv2.findContours(lama_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw >= 16 and bh >= 16:
            detector_boxes.append((x, y, x + bw, y + bh))

detector_boxes.sort(key=lambda b: (-b[2], b[1]))
print(f"📍 Detected {len(detector_boxes)} text boxes for OCR & inpainting.")

print("\n🎨 Step 3: Running LaMa Inpainting (clean text)...")
t0 = time.time()
clean_img = run_local_lama(img, lama_mask, target_boxes=detector_boxes)
os.makedirs("workspace/test_output", exist_ok=True)
clean_out_path = "workspace/test_output/clean_test7.jpg"
cv2.imwrite(clean_out_path, clean_img)
print(f"✅ Inpainting completed in {time.time() - t0:.2f}s! Saved to {clean_out_path}")

print("\n📝 Step 4: Running OCR on text boxes...")
t0 = time.time()
ocr_router = get_ocr_router()
box_crops = []
valid_boxes = []
for (bx1, by1, bx2, by2) in detector_boxes:
    crop = img[by1:by2, bx1:bx2]
    if crop.size > 0:
        box_crops.append(crop)
        valid_boxes.append((bx1, by1, bx2, by2))

extracted_data = []
if box_crops:
    try:
        texts = ocr_router.recognize_batch(box_crops, source_language="auto", batch_size=8)
    except Exception as e:
        print(f"⚠️ Batch OCR error: {e}, fallback sequential...")
        texts = [ocr_router.recognize(c, source_language="auto", box_id=i+1) for i, c in enumerate(box_crops)]
    
    for i, ((bx1, by1, bx2, by2), txt) in enumerate(zip(valid_boxes, texts)):
        if txt and txt.strip():
            extracted_data.append({
                "id": i + 1,
                "box": [bx1, by1, bx2, by2],
                "japanese": txt.strip(),
                "vietnamese": ""
            })
            print(f"   Box {i+1} [{bx1},{by1},{bx2},{by2}]: {txt.strip()}")
print(f"✅ OCR completed in {time.time() - t0:.2f}s! Recognized {len(extracted_data)} texts.")

print("\n🤖 Step 5: Translating to Vietnamese with DeepSeek AI...")
if extracted_data:
    t0 = time.time()
    payload = [{"id": it["id"], "text": it["japanese"]} for it in extracted_data]
    prompt = f"Dịch các câu thoại manga tiếng Nhật sau sang Tiếng Việt tự nhiên, phù hợp truyện tranh. Trả về JSON: {{\"translations\": [{{\"id\": 1, \"translation\": \"câu dịch\"}}]}}. Dữ liệu: {json.dumps(payload, ensure_ascii=False)}"
    resp = deepseek_client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    res_json = json.loads(resp.choices[0].message.content)
    t_map = {t["id"]: t["translation"] for t in res_json.get("translations", [])}
    for it in extracted_data:
        it["vietnamese"] = t_map.get(it["id"], "")
        print(f"   [Box {it['id']}] {it['japanese']} ➔ {it['vietnamese']}")
    print(f"✅ DeepSeek translation completed in {time.time() - t0:.2f}s!")

print("\n🎉 LOCAL PIPELINE TEST 100% SUCCESSFUL!")
