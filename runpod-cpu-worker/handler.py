import os
import io
import time
import base64
import numpy as np
from PIL import Image
import onnxruntime as ort
import runpod

# Biến trace instance
CPU_RUNPOD_ID = os.getenv("CPU_RUNPOD_ID", "unknown_cpu_instance")

# Bắt đầu đo thời gian load model (cold start profiling)
print(f"🚀 [STARTUP] Booting worker. CPU_RUNPOD_ID: {CPU_RUNPOD_ID}", flush=True)
model_load_start = time.time()

# Cấu hình ONNX Runtime tối ưu CPU
opts = ort.SessionOptions()

# Đọc số thread từ biến môi trường (nếu có), nếu không để ORT tự tối ưu
intra_threads = os.getenv("ORT_INTRA_OP_THREADS")
if intra_threads:
    opts.intra_op_num_threads = int(intra_threads)
    print(f"⚙️ [CONFIG] Set intra_op_num_threads = {intra_threads}", flush=True)

inter_threads = os.getenv("ORT_INTER_OP_THREADS")
if inter_threads:
    opts.inter_op_num_threads = int(inter_threads)
    print(f"⚙️ [CONFIG] Set inter_op_num_threads = {inter_threads}", flush=True)

opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

MODEL_PATH = "lama.onnx"
session = None
load_error = None

try:
    if os.path.exists(MODEL_PATH):
        session = ort.InferenceSession(MODEL_PATH, sess_options=opts, providers=["CPUExecutionProvider"])
        load_time = time.time() - model_load_start
        print(f"🚀 [STARTUP] LaMa ONNX Model loaded successfully in {load_time:.4f} seconds.", flush=True)
    else:
        load_error = f"Model file '{MODEL_PATH}' not found in worker directory."
        print(f"❌ [STARTUP ERROR] {load_error}", flush=True)
except Exception as e:
    load_error = str(e)
    print(f"❌ [STARTUP ERROR] Failed to load model: {e}", flush=True)


def preprocess(img_pil, mask_pil):
    """
    Chuyển PIL Image và PIL Mask thành tensor ONNX:
    - Image: shape (1, 3, 512, 512), float32, [0, 1]
    - Mask: shape (1, 1, 512, 512), float32, [0, 1]
    """
    # Resize về 512x512
    img_resized = img_pil.resize((512, 512), Image.Resampling.BILINEAR)
    mask_resized = mask_pil.resize((512, 512), Image.Resampling.NEAREST)
    
    # Image preprocessing
    img_np = np.array(img_resized).astype(np.float32) / 255.0
    # Nếu ảnh là grayscale (1 kênh), nhân bản thành 3 kênh RGB
    if len(img_np.shape) == 2:
        img_np = np.stack([img_np] * 3, axis=-1)
    elif img_np.shape[2] == 4: # Nếu có kênh Alpha, bỏ đi
        img_np = img_np[:, :, :3]
        
    img_t = np.transpose(img_np, (2, 0, 1))[np.newaxis, ...] # Shape: (1, 3, 512, 512)
    
    # Mask preprocessing (Grayscale nhị phân 0-1)
    mask_gray = mask_resized.convert("L")
    mask_np = np.array(mask_gray).astype(np.float32)
    mask_np = (mask_np > 0).astype(np.float32) # Ngưỡng hóa nhị phân
    mask_t = mask_np[np.newaxis, np.newaxis, ...] # Shape: (1, 1, 512, 512)
    
    return img_t, mask_t


def handler(job):
    """
    RunPod Serverless Handler
    """
    if session is None:
        return {"error": f"Model failed to load at startup. Details: {load_error}"}
        
    job_input = job.get("input", {})
    image_b64 = job_input.get("image_b64")
    mask_b64 = job_input.get("mask_b64")
    
    if not image_b64 or not mask_b64:
        return {"error": "Missing 'image_b64' or 'mask_b64' in job input."}
        
    try:
        # Decode base64
        try:
            img_bytes = base64.b64decode(image_b64)
            img_pil = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception as e:
            return {"error": f"Failed to decode 'image_b64': {str(e)}"}
            
        try:
            mask_bytes = base64.b64decode(mask_b64)
            mask_pil = Image.open(io.BytesIO(mask_bytes))
        except Exception as e:
            return {"error": f"Failed to decode 'mask_b64': {str(e)}"}
            
        # Preprocess
        img_t, mask_t = preprocess(img_pil, mask_pil)
        
        # Inference
        ort_inputs = {
            session.get_inputs()[0].name: img_t,
            session.get_inputs()[1].name: mask_t
        }
        
        t0 = time.time()
        ort_outs = session.run(None, ort_inputs)
        inference_time = time.time() - t0
        print(f"⏱️ [INFERENCE] LaMa inference completed in {inference_time:.4f} seconds.", flush=True)
        
        # Postprocess: Output shape is (1, 3, 512, 512), range [0, 1]
        out_img_t = ort_outs[0][0] # Shape: (3, 512, 512)
        out_img_np = np.transpose(out_img_t, (1, 2, 0)) # Shape: (512, 512, 3)
        out_img_np = (out_img_np * 255.0).clip(0, 255).astype(np.uint8)
        
        # Chuyển numpy array thành base64 PNG
        out_pil = Image.fromarray(out_img_np)
        buffered = io.BytesIO()
        out_pil.save(buffered, format="PNG")
        result_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        return {
            "cpu_runpod_id": CPU_RUNPOD_ID,
            "result_b64": result_b64,
            "shape": list(out_img_np.shape),
            "dtype": str(out_img_np.dtype)
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"Internal execution error: {str(e)}"}


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "local":
        print("💡 [LOCAL RUN] Simulating RunPod handler locally...")
        import json
        test_file = "test_input.json"
        if os.path.exists(test_file):
            with open(test_file, "r") as f:
                mock_job = json.load(f)
            res = handler(mock_job)
            if "result_b64" in res:
                print("Result (truncated base64):")
                print({**res, "result_b64": res["result_b64"][:50] + "..."})
            else:
                print("Result:", res)
        else:
            print(f"❌ '{test_file}' not found. Please create it first.")
    else:
        runpod.serverless.start({"handler": handler})
