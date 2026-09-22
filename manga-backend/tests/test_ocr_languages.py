import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image, ImageDraw
from ocr_router import get_ocr_router

# 1. Create a synthetic English test crop
img = Image.new('RGB', (260, 60), color=(255, 255, 255))
d = ImageDraw.Draw(img)
d.text((15, 20), "I am Spider-Man!", fill=(0, 0, 0))

router = get_ocr_router()
print("--- [TEST 1] English OCR Routing ---")
res_en = router.recognize(img, source_language="en", box_id=1)
print(f"Result (EN): '{res_en}'")

print("\n--- [TEST 2] Japanese OCR Routing ---")
# Japanese Hayai-OCR v2 test with synthetic image
img_ja = Image.new('RGB', (200, 60), color=(255, 255, 255))
d_ja = ImageDraw.Draw(img_ja)
d_ja.text((15, 20), "こんにちは", fill=(0, 0, 0))
res_ja = router.recognize(img_ja, source_language="ja", box_id=2)
print(f"Result (JA): '{res_ja}'")
