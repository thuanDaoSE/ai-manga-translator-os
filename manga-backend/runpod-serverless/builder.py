import os
import torch
from diffusers import StableDiffusionXLInpaintPipeline

def download_model():
    # Read the Hugging Face Token from the environment variable
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        print("[builder.py] Warning: HF_TOKEN environment variable is not set. If the model requires authorization, the download will fail.")
    else:
        print("[builder.py] HF_TOKEN detected in environment.")

    model_id = "ShinoharaHare/Waifu-Inpaint-XL"
    save_path = "/workspace/models/waifu-inpaint-xl"

    print(f"[builder.py] Pre-downloading model '{model_id}'...")
    
    # Load pipeline with torch.float16 and safetensors
    pipe = StableDiffusionXLInpaintPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        use_safetensors=True,
        token=hf_token
    )

    print(f"[builder.py] Model downloaded successfully. Saving pretrained pipeline to '{save_path}'...")
    pipe.save_pretrained(save_path)
    print("[builder.py] Model caching completed successfully.")

if __name__ == "__main__":
    download_model()
