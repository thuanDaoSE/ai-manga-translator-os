import sys
import os
import io
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from image_utils import preprocess_image
from fastapi import HTTPException

def run_tests():
    print("🧪 [TEST] Khởi chạy bộ kiểm thử chốt chặn bảo vệ kích thước ảnh...")

    # 1. Tạo ảnh bình thường (Tỷ lệ 1000x1200, aspect ratio = 1.2 <= 2.2) -> Phải PASS
    normal_img = Image.new("RGB", (1000, 1200), (255, 255, 255))
    normal_buffer = io.BytesIO()
    normal_img.save(normal_buffer, format="JPEG")
    normal_bytes = normal_buffer.getvalue()

    try:
        processed_normal = preprocess_image(normal_bytes)
        print("✅ [TEST] Ảnh tỷ lệ chuẩn (1000x1200) đã PASS thành công!")
    except HTTPException as he:
        print(f"❌ [TEST ERROR] Ảnh tỷ lệ chuẩn bị chặn nhầm! Lỗi: {he.detail}")
        return False

    # 2. Tạo ảnh cực dài / Webtoon (Tỷ lệ 800x2000, aspect ratio = 2.5 > 2.2) -> Phải PASS và hỗ trợ Webtoon
    long_img = Image.new("RGB", (800, 2000), (255, 255, 255))
    long_buffer = io.BytesIO()
    long_img.save(long_buffer, format="JPEG")
    long_bytes = long_buffer.getvalue()

    try:
        processed_webtoon = preprocess_image(long_bytes)
        print("✅ [TEST] Ảnh Webtoon dài (800x2000) đã PASS tiền xử lý thành công!")
        
        # Test thuật toán Dynamic Overlap Slicing & Stitching
        import numpy as np
        from image_utils import slice_webtoon_image, stitch_webtoon_chunks
        
        img_np = np.array(processed_webtoon)
        mask_np = np.zeros(img_np.shape[:2], dtype=np.uint8)
        
        chunks = slice_webtoon_image(img_np, mask_np, chunk_height=1000)
        assert len(chunks) > 1, "Webtoon phải được chia thành nhiều đoạn!"
        
        stitched = stitch_webtoon_chunks(chunks, img_np.shape)
        assert stitched.shape == img_np.shape, "Kích thước ảnh ghép lại phải trùng khớp tuyệt đối!"
        print(f"✅ [TEST] Thuật toán Dynamic Overlap Slicing & Stitching thành công ({len(chunks)} chunks, shape: {stitched.shape})!")
    except Exception as e:
        print(f"❌ [TEST ERROR] Ảnh Webtoon gặp lỗi trong quá trình xử lý: {e}")
        return False

    print("🎉 [TEST SUCCESS] Tất cả các kịch bản kiểm thử đã vượt qua hoàn hảo!")
    return True

if __name__ == "__main__":
    run_tests()
