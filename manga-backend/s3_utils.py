import cv2
import numpy as np
import httpx
import os
import boto3
import asyncio
from botocore.config import Config
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

def upload_to_r2_sync(file_bytes: bytes, filename: str, content_type: str) -> str:
    """
    Synchronous helper to upload bytes to Cloudflare R2 using boto3.
    Strict Rule 1: Uses exactly the environment variables requested.
    Strict Rule 3: Do not pass any ACL like public-read.
    """
    access_key = os.getenv("R2_ACCESS_KEY")
    secret_key = os.getenv("R2_SECRET_KEY")
    endpoint_url = os.getenv("R2_ENDPOINT_URL")
    bucket_name = os.getenv("R2_BUCKET_NAME")
    public_domain = os.getenv("R2_PUBLIC_DOMAIN")
    
    if not all([access_key, secret_key, endpoint_url, bucket_name, public_domain]):
        raise ValueError("Missing Cloudflare R2 configurations in environment variables")
        
    s3_client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(
            signature_version="s3v4",
            s3={'addressing_style': 'path'}
        ),
    )
    
    # Upload the file - Do not pass ACL (Rule 3)
    s3_client.put_object(
        Bucket=bucket_name,
        Key=filename,
        Body=file_bytes,
        ContentType=content_type
    )
    
    # Rule 2: URL Construction (No Presigned URLs)
    # Simply concatenate the public domain with the filename
    if public_domain.endswith("/"):
        public_url = f"{public_domain}{filename}"
    else:
        public_url = f"{public_domain}/{filename}"
        
    return public_url

def delete_from_r2_sync(filename: str) -> None:
    """
    Synchronous helper to delete an object from Cloudflare R2.
    """
    access_key = os.getenv("R2_ACCESS_KEY")
    secret_key = os.getenv("R2_SECRET_KEY")
    endpoint_url = os.getenv("R2_ENDPOINT_URL")
    bucket_name = os.getenv("R2_BUCKET_NAME")
    
    if not all([access_key, secret_key, endpoint_url, bucket_name]):
        print("⚠️ [R2] Missing keys. Skipping deletion.")
        return
        
    s3_client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(s3={'addressing_style': 'path'}),
    )
    try:
        s3_client.delete_object(Bucket=bucket_name, Key=filename)
        print(f"🗑️ [R2] Deleted object {filename} from bucket.")
    except Exception as e:
        print(f"⚠️ [R2] Failed to delete {filename}: {e}")

async def upload_to_r2(file_bytes: bytes, filename: str, content_type: str) -> str:
    """
    Asynchronously uploads file to Cloudflare R2 in a worker thread.
    """
    return await asyncio.to_thread(upload_to_r2_sync, file_bytes, filename, content_type)

async def delete_from_r2(filename: str) -> None:
    """
    Asynchronously deletes file from Cloudflare R2 in a worker thread.
    """
    await asyncio.to_thread(delete_from_r2_sync, filename)

def get_presigned_put_url_sync(filename: str, content_type: str, expiration: int = 3600) -> str:
    """
    Synchronously generates a presigned PUT URL for Cloudflare R2.
    """
    access_key = os.getenv("R2_ACCESS_KEY")
    secret_key = os.getenv("R2_SECRET_KEY")
    endpoint_url = os.getenv("R2_ENDPOINT_URL")
    bucket_name = os.getenv("R2_BUCKET_NAME")
    
    if not all([access_key, secret_key, endpoint_url, bucket_name]):
        raise ValueError("Missing Cloudflare R2 configurations in environment variables")
        
    s3_client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(
            signature_version="s3v4",
            s3={'addressing_style': 'path'}
        ),
    )
    
    presigned_url = s3_client.generate_presigned_url(
        ClientMethod='put_object',
        Params={
            'Bucket': bucket_name,
            'Key': filename,
            'ContentType': content_type
        },
        ExpiresIn=expiration
    )
    return presigned_url

async def get_presigned_put_url(filename: str, content_type: str, expiration: int = 3600) -> str:
    """
    Asynchronously generates a presigned PUT URL for Cloudflare R2 in a worker thread.
    """
    return await asyncio.to_thread(get_presigned_put_url_sync, filename, content_type, expiration)

