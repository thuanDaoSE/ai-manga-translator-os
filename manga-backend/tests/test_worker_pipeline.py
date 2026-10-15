import os
import sys
import cv2
import numpy as np
import json

# Ensure the backend directory is in the import path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from ocr_manager import OCRManager

def main():
    print("🔧 Preparing image...")
    image_path = r"d:\Workspaces\VSCode-workspace\older_verManga\python-ai-worker-old\test9.jpg"
    if not os.path.exists(image_path):
        image_path = "dummy_test_page.png"
        # Force creation of dummy image if missing
        img = np.ones((512, 512, 3), dtype=np.uint8) * 255
        cv2.rectangle(img, (80, 80), (320, 240), (0, 0, 0), 2)
        # Put two lines of text inside the bubble to test multi-line merging
        cv2.putText(img, "FIRST LINE", (100, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
        cv2.putText(img, "SECOND LINE", (100, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
        cv2.imwrite(image_path, img)
        print(f"Created dummy test page at {image_path}")
    else:
        print(f"Using target test image: {image_path}")
        
    img = cv2.imread(image_path)
    h_img, w_img = img.shape[:2]
    clean_img = img.copy()
    
    print("Loading Comic Text Detector...")
    from worker import get_text_detector, run_local_lama
    
    try:
        ctd_detector = get_text_detector()
        print("Running Comic Text Detector...")
        result = ctd_detector(img)
        ctd_mask = result[1] if isinstance(result, tuple) else result
        if ctd_mask.max() <= 1.0: 
            ctd_mask = (ctd_mask * 255).astype(np.uint8)
        else: 
            ctd_mask = ctd_mask.astype(np.uint8)
            
        _, ctd_mask_bin = cv2.threshold(ctd_mask, 127, 255, cv2.THRESH_BINARY)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
        lama_mask = cv2.dilate(ctd_mask_bin, kernel, iterations=1)
    except Exception as e:
        print(f"❌ Failed to load or run Comic Text Detector: {e}")
        return
    
    # Save the mask layer to disk for debugging/user inspection
    cv2.imwrite("test_mask_output.png", lama_mask)
    print("Saved debug mask layer to 'test_mask_output.png'")
    
    # Find contours from lama_mask to get text bounding boxes (same as RunPod handler)
    contours, _ = cv2.findContours(lama_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    detector_boxes = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w < 16 or h < 16: 
            continue
        detector_boxes.append((x, y, x + w, y + h))
        
    # Sort bounding boxes
    detector_boxes.sort(key=lambda b: (b[1], b[0]))
    print(f"Detected {len(detector_boxes)} text bounding boxes.")
    
    print("Running local LaMa inpainting...")
    try:
        clean_img = run_local_lama(img, lama_mask)
    except Exception as e:
        print(f"❌ LaMa inpainting failed: {e}")
        return
    ocr_manager = OCRManager()
    extracted_data = []
    count = 1
    for (bx1, by1, bx2, by2) in detector_boxes:
        crop_raw = img[by1:by2, bx1:bx2]
        if crop_raw.size == 0:
            continue
            
        recognized_text = ocr_manager.recognize_crop(crop_raw, language="en", is_vip=False)
        print(f"Box #{count}: [{bx1}, {by1}, {bx2}, {by2}] | Text: '{recognized_text}'")
        
        extracted_data.append({
            "id": count,
            "box_coordinates": {"x1": bx1, "y1": by1, "x2": bx2, "y2": by2},
            "text": recognized_text
        })
        count += 1
        
    cv2.imwrite("test_clean_output.jpg", clean_img)
    print("🎉 Pipeline executed successfully! Output saved as 'test_clean_output.jpg'")

if __name__ == "__main__":
    main()
