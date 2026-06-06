import pytoshop
from pytoshop.user import nested_layers
from pytoshop import enums
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import os

# 🚀 1. BẢNG ÁNH XẠ ĐỒNG BỘ 15 FONT HỆ THỐNG (Sếp nhớ bỏ các file .ttf vào thư mục 'fonts')
FONT_MAP = {
    # Thoại thường (Dialogue)
    "Comic Neue": "fonts/ComicNeue-Bold.ttf",
    "Playpen Sans": "fonts/PlaypenSans-Bold.ttf",
    "Itim": "fonts/Itim-Regular.ttf",
    "Be Vietnam Pro": "fonts/BeVietnamPro-Bold.ttf",
    # Suy nghĩ (Monologue)
    "Patrick Hand": "fonts/PatrickHand-Regular.ttf",
    "Balsamiq Sans": "fonts/BalsamiqSans-Bold.ttf",
    "Playwrite VN": "fonts/PlaywriteVN-Regular.ttf",
    "Caveat": "fonts/Caveat-Bold.ttf",
    # La hét (Shouting)
    "Bangers": "fonts/Bangers-Regular.ttf",
    "Bungee": "fonts/Bungee-Regular.ttf",
    "Sedgwick Ave Display": "fonts/SedgwickAveDisplay-Regular.ttf",
    "Fredoka": "fonts/Fredoka-Bold.ttf",
    # Hiệu ứng (SFX)
    "Caveat Brush": "fonts/CaveatBrush-Regular.ttf",
    "Rubik Wet Paint": "fonts/RubikWetPaint-Regular.ttf",
    "Rubik Glitch": "fonts/RubikGlitch-Regular.ttf",
    "Wild Words": "fonts/WildWords-Bold.ttf"
}

def wrap_text(text: str, font, max_width: int):
    """Thuật toán tự động ngắt dòng thông minh dựa trên độ rộng tối đa của ô thoại"""
    lines = []
    for paragraph in text.split('\n'):
        words = paragraph.split(' ')
        current_line = []
        for word in words:
            test_line = ' '.join(current_line + [word]) if current_line else word
            bbox = font.getbbox(test_line) # (left, top, right, bottom)
            w = bbox[2] - bbox[0]
            if w <= max_width:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                    current_line = [word]
                else:
                    lines.append(word)
        if current_line:
            lines.append(' '.join(current_line))
    return lines

def create_manga_psd(raw_img_path: str, clean_img_path: str, output_psd_path: str, bubbles: list):
    """
    Bản vá tối thượng: Xuất PSD phân tầng chữ riêng biệt, tự ngắt dòng và giữ nguyên stroke
    """
    # Khởi tạo ảnh nền
    raw_img = Image.open(raw_img_path).convert("RGBA")
    clean_img = Image.open(clean_img_path).convert("RGBA")

    raw_array = np.asarray(raw_img, dtype=np.uint8)
    clean_array = np.asarray(clean_img, dtype=np.uint8)

    h, w = raw_array.shape[:2]

    def build_layer_rgba(name, img_array):
        channels_dict = {
            0: img_array[:, :, 0], 1: img_array[:, :, 1], 
            2: img_array[:, :, 2], -1: img_array[:, :, 3]
        }
        return nested_layers.Image(
            name=name, visible=True, opacity=255,
            top=0, left=0, bottom=h, right=w,
            channels=channels_dict 
        )

    layer_raw = build_layer_rgba("[1] Raw (Ban Goc)", raw_array)
    layer_clean = build_layer_rgba("[2] Clean (Da Xoa Chu)", clean_array)

    # 🚀 2. DỰNG MẢNG THÀNH PHẦN CHO NHÓM LAYER CHỮ
    text_layers_list = []

    for idx, bubble in enumerate(bubbles):
        bubble_w = max(20, int(bubble.get('w', 100)))
        bubble_h = max(20, int(bubble.get('h', 100)))
        bx = int(bubble.get('x', 0))
        by = int(bubble.get('y', 0))
        text_content = bubble.get('text', '').strip()

        if not text_content:
            continue

        # Tạo ảnh trong suốt vừa khít diện tích ô thoại để tối ưu dung lượng PSD
        txt_img = Image.new("RGBA", (bubble_w, bubble_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(txt_img)

        # Lấy Font chuẩn từ FONT_MAP
        font_family = bubble.get('fontFamily', 'Comic Neue').replace("'", "")
        font_path = FONT_MAP.get(font_family, "fonts/ComicNeue-Bold.ttf")
        font_size = int(bubble.get('fontSize', 24))

        try:
            font = ImageFont.truetype(font_path, font_size)
        except Exception:
            font = ImageFont.load_default()

        # Thực hiện rớt dòng dựa trên chiều rộng ô thoại
        lines = wrap_text(text_content, font, bubble_w)

        # Tính toán chiều cao khối chữ để căn giữa chiều dọc (Vertical Center Alignment)
        line_heights = []
        for line in lines:
            bbox = font.getbbox(line)
            line_heights.append(max(font_size, bbox[3] - bbox[1]))
        
        total_text_height = sum(line_heights) + (len(lines) - 1) * 4
        current_y = (bubble_h - total_text_height) // 2

        # Vẽ từng dòng chữ kèm Stroke lên ảnh tạm
        for i, line in enumerate(lines):
            bbox = font.getbbox(line)
            lw = bbox[2] - bbox[0]
            
            # Căn lề ngang (Horizontal Alignment)
            align = bubble.get('textAlign', 'center')
            if align == 'center':
                current_x = (bubble_w - lw) // 2
            elif align == 'right':
                current_x = bubble_w - lw
            else:
                current_x = 0

            # Tiến hành vẽ chữ kèm viền (Stroke)
            draw.text(
                (current_x, current_y),
                line,
                fill=bubble.get('fontColor', '#000000'),
                font=font,
                stroke_width=int(bubble.get('outlineWidth', 0)),
                stroke_fill=bubble.get('outlineColor', '#ffffff')
            )
            current_y += line_heights[i] + 4

        # Chuyển đổi sang định dạng Channels của Pytoshop
        txt_array = np.asarray(txt_img, dtype=np.uint8)
        txt_channels = {
            0: txt_array[:, :, 0], 1: txt_array[:, :, 1],
            2: txt_array[:, :, 2], -1: txt_array[:, :, 3]
        }

        # Tạo Layer riêng biệt cho từng ô thoại
        layer_name = f"Thoai {str(idx+1).padStart(2, '0')} [{text_content[:10]}...]"
        bubble_layer = nested_layers.Image(
            name=layer_name, visible=True, opacity=255,
            top=by, left=bx, bottom=by + bubble_h, right=bx + bubble_w,
            channels=txt_channels
        )
        text_layers_list.append(bubble_layer)

    # Đề phòng nếu không có chữ nào thì chèn layer ảo chống lỗi group rỗng
    if not text_layers_list:
        dummy_pixel = np.zeros((1, 1, 4), dtype=np.uint8)
        dummy_channels = {0: dummy_pixel[:,:,0], 1: dummy_pixel[:,:,1], 2: dummy_pixel[:,:,2], -1: dummy_pixel[:,:,3]}
        text_layers_list.append(nested_layers.Image(name="Trong", channels=dummy_channels, top=0, left=0, bottom=1, right=1, visible=False))

    # Gộp toàn bộ vào group Text
    layer_text_group = nested_layers.Group(
        name="[3] Text (Tu Dong)",
        layers=text_layers_list
    )

    # Xuất ra cấu trúc file PSD hoàn chỉnh
    psd_structure = [layer_text_group, layer_clean, layer_raw]
    with open(output_psd_path, 'wb') as f:
        pytoshop.user.nested_layers.write_nested_layers(f, psd_structure, color_mode=enums.ColorMode.rgba)