import io
from PIL import Image
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

    # 2. Tạo ảnh cực dài / Webtoon (Tỷ lệ 800x2000, aspect ratio = 2.5 > 2.2) -> Phải BỊ CHẶN (HTTP 400)
    long_img = Image.new("RGB", (800, 2000), (255, 255, 255))
    long_buffer = io.BytesIO()
    long_img.save(long_buffer, format="JPEG")
    long_bytes = long_buffer.getvalue()

    try:
        preprocess_image(long_bytes)
        print("❌ [TEST ERROR] Ảnh dài (800x2000) không bị chặn! Thử nghiệm thất bại!")
        return False
    except HTTPException as he:
        if he.status_code == 400 and "Webtoon" in he.detail:
            print(f"✅ [TEST] Ảnh dài (800x2000) đã BỊ CHẶN thành công! Lời nhắn lỗi: \"{he.detail}\"")
        else:
            print(f"❌ [TEST ERROR] Ảnh dài bị chặn nhưng sai mã lỗi hoặc thông điệp: {he.detail}")
            return False

    print("🎉 [TEST SUCCESS] Tất cả các kịch bản kiểm thử đã vượt qua hoàn hảo!")
    return True

if __name__ == "__main__":
    run_tests()
