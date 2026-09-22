import os
import sys
import urllib.request
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("download_models")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(BASE_DIR, "weights")
CTD_DIR = os.path.join(BASE_DIR, "comic_text_detector", "data")

os.makedirs(WEIGHTS_DIR, exist_ok=True)
os.makedirs(CTD_DIR, exist_ok=True)

MODELS = {
    "comictextdetector.pt": {
        "target": os.path.join(CTD_DIR, "comictextdetector.pt"),
        "alt_target": os.path.join(WEIGHTS_DIR, "comictextdetector.pt"),
        "url": "https://github.com/ogkalu2/comic-text-detector/releases/download/v1.0.1/comictextdetector.pt"
    },
    "lama-manga.onnx": {
        "target": os.path.join(WEIGHTS_DIR, "lama-manga.onnx"),
        "alt_target": os.path.join(BASE_DIR, "lama-manga.onnx"),
        "url": "https://huggingface.co/zyddnys/manga-image-translator/resolve/main/inpainting_lama_manga.onnx"
    }
}

def download_file(url: str, dest_path: str):
    logger.info(f"Đang tải {url} -> {dest_path}...")
    def report_hook(block_num, block_size, total_size):
        if total_size > 0:
            percent = min(100.0, block_num * block_size * 100.0 / total_size)
            if int(percent) % 20 == 0:
                sys.stdout.write(f"\rTải về: {percent:.1f}%")
                sys.stdout.flush()
    try:
        urllib.request.urlretrieve(url, dest_path, reporthook=report_hook)
        print()
        logger.info(f"✅ Đã tải thành công: {dest_path}")
    except Exception as e:
        logger.error(f"❌ Lỗi tải {url}: {e}")

def prepare_models():
    # 1. Kiểm tra và tải comic-text-detector
    for name, info in MODELS.items():
        primary = info["target"]
        alt = info.get("alt_target")
        
        # Nếu đã có ở alt, copy sang primary
        if alt and os.path.exists(alt) and not os.path.exists(primary):
            logger.info(f"Đã tìm thấy {name} tại {alt}, copy sang {primary}...")
            import shutil
            shutil.copy2(alt, primary)
            continue
            
        if not os.path.exists(primary):
            logger.info(f"Chưa có {name}, tiến hành tải từ mạng...")
            download_file(info["url"], primary)
        else:
            logger.info(f"✅ File {name} đã tồn tại sẵn tại {primary} (Kích thước: {os.path.getsize(primary)} bytes)")

    # 2. Pre-cache SOTA Multilingual Manga OCR (Hayai-OCR v2 + SigLIP 2 NaFlex)
    logger.info("Đang nạp trước Hayai-OCR v2 và SigLIP 2 NaFlex vào cache...")
    try:
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id="JustANormalTinkerer/hayai-ocr-v2", resume_download=True)
        snapshot_download(repo_id="google/siglip2-base-patch16-naflex", resume_download=True)
        logger.info("✅ Hayai-OCR v2 và SigLIP 2 đã nạp và lưu vào cache thành công!")
    except Exception as e:
        logger.warning(f"⚠️ Chưa thể tải trước Hayai-OCR v2 / SigLIP 2: {e}")

if __name__ == "__main__":
    logger.info("🚀 Bắt đầu quá trình nướng Model AI vào Docker Image...")
    prepare_models()
    logger.info("🎉 Hoàn tất chuẩn bị Model AI!")
