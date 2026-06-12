import os
import torch
from diffusers import StableDiffusionXLInpaintPipeline, AutoencoderKL

def download_model():
    # Read the Hugging Face Token from the environment variable
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        print("[builder.py] Warning: HF_TOKEN environment variable is not set.")
    else:
        print("[builder.py] HF_TOKEN detected in environment.")

    model_id = "ShinoharaHare/Waifu-Inpaint-XL"
    vae_id = "madebyollin/sdxl-vae-fp16-fix"
    
    save_path = "/workspace/models/waifu-inpaint-xl"
    vae_path = "/workspace/models/sdxl-vae-fp16-fix"

    os.makedirs(save_path, exist_ok=True)
    os.makedirs(vae_path, exist_ok=True)

    # 1. Tải và lưu VAE (Vá lỗi ảnh đen FP16)
    print(f"[builder.py] Downloading VAE '{vae_id}'...")
    vae = AutoencoderKL.from_pretrained(
        vae_id, 
        torch_dtype=torch.float16, 
        use_safetensors=True, 
        token=hf_token
    )
    vae.save_pretrained(vae_path)
    print(f"[builder.py] VAE saved to '{vae_path}'.")

    # 2. Tải và lưu Pipeline chính
    print(f"[builder.py] Pre-downloading model '{model_id}'...")
    pipe = StableDiffusionXLInpaintPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        use_safetensors=True,
        token=hf_token
    )
    pipe.save_pretrained(save_path)
    print(f"[builder.py] Model saved to '{save_path}'. Caching completed successfully.")

if __name__ == "__main__":
    download_model()