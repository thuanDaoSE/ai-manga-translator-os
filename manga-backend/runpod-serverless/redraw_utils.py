import cv2
import numpy as np

def pad_to_modulo(img, modulo=32, is_mask=False):
    H, W = img.shape[:2]
    pad_h = (modulo - (H % modulo)) % modulo
    pad_w = (modulo - (W % modulo)) % modulo
    if pad_h == 0 and pad_w == 0:
        return img
    if is_mask:
        return cv2.copyMakeBorder(img, 0, pad_h, 0, pad_w, cv2.BORDER_CONSTANT, value=0.0)
    else:
        return cv2.copyMakeBorder(img, 0, pad_h, 0, pad_w, cv2.BORDER_REFLECT)

def apply_laplacian_pyramid_blend(orig_img, gen_img, mask, num_levels=6):
    """
    Đã được viết lại thành Feathered Alpha Blending để bảo toàn hạt Screentone Manga.
    (Giữ nguyên tên hàm để tương thích với handler_redraw.py)
    """
    # Đảm bảo mask là grayscale (H, W)
    if len(mask.shape) > 2:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
        
    # Làm mềm viền mask (Feathering) bằng GaussianBlur nhẹ (Kernel 5x5 hoặc 7x7)
    # Giúp vùng chuyển giao không bị gắt mà không làm nát screentone bên trong
    blurred_mask = cv2.GaussianBlur(mask, (7, 7), 0)
    
    # Chuyển mask về dải [0.0, 1.0] và mở rộng thành 3 kênh màu (H, W, 3)
    alpha = blurred_mask.astype(float) / 255.0
    alpha = np.expand_dims(alpha, axis=-1)
    
    # Ép kiểu ảnh về float để tính toán
    orig_f = orig_img.astype(float)
    gen_f = gen_img.astype(float)
    
    # Alpha compositing: Trộn ảnh
    blended_f = (gen_f * alpha) + (orig_f * (1.0 - alpha))
    
    # Chuyển ngược về uint8
    return np.clip(blended_f, 0, 255).astype(np.uint8)
