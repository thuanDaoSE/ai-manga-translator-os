from PIL import Image
import io
from fastapi import HTTPException, status

def preprocess_image(file_bytes: bytes) -> Image.Image:
    """
    Tiền xử lý ảnh đầu vào:
    1. Đọc ảnh từ luồng byte.
    2. Kiểm tra nếu ảnh có kênh alpha (RGBA, LA) hoặc có transparency trong palette (P).
    3. Tự động tạo nền trắng, đè ảnh lên nền trắng, và chuyển về định dạng RGB (3 kênh).
    4. Raise HTTPException lỗi 400 nếu tệp tin rác hoặc không phải ảnh hợp lệ.
    """
    try:
        # Kiểm tra tính hợp lệ sơ bộ của file
        image = Image.open(io.BytesIO(file_bytes))
        image.verify()  # verify() sẽ raise exception nếu file hỏng/không phải ảnh
        
        # Vì verify() làm đóng con trỏ file, ta cần mở lại ảnh để thao tác tiếp
        image = Image.open(io.BytesIO(file_bytes))
        
        # 🛡️ CHỐT CHẶN BẢO VỆ: Ngăn chặn ảnh quá dài (Webtoon) gây quá tải VRAM / RAM
        w, h = image.size
        if w > 0:
            aspect_ratio = h / w
            if aspect_ratio > 2.2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Hệ thống hiện tại chưa hỗ trợ ảnh dạng cuộn dọc (Webtoon) để bảo vệ tài nguyên GPU. Vui lòng cắt nhỏ ảnh thành các trang đơn có tỷ lệ chiều cao/chiều rộng dưới 2.2 trước khi tải lên!"
                )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tệp tải lên không hợp lệ hoặc không phải định dạng ảnh được hỗ trợ: {str(e)}"
        )

    try:
        # Kiểm tra xem ảnh có kênh Alpha hoặc thông tin trong suốt không
        has_alpha = False
        if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
            has_alpha = True

        if has_alpha:
            # Tạo phông nền màu trắng cùng kích thước
            background = Image.new("RGBA", image.size, (255, 255, 255, 255))
            # Paste ảnh gốc lên nền trắng (sử dụng chính nó làm mặt nạ alpha nếu có)
            image_rgba = image.convert("RGBA")
            background.paste(image_rgba, (0, 0), image_rgba)
            # Chuyển đổi toàn bộ kết quả về RGB (3 kênh)
            processed_image = background.convert("RGB")
        else:
            # Nếu không có alpha, chỉ đơn giản là chuyển về RGB (đề phòng các mode Grayscale, v.v.)
            processed_image = image.convert("RGB") if image.mode != "RGB" else image

        return processed_image
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lỗi khi tiền xử lý ảnh: {str(e)}"
        )

def export_image(image_obj: Image.Image, format_type: str, optimize: bool = False) -> bytes:
    """
    Hậu xử lý & xuất file ảnh dưới dạng luồng bytes:
    1. Hỗ trợ xuất định dạng PNG (optimize=True có thể rất chậm, mặc định là False) để nén dung lượng mà không giảm chất lượng.
    2. Hỗ trợ xuất định dạng JPG/JPEG (quality=85, chuyển về RGB) để tối ưu băng thông.
    3. Raise HTTPException lỗi 400 nếu có lỗi xảy ra trong quá trình xuất file.
    """
    format_type = format_type.lower().strip()
    buffer = io.BytesIO()
    
    try:
        if format_type == "png":
            # Nén dung lượng không mất chất lượng (Lossless) (optimize=True chạy cực kỳ chậm trên ảnh lớn)
            image_obj.save(buffer, format="PNG", optimize=optimize)
        elif format_type in ("jpg", "jpeg"):
            # JPEG bắt buộc phải ở chế độ RGB (không hỗ trợ RGBA/LA)
            if image_obj.mode != "RGB":
                image_obj = image_obj.convert("RGB")
            image_obj.save(buffer, format="JPEG", quality=85)
        else:
            raise ValueError(f"Định dạng xuất '{format_type}' không được hỗ trợ. Chỉ cho phép 'png' hoặc 'jpg'/'jpeg'.")
        
        buffer.seek(0)
        return buffer.getvalue()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lỗi khi xuất file ảnh định dạng {format_type}: {str(e)}"
        )

def restore_original_dimensions(original_img_path_or_bytes, ai_result_img_bytes: bytes) -> bytes:
    """
    Khôi phục kích thước ảnh gốc (Ghi nhớ và Ép chuẩn kích thước):
    1. Lấy thông tin kích thước gốc (w_orig, h_orig) từ file path hoặc bytes.
    2. Đọc ảnh kết quả từ AI, lấy định dạng file gốc của nó.
    3. So sánh kích thước. Nếu có sự chênh lệch do dimension snapping của mô hình AI,
       tiến hành resize lại ảnh AI về đúng kích thước gốc dùng thuật toán LANCZOS chất lượng cao.
    4. Trả về bytes của ảnh kết quả đã được khôi phục kích thước chuẩn xác.
    """
    try:
        # 1. Đọc kích thước ảnh gốc
        if isinstance(original_img_path_or_bytes, str):
            with Image.open(original_img_path_or_bytes) as orig_img:
                orig_w, orig_h = orig_img.size
        elif isinstance(original_img_path_or_bytes, bytes):
            with Image.open(io.BytesIO(original_img_path_or_bytes)) as orig_img:
                orig_w, orig_h = orig_img.size
        else:
            raise ValueError("original_img_path_or_bytes phải là đường dẫn file (str) hoặc dữ liệu bytes.")

        # 2. Đọc ảnh kết quả từ AI
        ai_result_img = Image.open(io.BytesIO(ai_result_img_bytes))
        result_w, result_h = ai_result_img.size
        
        # Ghi nhớ format của ảnh kết quả AI trước khi thực hiện resize (vì resize sẽ xoá thuộc tính format)
        fmt = ai_result_img.format or "PNG"

        # 3. So sánh kích thước và tiến hành ép chuẩn (Resize) nếu cần thiết
        if orig_w != result_w or orig_h != result_h:
            print(f"⚠️ [DIMENSION SNAP DETECTED] Ảnh kết quả AI ({result_w}x{result_h}) lệch kích thước so với ảnh gốc ({orig_w}x{orig_h}). Tiến hành phục hồi...")
            
            # Sử dụng LANCZOS để đảm bảo độ sắc nét tốt nhất cho lineart/manga
            resized_img = ai_result_img.resize((orig_w, orig_h), Image.Resampling.LANCZOS)
            
            # Lưu lại ảnh sau khi đã resize về luồng byte
            buffer = io.BytesIO()
            resized_img.save(buffer, format=fmt)
            buffer.seek(0)
            return buffer.getvalue()

        # Nếu trùng khớp kích thước, giữ nguyên luồng bytes ban đầu
        return ai_result_img_bytes
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lỗi khi khôi phục kích thước ảnh gốc: {str(e)}"
        )
