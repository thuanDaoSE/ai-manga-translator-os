import runpod
import base64
import cv2
import numpy as np
import os
import torch
import onnxruntime as ort
import sys
from PIL import Image

print("Khởi động AI Engine...")

sys.path.append(os.path.join(os.path.dirname(__file__), "comic_text_detector"))
from comic_text_detector.inference import TextDetector

# Models are initialized lazily to optimize VRAM usage and enable cleanup
device = "cuda" if torch.cuda.is_available() else "cpu"
_ocr_manager = None
_mocr = None
text_detector = None
lama_session = None

from torch import nn as nn
from torch.nn import functional as F
import math
import urllib.request
import gc

def get_manga_ocr():
    global _mocr
    if _mocr is None:
        print("⚡ [GPU OCR] Initializing MangaOCR on GPU...")
        from manga_ocr import MangaOcr
        _mocr = MangaOcr()
    return _mocr

def run_batch_manga_ocr(mocr_engine, pil_images: list) -> list:
    """Chạy MangaOCR theo Batch trên GPU để đạt tốc độ tối đa (~0.2s cho toàn trang)"""
    if not pil_images:
        return []
    try:
        pixel_values = mocr_engine.processor(images=pil_images, return_tensors="pt").pixel_values.to(mocr_engine.device)
        generated_ids = mocr_engine.model.generate(pixel_values, max_new_tokens=128)
        texts = mocr_engine.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)
        return [mocr_engine._postprocess(t).strip() for t in texts]
    except Exception as e:
        print(f"⚠️ [MangaOCR Batch Warning]: {e}. Fallback to sequential...")
        results = []
        for img in pil_images:
            try:
                results.append(mocr_engine(img).strip())
            except Exception:
                results.append("")
        return results

def get_ocr_manager():
    global _ocr_manager
    if _ocr_manager is None:
        print("Lazy-loading OCRManager...")
        from ocr_manager import OCRManager
        _ocr_manager = OCRManager()
    return _ocr_manager

def get_text_detector():
    global text_detector
    if text_detector is None:
        print("Lazy-loading TextDetector...")
        text_detector = TextDetector(model_path=os.path.join(os.path.dirname(__file__), "comic_text_detector", "data", "comictextdetector.pt"), device=device)
    return text_detector

def get_lama_session():
    global lama_session
    if lama_session is None:
        model_path = os.path.join(os.path.dirname(__file__), "lama-manga.onnx")
        if not os.path.exists(model_path):
            model_path = os.path.join(os.path.dirname(__file__), "weights", "lama-manga.onnx")
        
        available = ort.get_available_providers()
        print(f"ℹ️ [ORT] Available providers: {available}")
        
        providers = []
        if torch.cuda.is_available() and 'CUDAExecutionProvider' in available:
            providers.append(('CUDAExecutionProvider', {
                'device_id': 0,
                'arena_extend_strategy': 'kNextPowerOfTwo',
                'gpu_mem_limit': 4 * 1024 * 1024 * 1024,
                'cudnn_conv_algo_search': 'DEFAULT',
                'do_copy_in_default_stream': True,
            }))
        providers.append('CPUExecutionProvider')

        print(f"🚀 Initializing LaMa session with: {[p if isinstance(p, str) else p[0] for p in providers]}...")
        try:
            lama_session = ort.InferenceSession(model_path, providers=providers)
            print(f"✅ LaMa ONNX session active: {lama_session.get_providers()}")
        except Exception as e:
            print(f"⚠️ LaMa GPU init failed ({e}), falling back to CPU...")
            lama_session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
    return lama_session

def inpaint_crop_lama(session, crop_img: np.ndarray, crop_mask: np.ndarray) -> np.ndarray:
    """Inpaint một vùng crop cục bộ bằng LaMa 512x512 bảo toàn độ phân giải gốc 1:1"""
    try:
        h_crop, w_crop = crop_img.shape[:2]
        original_crop_mask = crop_mask.copy()

        scale = 1.0
        if h_crop > 512 or w_crop > 512:
            scale = 512.0 / max(h_crop, w_crop)
            new_w, new_h = int(w_crop * scale), int(h_crop * scale)
            crop_img_scaled = cv2.resize(crop_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            crop_mask_scaled = cv2.resize(crop_mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
        else:
            new_w, new_h = w_crop, h_crop
            crop_img_scaled = crop_img
            crop_mask_scaled = crop_mask

        pad_bottom = 512 - new_h
        pad_right = 512 - new_w
        if pad_bottom > 0 or pad_right > 0:
            crop_img_padded = cv2.copyMakeBorder(crop_img_scaled, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
            crop_mask_padded = cv2.copyMakeBorder(crop_mask_scaled, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)
        else:
            crop_img_padded = crop_img_scaled
            crop_mask_padded = crop_mask_scaled

        img_t = np.transpose(cv2.cvtColor(crop_img_padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
        mask_norm = (crop_mask_padded > 0).astype(np.float32)
        mask_t = mask_norm[np.newaxis, np.newaxis, ...]

        inputs = session.get_inputs()
        ort_outs = session.run(None, {inputs[0].name: img_t, inputs[1].name: mask_t})
        out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255.0).clip(0, 255).astype(np.uint8)
        clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]

        if scale != 1.0:
            clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)

        mask_bool = original_crop_mask > 0
        result = crop_img.copy()
        result[mask_bool] = clean_crop[mask_bool]
        return result
    except Exception as e:
        print(f"⚠️ [INPAINT CROP ERROR] {e}")
        return crop_img

def run_local_lama(img: np.ndarray, mask: np.ndarray, target_boxes: list = None) -> np.ndarray:
    """Xóa chữ trên ảnh sử dụng LaMa ONNX trên GPU với context padding"""
    try:
        session = get_lama_session()
        if session is None:
            return img
        h_img, w_img = img.shape[:2]

        if max(h_img, w_img) <= 768:
            return inpaint_crop_lama(session, img, mask)

        clean_img = img.copy()

        regions = []
        if target_boxes:
            for (bx1, by1, bx2, by2) in target_boxes:
                regions.append((bx1, by1, bx2 - bx1, by2 - by1))
        else:
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                if w < 10 or h < 10:
                    continue
                regions.append((x, y, w, h))

        if not regions:
            return clean_img

        for (x, y, w, h) in regions:
            pad_x = max(30, min(int(w * 0.4), 120))
            pad_y = max(30, min(int(h * 0.4), 120))
            x1_pad, y1_pad = max(0, x - pad_x), max(0, y - pad_y)
            x2_pad, y2_pad = min(w_img, x + w + pad_x), min(h_img, y + h + pad_y)

            crop_img = clean_img[y1_pad:y2_pad, x1_pad:x2_pad]
            crop_mask = mask[y1_pad:y2_pad, x1_pad:x2_pad]

            if cv2.countNonZero(crop_mask) == 0:
                continue

            cleaned_crop = inpaint_crop_lama(session, crop_img, crop_mask)
            clean_img[y1_pad:y2_pad, x1_pad:x2_pad] = cleaned_crop

        return clean_img
    except Exception as e:
        print(f"⚠️ [LAMA RUN ERROR] {e}")
        return img

# MangaOcr fallback functions purged in SaaS optimization

# ----------------- Real-ESRGAN (RRDBNet) Implementation -----------------

class ResidualDenseBlock(nn.Module):
    def __init__(self, num_feat=64, num_grow_ch=32):
        super(ResidualDenseBlock, self).__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)
        
        # initialization
        for m in [self.conv1, self.conv2, self.conv3, self.conv4, self.conv5]:
            nn.init.kaiming_normal_(m.weight, a=0.2, mode='fan_in', nonlinearity='leaky_relu')
            m.weight.data *= 0.1
            if m.bias is not None:
                m.bias.data.zero_()

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x

class RRDB(nn.Module):
    def __init__(self, num_feat, num_grow_ch=32):
        super(RRDB, self).__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x

class RRDBNet(nn.Module):
    def __init__(self, num_in_ch, num_out_ch, scale=4, num_feat=64, num_block=23, num_grow_ch=32):
        super(RRDBNet, self).__init__()
        self.scale = scale
        if scale == 2:
            num_in_ch = num_in_ch * 4
        elif scale == 1:
            num_in_ch = num_in_ch * 16
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(num_feat, num_grow_ch) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        # upsample
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        if self.scale == 2:
            feat = F.pixel_unshuffle(x, scale=2)
        elif self.scale == 1:
            feat = F.pixel_unshuffle(x, scale=4)
        else:
            feat = x
        feat = self.conv_first(feat)
        body_feat = self.conv_body(self.body(feat))
        feat = feat + body_feat
        # upsample
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        out = self.conv_last(self.lrelu(self.conv_hr(feat)))
        return out

class RealESRGANer:
    def __init__(self, scale, model_path, model=None, tile=0, tile_pad=10, pre_pad=10, half=False):
        self.scale = scale
        self.tile_size = tile
        self.tile_pad = tile_pad
        self.pre_pad = pre_pad
        self.mod_scale = None
        self.half = half
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        loadnet = torch.load(model_path, map_location=torch.device('cpu'))
        if 'params_ema' in loadnet:
            keyname = 'params_ema'
        elif 'params' in loadnet:
            keyname = 'params'
        else:
            keyname = None

        if keyname:
            state_dict = loadnet[keyname]
        else:
            state_dict = loadnet

        # Auto-convert original ESRGAN model keys to Real-ESRGAN format if needed
        is_old_format = any(k.startswith('model.') for k in state_dict.keys())
        if is_old_format:
            print("[MODEL] Converting original ESRGAN state_dict keys to Real-ESRGAN format...")
            new_state_dict = {}
            for k, v in state_dict.items():
                if k.startswith('model.0.'):
                    new_k = k.replace('model.0.', 'conv_first.')
                elif k.startswith('model.1.sub.'):
                    parts = k.split('.')
                    sub_idx = int(parts[3])
                    if sub_idx == 23:
                        new_k = k.replace('model.1.sub.23.', 'conv_body.')
                    else:
                        rdb_name = parts[4].lower()
                        conv_name = parts[5]
                        suffix = parts[7]
                        new_k = f"body.{sub_idx}.{rdb_name}.{conv_name}.{suffix}"
                elif k.startswith('model.3.'):
                    new_k = k.replace('model.3.', 'conv_up1.')
                elif k.startswith('model.6.'):
                    new_k = k.replace('model.6.', 'conv_up2.')
                elif k.startswith('model.8.'):
                    new_k = k.replace('model.8.', 'conv_hr.')
                elif k.startswith('model.10.'):
                    new_k = k.replace('model.10.', 'conv_last.')
                else:
                    new_k = k
                new_state_dict[new_k] = v
            state_dict = new_state_dict

        model.load_state_dict(state_dict, strict=True)

        model.eval()
        self.model = model.to(self.device)
        if self.half:
            self.model = self.model.half()

    def pre_process(self, img):
        img = torch.from_numpy(np.transpose(img, (2, 0, 1))).float()
        self.img = img.unsqueeze(0).to(self.device)
        if self.half:
            self.img = self.img.half()

        # pre_pad
        if self.pre_pad != 0:
            self.img = F.pad(self.img, (0, self.pre_pad, 0, self.pre_pad), 'reflect')
        # mod pad for divisible borders
        if self.scale == 2:
            self.mod_scale = 2
        elif self.scale == 1:
            self.mod_scale = 4
        if self.mod_scale is not None:
            self.mod_pad_h, self.mod_pad_w = 0, 0
            _, _, h, w = self.img.size()
            if (h % self.mod_scale != 0):
                self.mod_pad_h = (self.mod_scale - h % self.mod_scale)
            if (w % self.mod_scale != 0):
                self.mod_pad_w = (self.mod_scale - w % self.mod_scale)
            self.img = F.pad(self.img, (0, self.mod_pad_w, 0, self.mod_pad_h), 'reflect')

    def process(self):
        self.output = self.model(self.img)

    def tile_process(self):
        batch, channel, height, width = self.img.shape
        output_height = height * self.scale
        output_width = width * self.scale
        output_shape = (batch, channel, output_height, output_width)

        self.output = self.img.new_zeros(output_shape)
        tiles_x = math.ceil(width / self.tile_size)
        tiles_y = math.ceil(height / self.tile_size)

        for y in range(tiles_y):
            for x in range(tiles_x):
                ofs_x = x * self.tile_size
                ofs_y = y * self.tile_size
                input_start_x = ofs_x
                input_end_x = min(ofs_x + self.tile_size, width)
                input_start_y = ofs_y
                input_end_y = min(ofs_y + self.tile_size, height)

                input_start_x_pad = max(input_start_x - self.tile_pad, 0)
                input_end_x_pad = min(input_end_x + self.tile_pad, width)
                input_start_y_pad = max(input_start_y - self.tile_pad, 0)
                input_end_y_pad = min(input_end_y + self.tile_pad, height)

                input_tile_width = input_end_x - input_start_x
                input_tile_height = input_end_y - input_start_y
                input_tile = self.img[:, :, input_start_y_pad:input_end_y_pad, input_start_x_pad:input_end_x_pad]

                try:
                    with torch.no_grad():
                        output_tile = self.model(input_tile)
                except RuntimeError as error:
                    print('Tiled inference error:', error)
                    raise error

                output_start_x = input_start_x * self.scale
                output_end_x = input_end_x * self.scale
                output_start_y = input_start_y * self.scale
                output_end_y = input_end_y * self.scale

                output_start_x_tile = (input_start_x - input_start_x_pad) * self.scale
                output_end_x_tile = output_start_x_tile + input_tile_width * self.scale
                output_start_y_tile = (input_start_y - input_start_y_pad) * self.scale
                output_end_y_tile = output_start_y_tile + input_tile_height * self.scale

                self.output[:, :, output_start_y:output_end_y, output_start_x:output_end_x] = output_tile[:, :, output_start_y_tile:output_end_y_tile, output_start_x_tile:output_end_x_tile]

    def post_process(self):
        if self.mod_scale is not None:
            _, _, h, w = self.output.size()
            self.output = self.output[:, :, 0:h - self.mod_pad_h * self.scale, 0:w - self.mod_pad_w * self.scale]
        if self.pre_pad != 0:
            _, _, h, w = self.output.size()
            self.output = self.output[:, :, 0:h - self.pre_pad * self.scale, 0:w - self.pre_pad * self.scale]
        return self.output

    @torch.no_grad()
    def enhance(self, img, outscale=None):
        h_input, w_input = img.shape[0:2]
        img = img.astype(np.float32)
        if np.max(img) > 256:
            max_range = 65535.0
        else:
            max_range = 255.0
        img = img / max_range
        
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        self.pre_process(img)
        if self.tile_size > 0:
            self.tile_process()
        else:
            self.process()
        output_img = self.post_process()
        output_img = output_img.data.squeeze().float().cpu().clamp_(0, 1).numpy()
        output_img = np.transpose(output_img[[2, 1, 0], :, :], (1, 2, 0))

        output = (output_img * max_range).round().astype(np.uint8)

        if outscale is not None and outscale != float(self.scale):
            output = cv2.resize(
                output, (
                    int(w_input * outscale),
                    int(h_input * outscale),
                ), interpolation=cv2.INTER_LANCZOS4)

        return output

# ----------------- Image Classification & Upscaling Orchestration -----------------

def classify_image_type(image):
    """
    Classify BGR image as 'manga' (grayscale/black & white) or 'webtoon' (color)
    using average Saturation in HSV space.
    """
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    s_channel = hsv[:, :, 1]
    mean_saturation = s_channel.mean()
    print(f"[CLASSIFICATION] Mean Saturation: {mean_saturation:.4f}")
    if mean_saturation < 8.0:
        return 'manga'
    else:
        return 'webtoon'

def run_upscale(image):
    """
    Executes Real-ESRGAN on the image. Classifies domain dynamically,
    downloads weights if absent, processes image using tiling to avoid OOM,
    and returns upscaled result. Releases upscaler memory immediately.
    """
    image_type = classify_image_type(image)
    if image_type == 'manga':
        model_url = "https://objectstorage.us-phoenix-1.oraclecloud.com/n/ax6ygfvpvzka/b/open-modeldb-files/o/4x-Manga109Attempt.pth"
        num_block = 23
    else:
        model_url = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth"
        num_block = 6

    weights_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weights")
    model_path = os.path.join(weights_dir, model_url.split('/')[-1])

    if not os.path.exists(model_path):
        os.makedirs(weights_dir, exist_ok=True)
        print(f"Downloading model weights: {model_url}")
        temp_path = model_path + ".tmp"
        urllib.request.urlretrieve(model_url, temp_path)
        os.rename(temp_path, model_path)
        print("Download complete.")

    model = RRDBNet(num_in_ch=3, num_out_ch=3, scale=4, num_feat=64, num_block=num_block, num_grow_ch=32)
    upsampler = RealESRGANer(
        scale=4,
        model_path=model_path,
        model=model,
        tile=256,
        tile_pad=10,
        pre_pad=10,
        half=torch.cuda.is_available()
    )

    print(f"Running Real-ESRGAN upscaling for {image_type}...")
    output = upsampler.enhance(image, outscale=4)

    # Release upscaler VRAM immediately
    print("Releasing VRAM of upscaler...")
    del upsampler
    del model
    gc.collect()
    torch.cuda.empty_cache()

    return output

# ----------------- RunPod Serverless Handler -----------------

def handler(job):
    job_input = job['input']
    action = job_input.get('action', 'translate') # Mặc định là dịch nguyên trang

    # 🟢 1. LỆNH PING: Giữ máy luôn thức
    if action == 'ping':
        return {"status": "success", "message": "pong"}

    # 🟢 2. LỆNH SCAN: Chỉ quét chữ OCR
    elif action == 'scan':
        img_b64 = job_input['image_base64']
        nparr = np.frombuffer(base64.b64decode(img_b64), np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        lang = job_input.get('language') or job_input.get('source_language') or 'ja'
        ocr_text = get_ocr_manager().recognize_crop(image, language=lang, is_vip=True)
        return {"status": "success", "text": ocr_text}

    # 🟢 3. LỆNH ERASE: Chỉ xóa mảng nhỏ (LaMa)
    elif action == 'erase':
        img_b64 = job_input['image_base64']
        mask_b64 = job_input['mask_base64']
        crop_img = cv2.imdecode(np.frombuffer(base64.b64decode(img_b64), np.uint8), cv2.IMREAD_COLOR)
        crop_mask = cv2.imdecode(np.frombuffer(base64.b64decode(mask_b64), np.uint8), cv2.IMREAD_GRAYSCALE)
        clean_crop = inpaint_crop_lama(get_lama_session(), crop_img, crop_mask)
        _, buffer = cv2.imencode('.png', clean_crop)
        return {"status": "success", "clean_crop_base64": base64.b64encode(buffer).decode('utf-8')}

    # 🟢 4. LỆNH TRANSLATE: Dịch toàn bộ trang truyện (Tối ưu GPU Serverless siêu tốc ~1-3s)
    task_type = job_input.get('task_type', 'clean_only')
    img_b64 = job_input['image_base64']
    img_data = base64.b64decode(img_b64)
    nparr = np.frombuffer(img_data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    clean_image = image.copy()
    h_img, w_img = image.shape[:2]
    extracted_data = []

    try:
        # Step 1: Clean Phase (CTD + LaMa + Batch OCR)
        if task_type in ['clean_only', 'clean_and_upscale']:
            detector = get_text_detector()
            result = detector(image)
            
            mask_raw = result[0] if isinstance(result, tuple) else result
            blk_list = result[2] if isinstance(result, tuple) and len(result) > 2 else []
            
            if mask_raw.max() <= 1.0:
                mask_raw_bin = (mask_raw * 255).astype(np.uint8)
            else:
                mask_raw_bin = mask_raw.astype(np.uint8)
            _, mask_raw_bin = cv2.threshold(mask_raw_bin, 127, 255, cv2.THRESH_BINARY)
            
            fat_mask = cv2.dilate(mask_raw_bin, np.ones((7, 7), np.uint8), iterations=2)
            gray_img = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            _, white_regions = cv2.threshold(gray_img, 200, 255, cv2.THRESH_BINARY)
            
            smart_mask = cv2.bitwise_and(fat_mask, cv2.bitwise_or(mask_raw_bin, white_regions))
            smart_mask = cv2.dilate(smart_mask, np.ones((3, 3), np.uint8), iterations=1)
            mask = cv2.dilate(smart_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1)
            
            # 1.1 Lấy tọa độ text boxes (ưu tiên blk_list của CTD)
            detector_boxes = []
            if blk_list:
                for blk in blk_list:
                    bx1, by1, bx2, by2 = blk.xyxy
                    w_blk = bx2 - bx1
                    h_blk = by2 - by1
                    if w_blk >= 16 and h_blk >= 16:
                        detector_boxes.append((int(bx1), int(by1), int(bx2), int(by2)))
            
            if not detector_boxes:
                contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                for cnt in contours:
                    x, y, w, h = cv2.boundingRect(cnt)
                    if w >= 16 and h >= 16:
                        detector_boxes.append((x, y, x + w, y + h))
            
            lang = job_input.get('language') or job_input.get('source_language') or 'ja'
            if lang == 'ja':
                detector_boxes.sort(key=lambda b: (-b[2], b[1]))
            else:
                detector_boxes.sort(key=lambda b: (b[1], b[0]))
            
            # 1.2 Xóa chữ bằng LaMa Inpainting trên GPU siêu tốc
            clean_image = run_local_lama(image, mask, target_boxes=detector_boxes)
            
            # 1.3 Batch OCR nhận diện chữ đa ngữ (Hayai-OCR v2 SigLIP 2)
            valid_boxes = []
            box_crops = []
            for (bx1, by1, bx2, by2) in detector_boxes:
                crop = image[by1:by2, bx1:bx2]
                if crop.size == 0:
                    continue
                valid_boxes.append((bx1, by1, bx2, by2))
                box_crops.append(crop)
            
            if box_crops:
                recognized_texts = []
                pil_crops = [Image.fromarray(cv2.cvtColor(c, cv2.COLOR_BGR2RGB)) for c in box_crops]

                # Ưu tiên MangaOCR chạy Batch GPU trực tiếp cho Manga Tiếng Nhật (chuẩn 100% ngữ cảnh Manga)
                if lang in ['ja', 'auto', 'japanese', '']:
                    try:
                        mocr = get_manga_ocr()
                        recognized_texts = run_batch_manga_ocr(mocr, pil_crops)
                    except Exception as mocr_err:
                        print(f"⚠️ [GPU MANGA OCR ERROR] {mocr_err}")

                # Nếu tiếng Hàn/Trung/Anh hoặc MangaOCR chưa có kết quả, chạy ocr_router / ocr_manager
                if not recognized_texts or all(not t for t in recognized_texts):
                    try:
                        from ocr_router import get_ocr_router
                        ocr_router = get_ocr_router()
                        recognized_texts = ocr_router.recognize_batch(
                            image_inputs=box_crops,
                            source_language=lang,
                            batch_size=16
                        )
                    except Exception as batch_ocr_err:
                        print(f"⚠️ [BATCH OCR FALLBACK] {batch_ocr_err}")
                        try:
                            ocr_mgr = get_ocr_manager()
                            recognized_texts = [
                                ocr_mgr.recognize_crop(crop, language=lang, is_vip=True)
                                for crop in box_crops
                            ]
                        except Exception as mgr_err:
                            print(f"⚠️ [OCR MGR ERROR] {mgr_err}")
                            recognized_texts = [""] * len(box_crops)
                
                count = 1
                for (bx1, by1, bx2, by2), recognized_text in zip(valid_boxes, recognized_texts):
                    clean_text = (recognized_text or "").strip()
                    extracted_data.append({
                        "id": count,
                        "box_coordinates": {"x1": int(bx1), "y1": int(by1), "x2": int(bx2), "y2": int(by2)},
                        "japanese": clean_text,
                        "original_text": clean_text,
                        "vietnamese": ""
                    })
                    count += 1
        else:
            # upscale_only: direct original image to upscaling phase without cleaning
            clean_image = image


        # Step 2: VRAM release for clean models before upscaling to prevent OOM
        if task_type == 'clean_and_upscale':
            print("Releasing VRAM of CTD/LaMa/OCR before upscaling...")
            global _ocr_manager, _mocr, text_detector, lama_session
            try:
                del _ocr_manager
                del _mocr
                del text_detector
                del lama_session
            except Exception as e:
                print(f"Error deleting models: {e}")
            _ocr_manager = None
            _mocr = None
            text_detector = None
            lama_session = None
            gc.collect()
            torch.cuda.empty_cache()

        # Step 3: Upscale Phase
        if task_type in ['upscale_only', 'clean_and_upscale']:
            clean_image = run_upscale(clean_image)

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
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": f"{type(e).__name__}: {str(e)}"}
if __name__ == '__main__':
    runpod.serverless.start({"handler": handler})