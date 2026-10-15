import os
import sys
import cv2
import time
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from image_utils import slice_webtoon_image, stitch_webtoon_chunks
from ocr_manager import OCRManager

def test_webtoon():
    webtoon_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'testInputImage', 'webtoon')
    webtoon_dir = os.path.abspath(webtoon_dir)
    
    print(f"📂 Scanning Webtoon Test Directory: {webtoon_dir}")
    if not os.path.exists(webtoon_dir):
        print("❌ Directory does not exist!")
        return

    files = sorted([f for f in os.listdir(webtoon_dir) if f.endswith(('.jpg', '.png', '.webp'))])
    print(f"Found {len(files)} Webtoon files.\n")

    manager = OCRManager()

    for filename in files[:5]: # Test first 5 webtoons
        filepath = os.path.join(webtoon_dir, filename)
        img = cv2.imread(filepath)
        if img is None:
            continue
            
        h, w = img.shape[:2]
        ratio = h / w
        print(f"==================== WEBTOON: {filename} ({w}x{h} px, Ratio: {ratio:.2f}) ====================")
        
        t0 = time.time()
        dummy_mask = np.zeros((h, w), dtype=np.uint8)
        chunks = slice_webtoon_image(img, dummy_mask, chunk_height=1500)
        print(f"✂️ Dynamic Overlap Slicing: Created {len(chunks)} chunks (Overlap size: {int(w * 0.25)}px)")

        total_bubbles = 0
        all_texts = []

        for idx, chunk in enumerate(chunks):
            c_img = chunk["image_chunk"]
            # Process OCR on chunk
            ocr_results = manager.process_ocr(c_img, language='ja', is_vip=True)
            for res in ocr_results:
                text = res.get('text', '').strip()
                if text:
                    all_texts.append(text)
            total_bubbles += len(ocr_results)

        duration = time.time() - t0
        print(f"✅ Processed in {duration:.2f}s | Detected {total_bubbles} text regions | Recognized {len(all_texts)} non-empty texts:")
        for i, txt in enumerate(all_texts[:10], 1):
            print(f"   {i}. {txt}")

if __name__ == "__main__":
    test_webtoon()
