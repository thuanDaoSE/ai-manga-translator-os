import pytoshop
from pytoshop.user import nested_layers
from pytoshop import enums
from PIL import Image
import numpy as np

def create_manga_psd(raw_img_path: str, clean_img_path: str, output_psd_path: str):
    """
    Bản chuẩn cuối cùng: 
    - Dùng RGBA để Pytoshop không bị lỗi 'tobytes'.
    - TUYỆT ĐỐI KHÔNG can thiệp mask_data để Photopea không bị đen màn hình.
    """
    # 1. Bắt buộc dùng RGBA (Có kênh Alpha)
    raw_img = Image.open(raw_img_path).convert("RGBA")
    clean_img = Image.open(clean_img_path).convert("RGBA")

    raw_array = np.asarray(raw_img, dtype=np.uint8)
    clean_array = np.asarray(clean_img, dtype=np.uint8)

    h, w = raw_array.shape[:2]

    def build_layer_rgba(name, img_array):
        # Truyền đủ 4 kênh R, G, B, Alpha(-1)
        channels_dict = {
            0: img_array[:, :, 0],   
            1: img_array[:, :, 1],   
            2: img_array[:, :, 2],   
            -1: img_array[:, :, 3]   
        }
        return nested_layers.Image(
            name=name, visible=True, opacity=255,
            top=0, left=0, bottom=h, right=w,
            channels=channels_dict 
        )

    # 2. Xây dựng 2 Layer Ảnh
    layer_raw = build_layer_rgba("[1] Raw (Ban Goc)", raw_array)
    layer_clean = build_layer_rgba("[2] Clean (Da Xoa Chu)", clean_array)

    # 3. Tạo Group Text bằng Pixel tàng hình (Cũng phải RGBA)
    dummy_pixel = np.zeros((1, 1, 4), dtype=np.uint8)
    dummy_channels = {
        0: dummy_pixel[:, :, 0], 1: dummy_pixel[:, :, 1], 
        2: dummy_pixel[:, :, 2], -1: dummy_pixel[:, :, 3]
    }
    dummy_layer = nested_layers.Image(
        name="Cam_Xoa_Layer_Nay", channels=dummy_channels,
        top=0, left=0, bottom=1, right=1, 
        visible=False, opacity=0 
    )

    layer_text_group = nested_layers.Group(
        name="[3] Text (Tu Dong)",
        layers=[dummy_layer], 
        visible=True, opacity=255, closed=False
    )

    # 4. Gom thành cấu trúc PSD và Xuất file
    # (Đã xóa toàn bộ vòng lặp Hack Mask ở đây)
    psd_structure = nested_layers.nested_layers_to_psd(
        [layer_text_group, layer_clean, layer_raw], # Đảo thứ tự ở đây sếp nhé!
        color_mode=enums.ColorMode.rgb,
        size=(w, h) 
    )
    
    with open(output_psd_path, 'wb') as f:
        psd_structure.write(f)
        
    return output_psd_path