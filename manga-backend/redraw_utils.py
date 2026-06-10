import cv2
import numpy as np
from skimage import exposure

def pad_to_modulo(img, modulo=32, is_mask=False):
    """
    Pads height and width of BGR images or grayscale masks to be divisible by the modulo.
    Uses BORDER_REFLECT for BGR images and BORDER_CONSTANT (value=0) for masks.
    """
    H, W = img.shape[:2]
    pad_h = (modulo - (H % modulo)) % modulo
    pad_w = (modulo - (W % modulo)) % modulo
    
    if pad_h == 0 and pad_w == 0:
        return img
        
    if is_mask:
        return cv2.copyMakeBorder(img, 0, pad_h, 0, pad_w, cv2.BORDER_CONSTANT, value=0.0)
    else:
        return cv2.copyMakeBorder(img, 0, pad_h, 0, pad_w, cv2.BORDER_REFLECT)

def apply_laplacian_pyramid_blend(orig_img, gen_img, mask, num_levels=6):
    """
    Applies Laplacian Pyramid Blending to blend orig_img and gen_img using the mask.
    This resolves seam/moire artifacts and color drift between original and generated images.
    
    Parameters:
    - orig_img: numpy.ndarray of shape (H, W, 3), original BGR high-res image (uint8 or float32).
    - gen_img: numpy.ndarray of shape (H, W, 3), generated BGR image (uint8 or float32).
    - mask: numpy.ndarray of shape (H, W), grayscale mask (uint8 or float32).
    - num_levels: int, number of levels in the Gaussian and Laplacian pyramids.
    """
    # 1. Standardize inputs to float32 [0.0, 1.0]
    H, W = orig_img.shape[:2]
    
    if orig_img.dtype == np.uint8:
        orig_img_f = orig_img.astype(np.float32) / 255.0
    else:
        orig_img_f = orig_img.astype(np.float32)
        
    if gen_img.dtype == np.uint8:
        gen_img_f = gen_img.astype(np.float32) / 255.0
    else:
        gen_img_f = gen_img.astype(np.float32)
        
    if mask.dtype == np.uint8:
        mask_f = mask.astype(np.float32) / 255.0
    else:
        mask_f = mask.astype(np.float32)

    # 2. Align color distributions to neutralize VAE color drift
    # Match gen_img's histogram to orig_img's histogram
    gen_img_matched = exposure.match_histograms(gen_img_f, orig_img_f, channel_axis=-1)

    # 3. Pad images and mask to modulo 32
    orig_padded = pad_to_modulo(orig_img_f, modulo=32, is_mask=False)
    gen_padded = pad_to_modulo(gen_img_matched, modulo=32, is_mask=False)
    mask_padded = pad_to_modulo(mask_f, modulo=32, is_mask=True)

    # Ensure mask has (H, W, 1) shape for convenient multiplication
    if len(mask_padded.shape) == 2:
        mask_padded = np.expand_dims(mask_padded, axis=-1)

    # 4. Generate Gaussian Pyramids
    gp_a = [orig_padded]
    gp_b = [gen_padded]
    gp_mask = [mask_padded]

    for i in range(num_levels - 1):
        gp_a.append(cv2.pyrDown(gp_a[-1]))
        gp_b.append(cv2.pyrDown(gp_b[-1]))
        gp_mask.append(cv2.pyrDown(gp_mask[-1]))

    # 5. Generate Laplacian Pyramids
    lp_a = [None] * num_levels
    lp_b = [None] * num_levels
    
    lp_a[num_levels-1] = gp_a[num_levels-1]
    lp_b[num_levels-1] = gp_b[num_levels-1]

    for i in range(num_levels - 2, -1, -1):
        size = (gp_a[i].shape[1], gp_a[i].shape[0])
        lp_a[i] = gp_a[i] - cv2.pyrUp(gp_a[i+1], dstsize=size)
        lp_b[i] = gp_b[i] - cv2.pyrUp(gp_b[i+1], dstsize=size)

    # 6. Blend Pyramids
    ls = []
    for i in range(num_levels):
        mask_val = gp_mask[i]
        if len(mask_val.shape) == 2:
            mask_val = np.expand_dims(mask_val, axis=-1)
        
        mask_expanded = np.repeat(mask_val, 3, axis=-1)
        
        ls_level = lp_a[i] * (1.0 - mask_expanded) + lp_b[i] * mask_expanded
        ls.append(ls_level)

    # 7. Reconstruct Image
    reconstructed = ls[num_levels-1]
    for i in range(num_levels - 1, 0, -1):
        size = (ls[i-1].shape[1], ls[i-1].shape[0])
        reconstructed = cv2.pyrUp(reconstructed, dstsize=size) + ls[i-1]

    # 8. Crop final reconstructed image back to original dimensions
    final_img = reconstructed[0:H, 0:W]
    final_img = np.clip(final_img * 255.0, 0, 255).astype(np.uint8)
    
    return final_img
