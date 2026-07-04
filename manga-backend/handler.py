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
text_detector = None
lama_session = None

from torch import nn as nn
from torch.nn import functional as F
import math
import urllib.request
import gc

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
        print("Lazy-loading LaMa session...")
        device_providers = ['CUDAExecutionProvider'] if torch.cuda.is_available() else ['CPUExecutionProvider']
        lama_session = ort.InferenceSession(os.path.join(os.path.dirname(__file__), "lama-manga.onnx"), providers=device_providers)
    return lama_session

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
        ocr_text = get_ocr_manager().recognize_crop(image, language='ja', is_vip=True)
        return {"status": "success", "text": ocr_text}

    # 🟢 3. LỆNH ERASE: Chỉ xóa mảng nhỏ (LaMa)
    elif action == 'erase':
        img_b64 = job_input['image_base64']
        mask_b64 = job_input['mask_base64']
        crop_img = cv2.imdecode(np.frombuffer(base64.b64decode(img_b64), np.uint8), cv2.IMREAD_COLOR)
        crop_mask = cv2.imdecode(np.frombuffer(base64.b64decode(mask_b64), np.uint8), cv2.IMREAD_GRAYSCALE)

        h_crop, w_crop = crop_img.shape[:2]
        
        # Xử lý tự scale và padding cho LaMa
        scale = 1.0
        if h_crop > 512 or w_crop > 512:
            scale = 512.0 / max(h_crop, w_crop)
            new_w, new_h = int(w_crop * scale), int(h_crop * scale)
            crop_img = cv2.resize(crop_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            crop_mask = cv2.resize(crop_mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
        else:
            new_w, new_h = w_crop, h_crop

        pad_bottom, pad_right = 512 - new_h, 512 - new_w
        if pad_bottom > 0 or pad_right > 0:
            crop_img = cv2.copyMakeBorder(crop_img, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
            crop_mask = cv2.copyMakeBorder(crop_mask, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)

        img_t = np.transpose(cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
        mask_t = np.transpose((crop_mask > 0).astype(np.float32)[:, :, np.newaxis], (2, 0, 1))[np.newaxis, ...]

        ort_outs = get_lama_session().run(None, {get_lama_session().get_inputs()[0].name: img_t, get_lama_session().get_inputs()[1].name: mask_t})
        out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255).clip(0, 255).astype(np.uint8)
        clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]

        if scale != 1.0:
            clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)

        _, buffer = cv2.imencode('.png', clean_crop)
        return {"status": "success", "clean_crop_base64": base64.b64encode(buffer).decode('utf-8')}

    # 🟢 4. LỆNH TRANSLATE: Dịch toàn bộ trang truyện (Giữ nguyên code cũ của sếp, bổ sung Modular API và Upscaling)
    task_type = job_input.get('task_type', 'clean_only')
    img_b64 = job_input['image_base64']
    img_data = base64.b64decode(img_b64)
    nparr = np.frombuffer(img_data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    clean_image = image.copy()
    h_img, w_img = image.shape[:2]
    extracted_data = []

    try:
        # Step 1: Clean Phase (CTD + LaMa)
        if task_type in ['clean_only', 'clean_and_upscale']:
            result = get_text_detector()(image)
            ctd_mask = result[0] if isinstance(result, tuple) else result
            if ctd_mask.max() <= 1.0: ctd_mask = (ctd_mask * 255).astype(np.uint8)
            else: ctd_mask = ctd_mask.astype(np.uint8)
            
            _, ctd_mask = cv2.threshold(ctd_mask, 127, 255, cv2.THRESH_BINARY)
            fat_mask = cv2.dilate(ctd_mask, np.ones((7, 7), np.uint8), iterations=2)
            _, white_regions = cv2.threshold(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), 200, 255, cv2.THRESH_BINARY)
            
            smart_mask = cv2.dilate(cv2.bitwise_and(fat_mask, cv2.bitwise_or(ctd_mask, white_regions)), np.ones((3, 3), np.uint8), iterations=1)
            mask = smart_mask.copy()
            mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1)
            
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            count = 1

            ocr_manager = get_ocr_manager()
            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                if w < 16 or h < 16: continue 
                
                japanese_text = ocr_manager.recognize_crop(image[y:y+h, x:x+w], language='ja', is_vip=True)
                extracted_data.append({"id": count, "box_coordinates": {"x1": x, "y1": y, "x2": x+w, "y2": y+h}, "japanese": japanese_text.strip(), "vietnamese": ""})
                count += 1
                
                pad_x, pad_y = max(40, min(int(w * 0.5), 150)), max(40, min(int(h * 0.5), 150))
                x1_pad, y1_pad = max(0, x - pad_x), max(0, y - pad_y)
                x2_pad, y2_pad = min(w_img, x + w + pad_x), min(h_img, y + h + pad_y)
                crop_img = clean_image[y1_pad:y2_pad, x1_pad:x2_pad]
                crop_mask = mask[y1_pad:y2_pad, x1_pad:x2_pad]
                
                if cv2.countNonZero(crop_mask) == 0: continue
                
                h_crop, w_crop = crop_img.shape[:2]
                original_crop_mask = crop_mask.copy()
                
                scale = 1.0
                if h_crop > 512 or w_crop > 512:
                    scale = 512.0 / max(h_crop, w_crop)
                    new_w, new_h = int(w_crop * scale), int(h_crop * scale)
                    crop_img = cv2.resize(crop_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
                    crop_mask = cv2.resize(crop_mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
                else:
                    new_w, new_h = w_crop, h_crop

                pad_bottom, pad_right = 512 - new_h, 512 - new_w
                if pad_bottom > 0 or pad_right > 0:
                    crop_img = cv2.copyMakeBorder(crop_img, 0, pad_bottom, 0, pad_right, cv2.BORDER_REPLICATE)
                    crop_mask = cv2.copyMakeBorder(crop_mask, 0, pad_bottom, 0, pad_right, cv2.BORDER_CONSTANT, value=0)

                img_t = np.transpose(cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0, (2, 0, 1))[np.newaxis, ...]
                mask_t = np.transpose((crop_mask > 0).astype(np.float32)[:, :, np.newaxis], (2, 0, 1))[np.newaxis, ...]

                ort_outs = get_lama_session().run(None, {get_lama_session().get_inputs()[0].name: img_t, get_lama_session().get_inputs()[1].name: mask_t})
                out_img = (np.transpose(ort_outs[0][0], (1, 2, 0)) * 255).clip(0, 255).astype(np.uint8)
                clean_crop = cv2.cvtColor(out_img, cv2.COLOR_RGB2BGR)[0:new_h, 0:new_w]
                
                if scale != 1.0: clean_crop = cv2.resize(clean_crop, (w_crop, h_crop), interpolation=cv2.INTER_CUBIC)
                mask_bool = original_crop_mask > 0
                clean_image[y1_pad:y2_pad, x1_pad:x2_pad][mask_bool] = clean_crop[mask_bool]
        else:
            # upscale_only: direct original image to upscaling phase without cleaning
            clean_image = image

        # Step 2: VRAM release for clean models before upscaling to prevent OOM
        if task_type == 'clean_and_upscale':
            print("Releasing VRAM of CTD/LaMa/OCR before upscaling...")
            global _ocr_manager, text_detector, lama_session
            try:
                del _ocr_manager
                del text_detector
                del lama_session
            except Exception as e:
                print(f"Error deleting models: {e}")
            _ocr_manager = None
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
        return {"status": "error", "message": str(e)}
if __name__ == '__main__':
    runpod.serverless.start({"handler": handler})