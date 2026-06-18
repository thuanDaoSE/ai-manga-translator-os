import sys
import os
import json
import asyncio
import base64
from unittest.mock import patch, MagicMock
import httpx
import cv2
import numpy as np

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app, get_current_user_id
app.dependency_overrides[get_current_user_id] = lambda: "mock_user_id"

async def run_tests():
    # Setup transport
    transport = httpx.ASGITransport(app=app)
    
    # Generate a 10x10 valid PNG dynamically
    img = np.zeros((10, 10, 3), dtype=np.uint8)
    _, buffer = cv2.imencode('.png', img)
    tiny_png = buffer.tobytes()
    tiny_png_b64 = base64.b64encode(tiny_png).decode("utf-8")
    
    # Mock boto3 client for Cloudflare R2 uploads & deletions
    mock_s3_client = MagicMock()
    mock_s3_client.put_object.return_value = {}
    mock_s3_client.delete_object.return_value = {}
    
    # Mock Kie.ai responses
    kie_create_resp = MagicMock()
    kie_create_resp.status_code = 200
    kie_create_resp.json.return_value = {"taskId": "mock_task_id"}
    
    kie_poll_resp = MagicMock()
    kie_poll_resp.status_code = 200
    kie_poll_resp.json.return_value = {
        "state": "success",
        "data": {
            "resultJson": '{"resultUrls": ["http://mock-kie-result/img.png"]}'
        }
    }
    
    kie_dl_resp = MagicMock()
    kie_dl_resp.status_code = 200
    kie_dl_resp.content = tiny_png

    # Mock DeepSeek response
    deepseek_resp = MagicMock()
    deepseek_resp.status_code = 200
    deepseek_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": '{"translations": ["Xin chào"]}'
                }
            }
        ]
    }

    # Mock RunPod response (now returns mask_base64)
    runpod_resp = MagicMock()
    runpod_resp.status_code = 200
    runpod_resp.json.return_value = {
        "status": "COMPLETED",
        "output": {
            "boxes": [{"x1": 2, "y1": 2, "x2": 8, "y2": 8}],
            "texts": ["こんにちは"],
            "mask_base64": tiny_png_b64
        }
    }

    original_post = httpx.AsyncClient.post
    original_get = httpx.AsyncClient.get

    async def mock_post_func(self, url, *args, **kwargs):
        url_str = str(url)
        if "/api/v1/ai-process" in url_str:
            return await original_post(self, url, *args, **kwargs)
        elif "runpod" in url_str or "mock-runpod" in url_str:
            json_payload = kwargs.get("json") or {}
            input_data = json_payload.get("input") or {}
            action = input_data.get("action")
            if action == "detect_and_ocr_only":
                return runpod_resp
            else:
                redraw_resp = MagicMock()
                redraw_resp.status_code = 200
                redraw_resp.json.return_value = {
                    "status": "COMPLETED",
                    "output": {
                        "clean_image_base64": tiny_png_b64
                    }
                }
                return redraw_resp
        elif "kie.ai" in url_str and "createTask" in url_str:
            return kie_create_resp
        elif "deepseek" in url_str:
            return deepseek_resp
        raise ValueError(f"Mock POST got unexpected URL: {url_str}")

    async def mock_get_func(self, url, *args, **kwargs):
        url_str = str(url)
        if "recordInfo" in url_str:
            return kie_poll_resp
        elif "mock-kie-result" in url_str:
            return kie_dl_resp
        return await original_get(self, url, *args, **kwargs)

    # Patch boto3.client and httpx methods globally during test execution
    with patch("boto3.client", return_value=mock_s3_client), \
         patch("httpx.AsyncClient.post", new=mock_post_func), \
         patch("httpx.AsyncClient.get", new=mock_get_func), \
         patch("main.check_and_deduct_credits", return_value=MagicMock()), \
         patch("main.refund_credits", return_value=MagicMock()), \
         patch("main.DISABLE_LOCAL_NSFW", False):

        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            print("--- Testing NSFW Text Validation ---")
            with patch("main.check_image_nsfw", return_value=False):
                response = await client.post(
                    "/api/v1/ai-process",
                    data={"prompt": "draw something hentai"},
                    files={"image": ("test.png", tiny_png, "image/png")}
                )
                assert response.status_code == 200
                lines = response.text.split("\n\n")
                data_lines = [l for l in lines if l.startswith("data: ")]
                assert len(data_lines) > 0
                
                event_1 = json.loads(data_lines[0][6:])
                assert event_1["status"] == "image_nsfw_passed"
                event_2 = json.loads(data_lines[1][6:])
                assert event_2["status"] == "error"
                assert "NSFW" in event_2["message"]
                print("NSFW text validation test passed!")

            print("--- Testing NSFW Image Rejection ---")
            with patch("main.check_image_nsfw", return_value=True):
                response = await client.post(
                    "/api/v1/ai-process",
                    data={"prompt": "draw manga background"},
                    files={"image": ("test.png", tiny_png, "image/png")}
                )
                assert response.status_code == 200
                lines = response.text.split("\n\n")
                data_lines = [l for l in lines if l.startswith("data: ")]
                assert len(data_lines) > 0
                event = json.loads(data_lines[0][6:])
                assert event["status"] == "error"
                assert "nhạy cảm" in event["message"]
                print("NSFW image rejection test passed!")

            print("--- Testing Successful Process Flow ---")
            with patch("main.check_image_nsfw", return_value=False):
                response = await client.post(
                    "/api/v1/ai-process",
                    data={"prompt": "draw manga background"},
                    files={"image": ("test.png", tiny_png, "image/png")}
                )
                assert response.status_code == 200
                lines = response.text.split("\n\n")
                data_lines = [l for l in lines if l.startswith("data: ")]
                
                statuses = []
                events = []
                for line in data_lines:
                    event = json.loads(line[6:])
                    events.append(event)
                    statuses.append(event.get("status"))
                    
                print("Received events:", events)
                assert "image_nsfw_passed" in statuses
                assert "nsfw_passed" in statuses
                assert "text_detected" in statuses
                assert "image_ready" in statuses
                assert "translation_ready" in statuses
                print("Successful process flow test passed!")

            print("--- Testing RunPod OCR Bypass Flow ---")
            async def mock_post_bypass_func(self, url, *args, **kwargs):
                url_str = str(url)
                if "/api/v1/ai-process" in url_str:
                    return await original_post(self, url, *args, **kwargs)
                elif "runpod" in url_str or "mock-runpod" in url_str:
                    json_payload = kwargs.get("json") or {}
                    input_data = json_payload.get("input") or {}
                    action = input_data.get("action")
                    if action == "detect_and_ocr_only":
                        raise AssertionError("RunPod OCR detection should NOT be called when existing_bubbles are provided!")
                    redraw_resp = MagicMock()
                    redraw_resp.status_code = 200
                    redraw_resp.json.return_value = {
                        "status": "COMPLETED",
                        "output": {
                            "clean_image_base64": tiny_png_b64
                        }
                    }
                    return redraw_resp
                elif "kie.ai" in url_str and "createTask" in url_str:
                    return kie_create_resp
                elif "deepseek" in url_str:
                    return deepseek_resp
                raise ValueError(f"Mock POST got unexpected URL: {url_str}")

            with patch("httpx.AsyncClient.post", new=mock_post_bypass_func), patch("main.check_image_nsfw", return_value=False):
                existing_bubbles_json = json.dumps([
                    {"x": 10, "y": 20, "w": 30, "h": 40, "japanese": "テスト", "vietnamese": "test"}
                ])
                response = await client.post(
                    "/api/v1/ai-process",
                    data={
                        "prompt": "draw manga background",
                        "existing_bubbles": existing_bubbles_json
                    },
                    files={"image": ("test.png", tiny_png, "image/png")}
                )
                assert response.status_code == 200
                lines = response.text.split("\n\n")
                data_lines = [l for l in lines if l.startswith("data: ")]
                
                statuses = []
                events = []
                for line in data_lines:
                    event = json.loads(line[6:])
                    events.append(event)
                    statuses.append(event.get("status"))
                    
                print("Bypass flow received events:", events)
                assert "image_nsfw_passed" in statuses
                assert "nsfw_passed" in statuses
                assert "text_detected" in statuses
                
                # Verify coordinates were parsed correctly
                text_detected_event = next(e for e in events if e.get("status") == "text_detected")
                assert text_detected_event["boxes"] == [{"x1": 10, "y1": 20, "x2": 40, "y2": 60}]
                assert text_detected_event["texts"] == ["テスト"]
                
                assert "image_ready" in statuses
                assert "translation_ready" in statuses
                print("RunPod OCR bypass test passed!")

            print("--- Testing Kie.ai Timeout Flow ---")
            kie_poll_resp_timeout = MagicMock()
            kie_poll_resp_timeout.status_code = 200
            kie_poll_resp_timeout.json.return_value = {
                "state": "processing"
            }
            
            async def mock_get_timeout_func(self, url, *args, **kwargs):
                url_str = str(url)
                if "recordInfo" in url_str:
                    return kie_poll_resp_timeout
                return await original_get(self, url, *args, **kwargs)

            with patch("httpx.AsyncClient.get", new=mock_get_timeout_func), \
                 patch("main.KIE_POLLING_TIMEOUT", 0.1), \
                 patch("main.check_image_nsfw", return_value=False):
                     
                response = await client.post(
                    "/api/v1/ai-process",
                    data={"prompt": "draw manga background", "translation_mode": "studio"},
                    files={"image": ("test.png", tiny_png, "image/png")}
                )
                assert response.status_code == 200
                lines = response.text.split("\n\n")
                data_lines = [l for l in lines if l.startswith("data: ")]
                
                statuses = []
                events = []
                for line in data_lines:
                    event = json.loads(line[6:])
                    events.append(event)
                    statuses.append(event.get("status"))
                
                print("Received events during timeout:", events)
                assert "image_failed" in statuses
                failed_event = next(e for e in events if e.get("status") == "image_failed")
                assert "quá thời gian" in failed_event["error"]
                assert "không đạt yêu cầu" in failed_event["error"]
                print("Timeout flow test passed!")


            print("--- Testing resize_image_cv2 Helper Function ---")
            from main import resize_image_cv2
            
            # 2. Call resize_image_cv2 to scale it to 20x30
            resized_b64 = resize_image_cv2(tiny_png_b64, 20, 30)
            
            # 3. Decode the result and verify its dimensions
            resized_bytes = base64.b64decode(resized_b64)
            nparr = np.frombuffer(resized_bytes, np.uint8)
            img_resized = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
            
            assert img_resized is not None
            h, w = img_resized.shape[:2]
            assert w == 20
            assert h == 30
            print(f"resize_image_cv2 helper function test passed! (Resized from 10x10 to {w}x{h})")

if __name__ == "__main__":
    os.environ["RUNPOD_API_KEY"] = "mock_key"
    os.environ["RUNPOD_ENDPOINT_URL"] = "http://mock-runpod/run"
    os.environ["KIE_API_KEY"] = "mock_key"
    os.environ["DEEPSEEK_API_KEY"] = "mock_key"
    os.environ["R2_ACCESS_KEY"] = "mock_r2_access"
    os.environ["R2_SECRET_KEY"] = "mock_r2_secret"
    os.environ["R2_ENDPOINT_URL"] = "https://mock-r2-endpoint.com"
    os.environ["R2_BUCKET_NAME"] = "mock-r2-bucket"
    os.environ["R2_PUBLIC_DOMAIN"] = "https://mock-r2-public-domain.com"
    
    asyncio.run(run_tests())
