import runpod
import base64
import cv2
import numpy as np
import os
import torch
import requests
from PIL import Image
from diffusers import StableDiffusionXLInpaintPipeline, AutoencoderKL
from redraw_utils import apply_laplacian_pyramid_blend

print("Khởi động Redraw AI Engine (SDXL Only)...")

# Initialize SDXL Inpaint Pipeline using local directories.
# No runtime downloading is allowed to avoid cold start timeouts.
# We use FP16 precision, Model CPU Offloading, and VAE Slicing for VRAM safety.
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

# Pre-load the SDXL Inpaint pipeline at startup to warm up serverless container
try:
    get_sdxl_inpaint_pipeline()
except Exception as e:
    print(f"Failed to pre-load SDXL Inpaint pipeline at startup: {e}")

def handler(job):
    job_input = job['input']
    action = job_input.get('action', 'redraw')

    # 🟢 1. LỆNH PING: Giữ máy luôn thức
    if action == 'ping':
        return {"status": "success", "message": "pong"}

    # 🟢 2. LỆNH REDRAW: Vẽ lại vùng lớn bằng SDXL + Laplacian Pyramid Blending
    elif action == 'redraw':
        image_url = job_input['image_url']
        mask_url = job_input['mask_url']
        prompt = job_input['prompt']
        raw_negative_prompt = job_input.get('negative_prompt', '')
        
        # Forcefully append NSFW guardrail string to negative prompt for strict regulatory compliance
        nsfw_guardrail = "nsfw, nude, explicit, pornography, uncensored, genitalia"
        if raw_negative_prompt:
            negative_prompt = f"{raw_negative_prompt.strip().rstrip(',')}, {nsfw_guardrail}"
        else:
            negative_prompt = nsfw_guardrail
            
        output_url = job_input['output_url']
        
        # Tải local SDXL inpaint pipeline
        pipeline = get_sdxl_inpaint_pipeline()
        if pipeline is None:
            raise Exception("Không thể load SDXL inpaint pipeline từ local directory.")
            
        # Fetch ảnh gốc và mask từ URL (Thêm header ngrok-skip-browser-warning để qua mặt ngrok và tăng timeout)
        headers_fetch = {"ngrok-skip-browser-warning": "69420"}
        response_img = requests.get(image_url, headers=headers_fetch, timeout=60)
        response_img.raise_for_status()
        orig_img_bgr = cv2.imdecode(np.frombuffer(response_img.content, np.uint8), cv2.IMREAD_COLOR)
        
        response_mask = requests.get(mask_url, headers=headers_fetch, timeout=60)
        response_mask.raise_for_status()
        mask_rgba = cv2.imdecode(np.frombuffer(response_mask.content, np.uint8), cv2.IMREAD_UNCHANGED)
        if mask_rgba is not None and len(mask_rgba.shape) == 3 and mask_rgba.shape[2] == 4:
            mask_gray = mask_rgba[:, :, 3]
        elif mask_rgba is not None and len(mask_rgba.shape) == 3 and mask_rgba.shape[2] == 3:
            mask_gray = cv2.cvtColor(mask_rgba, cv2.COLOR_BGR2GRAY)
        else:
            mask_gray = mask_rgba
            
        _, mask_gray = cv2.threshold(mask_gray, 10, 255, cv2.THRESH_BINARY)
        
        # 🟢 BƯỚC 1: Lấy tọa độ gốc và tính toán Modulo-8 chuẩn xác theo Toán học
        h_orig, w_orig = orig_img_bgr.shape[:2]
        new_w = int(round(w_orig / 8.0) * 8)
        new_h = int(round(h_orig / 8.0) * 8)
        
        # Chuyển BGR thành RGB PIL Image
        orig_img_rgb = cv2.cvtColor(orig_img_bgr, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(orig_img_rgb)
        pil_mask = Image.fromarray(mask_gray)
        
        # 🟢 BƯỚC 2: Resize tiền xử lý với Kernel chuyên dụng (LANCZOS cho ảnh, NEAREST cho mask)
        pil_image_resized = pil_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
        pil_mask_resized = pil_mask.resize((new_w, new_h), Image.Resampling.NEAREST)
        
        # Các tham số chạy inpaint được tối ưu hóa
        num_inference_steps = job_input.get('num_inference_steps', 30) 
        guidance_scale = job_input.get('guidance_scale', 8.0) # 🟢 Ép sát Prompt (Từ 6.0 -> 8.0)
        
        generator = None
        seed = job_input.get('seed')
        if seed is not None:
            generator = torch.Generator(device=pipeline.device).manual_seed(seed)
            
        print(f"Running SDXL Inpaint: prompt='{prompt}', size=({new_w}x{new_h}), steps={num_inference_steps}, guidance={guidance_scale}...")
        
        # Thực hiện Inpainting
        with torch.inference_mode():
            pipe_out = pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=pil_image_resized,
                mask_image=pil_mask_resized,
                width=new_w,              # 🟢 BƯỚC 3: Chốt cứng kích thước Modulo-8 cho VAE
                height=new_h,             # 🟢 BƯỚC 3: Chốt cứng kích thước Modulo-8 cho VAE
                strength=0.95,            # 🟢 BƯỚC 4: Phá hủy 95% nền cũ để vẽ mới hoàn toàn
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                padding_mask_crop=32,     # 🟢 BƯỚC 5: Thu hẹp vùng crop để chống lây lan viền ô truyện
                generator=generator
            )
            
        gen_img_pil_resized = pipe_out.images[0]
        
        # 🟢 BƯỚC 6: Trả ngược tọa độ (Inverse Spatial Transformation) về đúng kích thước gốc
        gen_img_pil_restored = gen_img_pil_resized.resize((w_orig, h_orig), Image.Resampling.LANCZOS)
        gen_img_bgr = cv2.cvtColor(np.array(gen_img_pil_restored), cv2.COLOR_RGB2BGR)
        
        # Hòa trộn Laplacian Pyramid Blending với Histogram Matching khử VAE color drift
        blended_img = apply_laplacian_pyramid_blend(orig_img_bgr, gen_img_bgr, mask_gray, num_levels=6)
        
        # ZERO BASE64: Encode thành bytes PNG và upload qua S3 PUT URL trực tiếp
        image_bytes = cv2.imencode('.png', blended_img)[1].tobytes()
        
        print(f"Uploading blended image bytes ({len(image_bytes)} bytes) to S3 output_url...")
        put_response = requests.put(output_url, data=image_bytes, headers={"Content-Type": "image/png"}, timeout=30)
        put_response.raise_for_status()
        
        return {"status": "success", "image_url": output_url}
        
    else:
        return {"status": "error", "message": f"Action '{action}' is not supported on this dedicated Redraw endpoint."}

runpod.serverless.start({"handler": handler})