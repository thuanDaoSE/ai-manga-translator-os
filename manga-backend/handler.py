import runpod
import base64
import cv2
import numpy as np
import os
import torch
import onnxruntime as ort
import sys
import requests
from PIL import Image
from diffusers import StableDiffusionXLInpaintPipeline, AutoencoderKL
from redraw_utils import apply_laplacian_pyramid_blend

ENDPOINT_TYPE = os.getenv("RUNPOD_ENDPOINT_TYPE", "translate")
print(f"Khởi động AI Engine với ENDPOINT_TYPE: {ENDPOINT_TYPE}")

# Khai báo rỗng ban đầu cho tất cả các mô hình
mocr = None
text_detector = None
lama_session = None
sdxl_inpaint_pipeline = None

def get_sdxl_inpaint_pipeline():
    global sdxl_inpaint_pipeline
    if sdxl_inpaint_pipeline is None:
        model_dir = os.path.join(os.path.dirname(__file__), "models")
        pipeline_path = os.path.join(model_dir, "waifu-inpaint-xl")
        vae_path = os.path.join(model_dir, "sdxl-vae-fp16-fix")
        
        vae = None
        if os.path.exists(vae_path):
            print(f"Loading custom VAE from local directory: {vae_path}")
            vae = AutoencoderKL.from_pretrained(vae_path, torch_dtype=torch.float16)
        else:
            print("No custom VAE directory found, utilizing default VAE from the pipeline.")
            
        print(f"Loading Stable Diffusion XL Inpaint Pipeline from local directory: {pipeline_path}")
        if os.path.exists(pipeline_path):
            pipeline_kwargs = {
                "torch_dtype": torch.float16,
                "use_safetensors": True,
            }
            if vae is not None:
                pipeline_kwargs["vae"] = vae
                
            sdxl_inpaint_pipeline = StableDiffusionXLInpaintPipeline.from_pretrained(
                pipeline_path,
                **pipeline_kwargs
            )
            
            # VRAM safety optimization (Model CPU Offload + VAE Slicing)
            if torch.cuda.is_available():
                sdxl_inpaint_pipeline.enable_model_cpu_offload()
                sdxl_inpaint_pipeline.enable_vae_slicing()
            else:
                sdxl_inpaint_pipeline.to("cpu")
            print("Stable Diffusion XL Inpaint Pipeline initialized successfully.")
        else:
            print(f"⚠️ Warning: SDXL Inpaint directory {pipeline_path} not found.")
            
    return sdxl_inpaint_pipeline

# ----------------- NẠP MODEL THEO PHÂN LOẠI ENDPOINT -----------------
if ENDPOINT_TYPE == "translate":
    print("Initializing Translate/Erase/Scan Models (MangaOCR, CTD, LaMa ONNX)...")
    
    sys.path.append(os.path.join(os.path.dirname(__file__), "comic_text_detector"))
    from manga_ocr import MangaOcr
    from comic_text_detector.inference import TextDetector

    mocr = MangaOcr() 
    device = "cuda" if torch.cuda.is_available() else "cpu"
    text_detector = TextDetector(model_path=os.path.join(os.path.dirname(__file__), "comic_text_detector", "data", "comictextdetector.pt"), device=device)

    # 1. Persistent TensorRT Engine Cache Path next to ONNX model weights
    trt_cache_path = os.path.join(os.path.dirname(__file__), 'trt_cache')
    os.makedirs(trt_cache_path, exist_ok=True)

    device_providers = [
        ('TensorrtExecutionProvider', {
            'trt_engine_cache_enable': True,
            'trt_engine_cache_path': trt_cache_path
        }),
        'CUDAExecutionProvider',
        'CPUExecutionProvider'
    ]
    lama_session = ort.InferenceSession(os.path.join(os.path.dirname(__file__), "lama-manga.onnx"), providers=device_providers)

    # 2. Dynamic Axis Validation: Ensure the model input supports dynamic batch sizes
    try:
        input_shape = lama_session.get_inputs()[0].shape
        if len(input_shape) > 0 and input_shape[0] == 1:
            print("🚨 WARNING: LaMa ONNX model input dimension 0 is fixed to 1. Dynamic batched inference may fail.")
        else:
            print("✅ Dynamic axis validated. LaMa ONNX model supports dynamic batch sizes. Input shape: {}".format(input_shape))
    except Exception as e:
        print("⚠️ Dynamic axis validation check skipped: {}".format(e))

elif ENDPOINT_TYPE == "redraw":
    print("Initializing Redraw Models (SDXL Inpaint)...")
    # Pre-load the SDXL Inpaint pipeline at startup to warm up serverless container
    try:
        get_sdxl_inpaint_pipeline()
    except Exception as e:
        print(f"Failed to pre-load SDXL Inpaint pipeline at startup: {e}")


import math

def lama_inpaint_batched(img, mask, session, stride=256):
    """
    Runs LaMa ONNX model on any high-resolution image by slicing it into 512x512 tiles
    using numpy.lib.stride_tricks.sliding_window_view (zero-copy), performing
    batched GPU inference ONLY on active tiles containing mask/text pixels,
    and reconstructing the image with smooth blending.
    """
    H, W = img.shape[:2]
    win_h, win_w = 512, 512
    
    # Calculate padding and padded dimensions to fit exactly with window and stride
    num_tiles_h = math.ceil((H - win_h) / stride) + 1 if H > win_h else 1
    num_tiles_w = math.ceil((W - win_w) / stride) + 1 if W > win_w else 1
    
    H_pad = (num_tiles_h - 1) * stride + win_h
    W_pad = (num_tiles_w - 1) * stride + win_w
    
    pad_y = H_pad - H
    pad_x = W_pad - W
    
    # Pad image (reflect padding) and mask (constant padding)
    img_padded = cv2.copyMakeBorder(img, 0, pad_y, 0, pad_x, cv2.BORDER_REFLECT)
    mask_padded = cv2.copyMakeBorder(mask, 0, pad_y, 0, pad_x, cv2.BORDER_CONSTANT, value=0)
    
    # Prepare normalized float32 images and masks
    img_rgb = cv2.cvtColor(img_padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    mask_bin = (mask_padded > 0).astype(np.float32)
    
    # Zero-copy tiling using sliding_window_view
    from numpy.lib.stride_tricks import sliding_window_view
    
    # v_img shape: (num_tiles_h, num_tiles_w, 3, 512, 512)
    v_img = sliding_window_view(img_rgb, (512, 512), axis=(0, 1))[::stride, ::stride]
    # v_mask shape: (num_tiles_h, num_tiles_w, 512, 512)
    v_mask = sliding_window_view(mask_bin, (512, 512), axis=(0, 1))[::stride, ::stride]
    
    active_tiles_img = []
    active_tiles_mask = []
    active_tile_coords = []
    
    for i in range(num_tiles_h):
        for j in range(num_tiles_w):
            mask_tile = v_mask[i, j]
            # MLOps Fix 1: Compute Waste Avoidance (Skip blank tiles)
            if np.max(mask_tile) > 0:
                active_tiles_img.append(v_img[i, j])
                active_tiles_mask.append(mask_tile[np.newaxis, ...])
                active_tile_coords.append((i, j))
                
    # If no tiles contain mask pixels, return original image (saves GPU execution)
    if len(active_tiles_img) == 0:
        return img
        
    # Compile active tiles into contiguous NumPy batches
    batched_images = np.array(active_tiles_img, dtype=np.float32) # Shape: (B, 3, 512, 512)
    batched_masks = np.array(active_tiles_mask, dtype=np.float32)  # Shape: (B, 1, 512, 512)
    
    # Parallel Batched Inference on GPU
    # Call session.run EXACTLY ONCE
    ort_outs = session.run(None, {
        session.get_inputs()[0].name: batched_images,
        session.get_inputs()[1].name: batched_masks
    })
    
    # Transpose back from (B, 3, 512, 512) to (B, 512, 512, 3) (RGB)
    out_tiles = np.transpose(ort_outs[0], (0, 2, 3, 1))
    
    # Reconstruction with smooth blending to resolve overlapping areas
    accumulated_img = np.zeros(img_padded.shape, dtype=np.float32)
    accumulated_weight = np.zeros((img_padded.shape[0], img_padded.shape[1], 1), dtype=np.float32)
    
    # Create 2D blending weight mask
    ramp = np.minimum(np.arange(512) + 0.5, 512 - 0.5 - np.arange(512)) / 256.0
    ramp = np.clip(ramp, 0.0, 1.0)
    tile_weight = np.outer(ramp, ramp)[:, :, np.newaxis] # Shape: (512, 512, 1)
    
    # Only blend the active inpainted tiles back to their coordinates
    for b, (i, j) in enumerate(active_tile_coords):
        y_start = i * stride
        x_start = j * stride
        
        accumulated_img[y_start:y_start+512, x_start:x_start+512] += out_tiles[b] * tile_weight
        accumulated_weight[y_start:y_start+512, x_start:x_start+512] += tile_weight
        
    P_norm = accumulated_img / np.maximum(accumulated_weight, 1e-8)
    W_clipped = np.clip(accumulated_weight, 0.0, 1.0)
    
    # Blend inpainted regions with original image regions smoothly
    reconstructed_img = P_norm * W_clipped + img_rgb * (1.0 - W_clipped)
    
    # Crop back to original dimensions and restore to BGR uint8 format
    final_img = reconstructed_img[0:H, 0:W]
    final_img_bgr = cv2.cvtColor(np.clip(final_img * 255.0, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    return final_img_bgr

def extract_text_manga_ocr(crop_bgr):
    return mocr(Image.fromarray(cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB))).strip()

def handler(job):
    job_input = job['input']
    action = job_input.get('action', 'translate') # Mặc định là dịch nguyên trang

    # Kiểm tra tính hợp lệ của action dựa trên ENDPOINT_TYPE
    if ENDPOINT_TYPE == "redraw" and action != "redraw" and action != "ping":
        return {"status": "error", "message": f"Action '{action}' is not supported on Redraw endpoint."}
    if ENDPOINT_TYPE == "translate" and action == "redraw":
        return {"status": "error", "message": "Action 'redraw' is not supported on Translate endpoint."}

    # 🟢 1. LỆNH PING: Giữ máy luôn thức
    if action == 'ping':
        return {"status": "success", "message": "pong"}

    # 🟢 2. LỆNH SCAN: Chỉ quét chữ MangaOCR
    elif action == 'scan':
        image_url = job_input['image_url']
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
        image_array = np.frombuffer(response.content, np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        return {"status": "success", "text": extract_text_manga_ocr(image)}

    # 🟢 3. LỆNH ERASE: Chỉ xóa mảng nhỏ (LaMa)
    elif action == 'erase':
        image_url = job_input['image_url']
        mask_url = job_input['mask_url']
        
        response_img = requests.get(image_url, timeout=10)
        response_img.raise_for_status()
        crop_img = cv2.imdecode(np.frombuffer(response_img.content, np.uint8), cv2.IMREAD_COLOR)
        
        response_mask = requests.get(mask_url, timeout=10)
        response_mask.raise_for_status()
        crop_mask = cv2.imdecode(np.frombuffer(response_mask.content, np.uint8), cv2.IMREAD_GRAYSCALE)

        clean_crop = lama_inpaint_batched(crop_img, crop_mask, lama_session)

        _, buffer = cv2.imencode('.png', clean_crop)
        return {"status": "success", "clean_crop_base64": base64.b64encode(buffer).decode('utf-8')}

    # 🟢 3.5. LỆNH REDRAW: Vẽ lại vùng lớn bằng SDXL + Laplacian Pyramid Blending
    elif action == 'redraw':
        image_url = job_input['image_url']
        mask_url = job_input['mask_url']
        prompt = job_input['prompt']
        negative_prompt = job_input.get('negative_prompt', '')
        output_url = job_input['output_url']
        
        # Tải local SDXL inpaint pipeline
        pipeline = get_sdxl_inpaint_pipeline()
        if pipeline is None:
            raise Exception("Không thể load SDXL inpaint pipeline từ local directory.")
            
        # Fetch ảnh gốc và mask từ URL
        response_img = requests.get(image_url, timeout=15)
        response_img.raise_for_status()
        orig_img_bgr = cv2.imdecode(np.frombuffer(response_img.content, np.uint8), cv2.IMREAD_COLOR)
        
        response_mask = requests.get(mask_url, timeout=15)
        response_mask.raise_for_status()
        mask_gray = cv2.imdecode(np.frombuffer(response_mask.content, np.uint8), cv2.IMREAD_GRAYSCALE)
        
        # Chuyển BGR thành RGB PIL Image để truyền vào SDXL pipeline
        orig_img_rgb = cv2.cvtColor(orig_img_bgr, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(orig_img_rgb)
        pil_mask = Image.fromarray(mask_gray)
        
        # Các tham số chạy inpaint
        num_inference_steps = job_input.get('num_inference_steps', 30)
        guidance_scale = job_input.get('guidance_scale', 6.0)
        
        generator = None
        seed = job_input.get('seed')
        if seed is not None:
            generator = torch.Generator(device=pipeline.device).manual_seed(seed)
            
        print(f"Running SDXL Inpaint: prompt='{prompt}', steps={num_inference_steps}, guidance={guidance_scale}...")
        
        # Thực hiện Inpainting sử dụng padding_mask_crop=64
        with torch.inference_mode():
            pipe_out = pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=pil_image,
                mask_image=pil_mask,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                padding_mask_crop=64,
                generator=generator
            )
            
        gen_img_pil = pipe_out.images[0]
        gen_img_bgr = cv2.cvtColor(np.array(gen_img_pil), cv2.COLOR_RGB2BGR)
        
        # Hòa trộn Laplacian Pyramid Blending với Histogram Matching khử VAE color drift
        blended_img = apply_laplacian_pyramid_blend(orig_img_bgr, gen_img_bgr, mask_gray, num_levels=6)
        
        # ZERO BASE64: Encode thành bytes PNG và upload qua S3 PUT URL trực tiếp
        image_bytes = cv2.imencode('.png', blended_img)[1].tobytes()
        
        print(f"Uploading blended image bytes ({len(image_bytes)} bytes) to S3 output_url...")
        put_response = requests.put(output_url, data=image_bytes, headers={"Content-Type": "image/png"}, timeout=30)
        put_response.raise_for_status()
        
        return {"status": "success", "image_url": output_url}

    # 🟢 4. LỆNH TRANSLATE: Dịch toàn bộ trang truyện
    image_url = job_input['image_url']
    response = requests.get(image_url, timeout=10)
    response.raise_for_status()
    image_array = np.frombuffer(response.content, np.uint8)
    
    # 🚀 LƯU TRỮ KÍCH THƯỚC GỐC CỦA ẢNH ĐỂ ĐỐI CHIẾU
    original_image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    orig_h, orig_w = original_image.shape[:2]
    clean_image = original_image.copy()

    try:
        # 🚀 TRUYỀN BẢN COPY VÀO ĐỂ TRÁNH DETECTOR BÓP MÉO ẢNH GỐC
        result = text_detector(original_image.copy())
        ctd_mask = result[0] if isinstance(result, tuple) else result
        
        if ctd_mask.max() <= 1.0: 
            ctd_mask = (ctd_mask * 255).astype(np.uint8)
        else: 
            ctd_mask = ctd_mask.astype(np.uint8)
        
        # 🚀 TRỌNG TÂM FIX LỖI: RESIZE LẠI MẶT NẠ AI VỀ ĐÚNG KÍCH THƯỚC ẢNH GỐC (TỶ LỆ 1:1)
        ctd_mask = cv2.resize(ctd_mask, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)
        
        _, ctd_mask = cv2.threshold(ctd_mask, 127, 255, cv2.THRESH_BINARY)
        
        # BƯỚC 1: Lấy mặt nạ Vùng Trắng (Bong bóng thoại) TRÊN ẢNH GỐC
        gray = cv2.cvtColor(original_image, cv2.COLOR_BGR2GRAY)
        _, white_regions = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
        
        # BƯỚC 2: Thuật toán Flood-Fill / Dilation
        fat_mask = cv2.dilate(ctd_mask, np.ones((7, 7), np.uint8), iterations=3) 
        smart_mask = cv2.bitwise_and(white_regions, fat_mask)
        smart_mask = cv2.dilate(smart_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)), iterations=2)
        
        # BƯỚC 3: Hợp nhất
        final_mask = cv2.bitwise_or(ctd_mask, smart_mask)
        
        # Tìm Contours (Giờ đây nó sẽ trả về tọa độ trên hệ trục gốc 1:1)
        contours, _ = cv2.findContours(final_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        extracted_data = []
        count = 1

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w < 16 or h < 16: continue 
            
            japanese_text = extract_text_manga_ocr(original_image[y:y+h, x:x+w])
            
            # Tọa độ gửi về Frontend giờ đã siêu chuẩn xác
            extracted_data.append({
                "id": count, 
                "box_coordinates": {"x1": x, "y1": y, "x2": x+w, "y2": y+h}, 
                "japanese": japanese_text, 
                "vietnamese": ""
            })
            count += 1
            
        # Run batched LaMa inpainting on the entire image at once
        if cv2.countNonZero(final_mask) > 0:
            clean_image = lama_inpaint_batched(clean_image, final_mask, lama_session)
            
        _, buffer = cv2.imencode('.jpg', clean_image)
        clean_b64 = base64.b64encode(buffer).decode('utf-8')

        return {
            "status": "success",
            "clean_image_base64": clean_b64,
            "data": extracted_data,
            "context": {
                "genre": job_input.get("genre", ""),
                "tone": job_input.get("tone", ""),
                "pronouns": job_input.get("pronouns", ""),
                "glossary": job_input.get("glossary", "")
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

runpod.serverless.start({"handler": handler})