import cv2
import numpy as np
import httpx
from fastapi import HTTPException

async def fetch_image_from_url(url: str, flags: int = cv2.IMREAD_COLOR) -> np.ndarray:
    """
    Streams the binary data from the given S3/presigned URL directly into memory,
    and decodes it into an OpenCV image matrix in RAM.
    No local disk I/O is performed.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, follow_redirects=True)
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Image not found at S3 URL: {url}")
            response.raise_for_status()
            content = response.content
            
        nparr = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(nparr, flags)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image format or failed to decode image.")
        return img
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"HTTP error occurred while fetching image: {exc.response.reason_phrase}"
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Network error occurred while fetching image: {str(exc)}"
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error while processing image from URL: {str(exc)}"
        )
