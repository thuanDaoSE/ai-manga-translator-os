import os
import torch
import runpod
import base64
import requests
import io
from PIL import Image
from transformers import AutoProcessor, AutoModelForCausalLM

MODEL_ID = "gigass03/PaddleOCR-VL-1.6-Manga-Finetuned"
device = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Loading Japanese VLM model: {MODEL_ID} on {device}...")
try:
    min_pixels = 256 * 28 * 28
    max_pixels = 1280 * 28 * 28
    processor = AutoProcessor.from_pretrained(
        MODEL_ID,
        trust_remote_code=True,
        min_pixels=min_pixels,
        max_pixels=max_pixels
    )
    if device == "cuda":
        try:
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_ID,
                trust_remote_code=True,
                torch_dtype=torch.bfloat16,
                attn_implementation="flash_attention_2"
            ).to(device)
        except Exception as e_flash:
            print(f"Could not load with flash_attention_2: {e_flash}. Falling back to standard bfloat16.")
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_ID,
                trust_remote_code=True,
                torch_dtype=torch.bfloat16
            ).to(device)
    else:
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            trust_remote_code=True
        )
    model.eval()
    print("Japanese VLM Model loaded successfully!")
except Exception as e:
    print(f"Error loading Japanese VLM Model: {e}")
    model, processor = None, None

def process_image(event):
    try:
        if model is None or processor is None:
            raise RuntimeError("Model or Processor was not initialized properly.")

        payload = event.get("input", {})
        image_base64 = payload.get("image") or payload.get("image_base64")
        image_url = payload.get("image_url")

        if not image_base64 and not image_url:
            raise ValueError("Missing image or image_url in input payload")

        # Load image with PIL
        if image_base64:
            if "," in image_base64:
                image_base64 = image_base64.split(",", 1)[1]
            image_bytes = base64.b64decode(image_base64)
            image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        else:
            response = requests.get(image_url, timeout=20)
            response.raise_for_status()
            image_pil = Image.open(io.BytesIO(response.content)).convert("RGB")

        # Create prompt compatible with PaddleOCR-VL model
        prompt = "<image>\nOCR:"

        # Process inputs
        inputs = processor(images=image_pil, text=prompt, return_tensors="pt").to(device)

        # Generate text
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=512,
                do_sample=False
            )

        # Decode generated output, excluding the prompt tokens
        input_len = inputs.input_ids.shape[1]
        if len(outputs[0]) > input_len:
            generated_tokens = outputs[0][input_len:]
        else:
            generated_tokens = outputs[0]

        if hasattr(processor, "decode"):
            result_text = processor.decode(generated_tokens, skip_special_tokens=True)
        else:
            result_text = processor.tokenizer.decode(generated_tokens, skip_special_tokens=True)

        result_text = result_text.strip()

        # We return both 'data' and 'text' for maximum compatibility with different backend call implementations
        return {
            "status": "success",
            "data": result_text,
            "text": result_text
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    runpod.serverless.start({"handler": process_image})

