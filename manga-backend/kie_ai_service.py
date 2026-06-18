import os
import io
import time
import httpx
import asyncio
from PIL import Image
from fastapi import HTTPException

class KieAIService:
    """
    Service to interact with Kie.ai Image generation APIs:
    - gpt-image-2-image-to-image
    - nano-banana-2
    - nano-banana-pro
    """
    def __init__(self):
        self.api_key = os.getenv("KIE_AI_API_KEY", "")
        self.base_url = "https://api.kie.ai/api/v1/jobs"
        if not self.api_key:
            print("⚠️ [KieAIService] KIE_AI_API_KEY is not set in the environment variables.")

    async def preprocess_image(self, file_bytes: bytes) -> bytes:
        """
        Check image file size (max 30MB) and convert transparent alpha channel (RGBA, LA, etc.) 
        to RGB on a white background. Saves the result as temporary PNG bytes.
        """
        # 30MB = 30 * 1024 * 1024 bytes
        if len(file_bytes) > 30 * 1024 * 1024:
            raise HTTPException(
                status_code=400, 
                detail="Dung lượng file tải lên quá lớn (tối đa 30MB)."
            )

        try:
            image = Image.open(io.BytesIO(file_bytes))
        except Exception as e:
            raise HTTPException(
                status_code=400, 
                detail=f"Tệp tin tải lên không phải là ảnh hợp lệ hoặc bị lỗi: {str(e)}"
            )

        # Handle Alpha Channel (RGBA, LA, P with transparency)
        if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
            # Create a solid white background layer
            white_bg = Image.new("RGB", image.size, (255, 255, 255))
            if image.mode == "P":
                image = image.convert("RGBA")
            # Paste transparent image onto the white background using its alpha channel as mask
            white_bg.paste(image, mask=image.split()[-1])
            image = white_bg
        else:
            if image.mode != "RGB":
                image = image.convert("RGB")

        # Save to PNG bytes
        out_io = io.BytesIO()
        image.save(out_io, format="PNG")
        return out_io.getvalue()

    async def createTask(
        self, 
        model: str, 
        image_url: str, 
        prompt: str, 
        resolution: str = "1K", 
        aspect_ratio: str = "auto", 
        output_format: str = "jpg"
    ) -> str:
        """
        Send job request to createTask (POST /api/v1/jobs/createTask).
        Maps parameters carefully based on the specified model.
        """
        if not self.api_key:
            raise HTTPException(
                status_code=500, 
                detail="KIE_AI_API_KEY chưa được cấu hình trên hệ thống máy chủ."
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        # Build prompt & settings parameters
        input_payload = {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution
        }

        # Map input image parameters based on docs
        if model == "gpt-image-2-image-to-image":
            input_payload["input_urls"] = [image_url]
        elif model == "google/nano-banana-edit":
            input_payload["image_urls"] = [image_url]
            input_payload["output_format"] = output_format.lower()
        else:
            # nano-banana-2 or nano-banana-pro
            input_payload["image_input"] = [image_url]
            input_payload["output_format"] = output_format.lower()

        payload = {
            "model": model,
            "input": input_payload
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/createTask", 
                    headers=headers, 
                    json=payload
                )
            except Exception as e:
                raise HTTPException(
                    status_code=500, 
                    detail=f"Lỗi kết nối tới Kie.ai API: {str(e)}"
                )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=500, 
                    detail=f"Kie.ai API trả về HTTP {response.status_code}: {response.text}"
                )

            res_data = response.json()
            if res_data.get("code") != 200:
                raise HTTPException(
                    status_code=500, 
                    detail=f"Kie.ai createTask API error: {res_data.get('msg')}"
                )

            task_id = res_data.get("data", {}).get("taskId")
            if not task_id:
                raise HTTPException(
                    status_code=500, 
                    detail="Kie.ai không trả về taskId hợp lệ."
                )

            return task_id

    async def pollTask(self, task_id: str) -> str:
        """
        Poll task status (GET /api/v1/jobs/recordInfo) every 3 seconds, timeout in 60s.
        """
        if not self.api_key:
            raise HTTPException(
                status_code=500, 
                detail="KIE_AI_API_KEY chưa được cấu hình."
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}"
        }
        url = f"{self.base_url}/recordInfo?taskId={task_id}"

        # 150s limit with 3s intervals = 50 attempts
        max_attempts = 50
        for attempt in range(max_attempts):
            await asyncio.sleep(3.0)
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(url, headers=headers)
                    if response.status_code != 200:
                        continue  # Retry on network error

                    res_data = response.json()
                    if res_data.get("code") != 200:
                        continue

                    job_data = res_data.get("data", {})
                    state = job_data.get("state")

                    if state == "success":
                        result_json_str = job_data.get("resultJson")
                        if not result_json_str:
                            raise HTTPException(
                                status_code=500, 
                                detail="Tác vụ thành công nhưng kết quả trống."
                            )

                        import json
                        result_data = json.loads(result_json_str)
                        urls = result_data.get("resultUrls", [])
                        if not urls:
                            raise HTTPException(
                                status_code=500, 
                                detail="Không tìm thấy URL của ảnh kết quả trong resultJson."
                            )
                        return urls[0]

                    elif state == "fail":
                        fail_code = job_data.get("failCode")
                        fail_msg = job_data.get("failMsg")
                        raise HTTPException(
                            status_code=500, 
                            detail=f"Tác vụ Kie.ai thất bại: {fail_msg} ({fail_code})"
                        )
            except HTTPException:
                raise
            except Exception as e:
                print(f"⚠️ [KieAIService Polling Attempt {attempt+1}] Error: {e}")

        # Timeout reached
        raise HTTPException(
            status_code=504, 
            detail="Thời gian chờ xử lý tác vụ trên Kie.ai đã hết hạn (Timeout 150s)."
        )

    async def postprocess_image(self, result_image_bytes: bytes, output_format: str) -> bytes:
        """
        Process output image by converting to requested format and applying compression.
        - PNG: save with optimize=True to reduce file size.
        - JPG: convert to RGB and save with quality=85.
        """
        try:
            image = Image.open(io.BytesIO(result_image_bytes))
        except Exception as e:
            raise HTTPException(
                status_code=500, 
                detail=f"Không thể mở ảnh kết quả trả về từ Kie.ai: {str(e)}"
            )

        out_io = io.BytesIO()
        fmt = output_format.upper()
        if fmt == "PNG":
            image.save(out_io, format="PNG", optimize=True)
        else:
            # Default to JPEG
            if image.mode != "RGB":
                image = image.convert("RGB")
            image.save(out_io, format="JPEG", quality=85)

        return out_io.getvalue()
