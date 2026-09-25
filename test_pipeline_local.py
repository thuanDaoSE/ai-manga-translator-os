import os
import sys
import time

backend_dir = r"D:\Workspaces\VSCode-workspace\AI_Manga_Translator\manga-backend"
sys.path.insert(0, backend_dir)
sys.path.insert(0, os.path.join(backend_dir, "comic_text_detector"))
os.chdir(backend_dir)

print("🔍 Testing Manga Translation Pipeline components locally...")

# 1. Test ComicTextDetector
try:
    print("1. Loading ComicTextDetector...")
    from worker import get_text_detector
    detector = get_text_detector()
    print("✅ ComicTextDetector loaded successfully!")
except Exception as e:
    print(f"❌ ComicTextDetector failed: {e}")

# 2. Test LaMa ONNX
try:
    print("2. Checking LaMa ONNX model...")
    lama_path = os.path.join(backend_dir, "weights", "lama-manga.onnx")
    if os.path.exists(lama_path):
        print(f"✅ lama-manga.onnx exists ({os.path.getsize(lama_path)} bytes)")
    else:
        print(f"❌ lama-manga.onnx missing at {lama_path}")
    from worker import get_lama_session
    session = get_lama_session()
    print(f"✅ LaMa ONNX Session loaded! Providers: {session.get_providers()}")
except Exception as e:
    print(f"❌ LaMa ONNX failed: {e}")

# 3. Test OCR Router
try:
    print("3. Testing OCR Router...")
    from ocr_router import OCRRouter
    ocr = OCRRouter.get_instance()
    print("✅ OCRRouter instance created!")
except Exception as e:
    print(f"❌ OCRRouter failed: {e}")

# 4. Test DeepSeek Client
try:
    print("4. Testing DeepSeek Client...")
    from worker import deepseek_client
    print(f"✅ DeepSeek client base_url: {deepseek_client.base_url}")
    # Quick ping test to DeepSeek
    resp = deepseek_client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": "ping"}],
        max_tokens=5
    )
    print(f"✅ DeepSeek response: {resp.choices[0].message.content}")
except Exception as e:
    print(f"❌ DeepSeek call failed: {e}")

print("🎉 Test completed!")
