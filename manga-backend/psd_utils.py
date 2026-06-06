import json
import subprocess
import os
import uuid

def create_manga_psd(raw_img_path: str, clean_img_path: str, output_psd_path: str, bubbles: list):
    """
    Python gói hàng -> Đẩy cho Node.js xuất PSD
    """
    payload = {
        "raw_img_path": raw_img_path,
        "clean_img_path": clean_img_path,
        "output_psd_path": output_psd_path,
        "bubbles": bubbles
    }
    
    # 1. Tạo file JSON tạm thời để truyền dữ liệu không giới hạn dung lượng
    temp_json = f"temp_psd_payload_{uuid.uuid4().hex}.json"
    
    try:
        with open(temp_json, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False)
            
        # 2. Ra lệnh cho Node.js chạy file JSON này
        # (Nó sẽ khóa luồng chạy của Python lại cho đến khi tạo xong file PSD)
        result = subprocess.run(
            ["node", "node_psd_generator.js", temp_json],
            capture_output=True,
            text=True,
            check=True
        )
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Lỗi khi Node.js xuất PSD: {e.stderr}")
        raise RuntimeError("Node.js fail: " + e.stderr)
        
    finally:
        # 3. Dọn rác (Xóa file JSON tạm) để bảo vệ ổ cứng
        if os.path.exists(temp_json):
            os.remove(temp_json)