import os
import sys
import shutil
import logging
from huggingface_hub import hf_hub_download, snapshot_download

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("download_models")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(BASE_DIR, "weights")
CTD_DIR = os.path.join(BASE_DIR, "comic_text_detector", "data")

os.makedirs(WEIGHTS_DIR, exist_ok=True)
os.makedirs(CTD_DIR, exist_ok=True)

def prepare_models():
    # 1. Tải Comic Text Detector (PyTorch weights)
    ctd_target = os.path.join(CTD_DIR, "comictextdetector.pt")
    ctd_alt = os.path.join(WEIGHTS_DIR, "comictextdetector.pt")
    if not os.path.exists(ctd_target) or os.path.getsize(ctd_target) < 1000000:
        logger.info("Chưa có comictextdetector.pt, đang tải từ Hugging Face (hhuggg/comictextdetector)...")
        p = hf_hub_download(repo_id="hhuggg/comictextdetector", filename="comictextdetector.pt", local_dir=CTD_DIR)
        shutil.copy2(p, ctd_alt)
        logger.info(f"✅ Đã tải comictextdetector.pt ({os.path.getsize(ctd_target)} bytes)")
    else:
        logger.info(f"✅ Comic Text Detector đã sẵn sàng: {ctd_target}")

    # 2. Tải LaMa Manga Inpainting (ONNX weights)
    lama_target = os.path.join(WEIGHTS_DIR, "lama-manga.onnx")
    lama_alt = os.path.join(BASE_DIR, "lama-manga.onnx")
    if not os.path.exists(lama_target) or os.path.getsize(lama_target) < 1000000:
        logger.info("Chưa có lama-manga.onnx, đang tải từ Hugging Face (mayocream/lama-manga-onnx)...")
        p = hf_hub_download(repo_id="mayocream/lama-manga-onnx", filename="lama-manga.onnx", local_dir=WEIGHTS_DIR)
        shutil.copy2(p, lama_alt)
        logger.info(f"✅ Đã tải lama-manga.onnx ({os.path.getsize(lama_target)} bytes)")
    else:
        logger.info(f"✅ LaMa Manga đã sẵn sàng: {lama_target}")

    # 3. Pre-cache SOTA Multilingual Manga OCR (Hayai-OCR v2 + SigLIP 2 NaFlex)
    logger.info("Đang nạp trước Hayai-OCR v2 và SigLIP 2 NaFlex vào cache...")
    snapshot_download(repo_id="JustANormalTinkerer/hayai-ocr-v2", resume_download=True)
    snapshot_download(repo_id="google/siglip2-base-patch16-naflex", resume_download=True)
    logger.info("✅ Hayai-OCR v2 và SigLIP 2 đã nạp và lưu vào cache thành công!")

    # 4. Pre-cache FLUX.1 Schnell Diffusers Inpainting Model
    flux_model_id = os.getenv("FLUX_MODEL_ID", "YuCollection/FLUX.1-schnell-Diffusers")
    logger.info(f"Đang nạp trước mô hình FLUX ({flux_model_id}) vào cache...")
    flux_cache_dir = snapshot_download(
        repo_id=flux_model_id,
        resume_download=True,
        ignore_patterns=["*.jpeg", "*.png", "*.md"]
    )
    logger.info(f"✅ Mô hình FLUX ({flux_model_id}) đã nạp và lưu vào cache: {flux_cache_dir}")

    # Tạo symlink alias cho black-forest-labs/FLUX.1-schnell để hỗ trợ cả 2 tên gọi
    hf_hub_home = os.path.expanduser("~/.cache/huggingface/hub")
    bfl_alias = os.path.join(hf_hub_home, "models--black-forest-labs--FLUX.1-schnell")
    yu_path = os.path.join(hf_hub_home, "models--YuCollection--FLUX.1-schnell-Diffusers")
    if os.path.exists(yu_path) and not os.path.exists(bfl_alias):
        try:
            os.symlink(yu_path, bfl_alias)
            logger.info("✅ Đã tạo alias symlink cho black-forest-labs/FLUX.1-schnell -> YuCollection cache")
        except Exception as e:
            logger.warning(f"Không thể tạo symlink: {e}")

if __name__ == "__main__":
    logger.info("🚀 Bắt đầu quá trình nướng Model AI vào Docker Image...")
    prepare_models()
    logger.info("🎉 Hoàn tất chuẩn bị Model AI 100%!")
