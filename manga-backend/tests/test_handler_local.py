import base64
import os
import json

def main():
    image_path = "test_image.png"
    if not os.path.exists(image_path) and os.path.exists("tests/dummy_test_page.png"):
        image_path = "tests/dummy_test_page.png"
    if not os.path.exists(image_path):
        print(f"Error: {image_path} not found. Using mock image...")
        base64_string = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    else:
        with open(image_path, "rb") as f:
            base64_string = base64.b64encode(f.read()).decode("utf-8")

    mock_event = {"input": {"image_base64": base64_string, "action": "translate", "task_type": "clean_only"}}

    try:
        print("Importing handler from handler.py...")
        from handler import handler
        
        print("Executing handler with detect_and_ocr_only...")
        result = handler(mock_event)
        
        print("Result:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    except ImportError as e:
        print(f"ImportError occurred: {e}")
        print("Please check that all dependencies (manga_ocr, comic_text_detector, etc.) are installed and sys.path is correct.")
    except FileNotFoundError as e:
        print(f"FileNotFoundError occurred: {e}")
        print("Please check that your model files exist in the expected directories.")
    except Exception as e:
        print(f"An unexpected exception occurred: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
