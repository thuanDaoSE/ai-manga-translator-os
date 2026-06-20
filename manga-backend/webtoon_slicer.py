import cv2
import numpy as np
import gc
import os
import logging
import tempfile
from typing import Union, List

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# =====================================================================
# THREAD CONTROL (Architectural Principle)
# =====================================================================
# Prevent CPU context-switching thrashing and excessive CPU usage in
# multi-worker environments (e.g., Celery on 2 vCPU VPS) by forcing
# OpenCV to run single-threaded.
cv2.setNumThreads(1)


def slice_webtoon(
    image_input: Union[str, np.ndarray],
    target_height: int = 1500,
    min_height: int = 1000,
    max_height: int = 2000,
    penalty_weight: float = 0.01
) -> List[np.ndarray]:
    """
    Slices extremely long Webtoon vertical images into smaller horizontal chunks
    using optimized "Proxy Analysis". This minimizes memory footprint to prevent
    Out-Of-Memory (OOM) crashes on low-resource environments (e.g., 4GB RAM VPS).

    Parameters:
        image_input (str | np.ndarray): Filepath to the Webtoon image OR a pre-loaded NumPy array (RGB/BGR).
        target_height (int): The mathematically ideal height of each slice in pixels.
        min_height (int): The absolute minimum height allowed for a slice in pixels.
        max_height (int): The absolute maximum height allowed before forcing a cut.
        penalty_weight (float): Coefficient for the quadratic distance penalty. Higher values
                                force cuts closer to target_height, ignoring minor visual gaps.

    Returns:
        List[np.ndarray]: A list of zero-copy slice views extracted from the original image.
    """
    # 1. Load the original image if a path is provided
    if isinstance(image_input, str):
        logger.info(f"Loading original image from path: {image_input}")
        # Note: image remains in memory. To optimize memory, we extract slices as zero-copy views.
        image = cv2.imread(image_input)
        if image is None:
            raise ValueError(f"Could not load image from path: {image_input}")
    else:
        image = image_input

    orig_height, orig_width = image.shape[:2]
    logger.info(f"Original image dimensions: {orig_width}x{orig_height}")

    # Safety check: If image is already smaller than the minimum height, return it as-is
    if orig_height <= min_height:
        logger.info("Image height is within minimum threshold. Returning original image as a single slice.")
        return [image]

    # Validate heights
    assert min_height < max_height, "min_height must be strictly less than max_height."
    assert min_height <= target_height <= max_height, "target_height must be within [min_height, max_height]."

    # =====================================================================
    # PROXY ANALYSIS (Zero-Copy & Memory Optimization)
    # =====================================================================
    downscale_factor = 4
    proxy_width = orig_width // downscale_factor
    proxy_height = orig_height // downscale_factor

    logger.info(f"Creating downscaled proxy image ({proxy_width}x{proxy_height}) with factor {downscale_factor}...")
    
    # Step A: Downscale using cv2.INTER_AREA (best for shrinking)
    proxy_rgb = cv2.resize(image, (proxy_width, proxy_height), interpolation=cv2.INTER_AREA)

    # Step B: Convert to Grayscale
    proxy_gray = cv2.cvtColor(proxy_rgb, cv2.COLOR_BGR2GRAY)

    # Step C: Force Garbage Collection to free the downscaled RGB copy immediately
    del proxy_rgb
    gc.collect()

    # Convert user thresholds to proxy coordinates
    proxy_min_height = min_height // downscale_factor
    proxy_max_height = max_height // downscale_factor
    proxy_target_height = target_height // downscale_factor

    # =====================================================================
    # MATHEMATICAL ANALYSIS (Pillars A & B)
    # =====================================================================
    logger.info("Performing mathematical score computation on proxy...")

    # Pillar A: Variance (Row-wise Standard Deviation)
    # Measures the standard deviation of pixel values along each horizontal row
    row_std = np.std(proxy_gray, axis=1)

    # Pillar B: Edge Density (First-order Spatial Derivatives using Sobel)
    # Calculates changes in brightness across X and Y axes to find sharp boundaries/edges/text
    sobel_x = cv2.Sobel(proxy_gray, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(proxy_gray, cv2.CV_64F, 0, 1, ksize=3)
    magnitude = cv2.magnitude(sobel_x, sobel_y)
    row_edge_density = np.mean(magnitude, axis=1)

    # Free derivatives to conserve memory
    del sobel_x, sobel_y, magnitude
    gc.collect()

    # Synthesis of BaseScore: Low values indicate blank spaces, border lines, or transition gaps
    base_score = row_std + (row_edge_density * 2.0)

    # Smoothing: Apply 1D convolution with a Box Kernel (size 5) to merge adjacent local minima
    box_kernel = np.ones(5) / 5.0
    smoothed_score = np.convolve(base_score, box_kernel, mode="same")

    # =====================================================================
    # ITERATIVE WINDOW SEARCH & DISTANCE PENALTY
    # =====================================================================
    logger.info("Searching for optimal cut points...")
    cut_points_proxy = [0]
    y_curr_proxy = 0

    while y_curr_proxy < proxy_height:
        # Check if remaining height is less than or equal to the max allowed height
        if proxy_height - y_curr_proxy <= proxy_max_height:
            cut_points_proxy.append(proxy_height)
            break

        # Define search window in proxy coordinates
        start_y = y_curr_proxy + proxy_min_height
        end_y = min(y_curr_proxy + proxy_max_height, proxy_height)

        if start_y >= proxy_height:
            cut_points_proxy.append(proxy_height)
            break

        # Candidate indices in the search window
        window_indices = np.arange(start_y, end_y)

        # Ideal cut coordinates relative to current position
        ideal_cut_y = y_curr_proxy + proxy_target_height

        # Calculate quadratic distance penalty
        # This penalizes points far from target_height, guiding the argmin towards it
        distances = window_indices - ideal_cut_y
        penalties = penalty_weight * (distances ** 2)

        # Compute final composite score for window candidates
        window_scores = smoothed_score[window_indices] + penalties

        # Find the index with the minimum score (safest cut point)
        best_local_idx = np.argmin(window_scores)
        best_y_proxy = window_indices[best_local_idx]

        cut_points_proxy.append(best_y_proxy)
        y_curr_proxy = best_y_proxy

    # Convert proxy coordinates back to original image coordinates
    cut_points = [y * downscale_factor for y in cut_points_proxy]
    
    # Ensure the final slice ends exactly at the image boundary
    if cut_points[-1] != orig_height:
        cut_points[-1] = orig_height

    logger.info(f"Slicing complete. Cut points in original coordinates: {cut_points}")

    # =====================================================================
    # ZERO-COPY EXTRACTION (Memory-Friendly NumPy views)
    # =====================================================================
    slices = []
    for i in range(len(cut_points) - 1):
        y1 = cut_points[i]
        y2 = cut_points[i + 1]
        # NumPy slice returns a reference view, avoiding duplication of pixel data in RAM
        slice_view = image[y1:y2, :]
        slices.append(slice_view)

    logger.info(f"Extracted {len(slices)} slices using zero-copy NumPy views.")
    return slices


if __name__ == "__main__":
    import time

    # Helper function to generate mock webtoon content for testing
    def create_mock_webtoon(width: int = 800, height: int = 12000) -> np.ndarray:
        logger.info(f"Generating mock webtoon canvas of size {width}x{height}px...")
        # Start with a white canvas
        canvas = np.ones((height, width, 3), dtype=np.uint8) * 255

        # Draw panels at random intervals with white space gaps
        y = 100
        panel_index = 1
        while y < height - 600:
            panel_height = np.random.randint(600, 1200)
            if y + panel_height >= height - 200:
                break
            
            # Use random colored background for the drawing panel
            color = (np.random.randint(100, 240), np.random.randint(100, 240), np.random.randint(100, 240))
            cv2.rectangle(canvas, (40, y), (width - 40, y + panel_height), color, -1)
            # Draw panel border
            cv2.rectangle(canvas, (40, y), (width - 40, y + panel_height), (40, 40, 40), 3)

            # Draw dummy text-like lines inside panels
            for k in range(3):
                text_y = y + 100 + k * 150
                cv2.rectangle(canvas, (80, text_y), (width - 80, text_y + 30), (80, 80, 80), -1)

            # Add panel label text
            cv2.putText(canvas, f"Panel {panel_index}", (60, y + 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)

            panel_index += 1
            y += panel_height + np.random.randint(150, 400) # Blank white space gutter/gap

        # Draw horizontal lines at the very bottom
        cv2.line(canvas, (0, height - 1), (width, height - 1), (0, 0, 0), 2)
        return canvas

    # 1. Create mock webtoon image
    mock_webtoon = create_mock_webtoon(width=800, height=12000)

    # 2. Slice the image using proxy analysis
    t0 = time.time()
    slices = slice_webtoon(
        image_input=mock_webtoon,
        target_height=1500,
        min_height=1000,
        max_height=2000,
        penalty_weight=0.01
    )
    t1 = time.time()
    logger.info(f"Slicing process finished in {t1 - t0:.4f} seconds.")

    # 3. Determine save directory
    if os.name == "nt":
        # Windows Temp Directory
        output_dir = os.path.join(tempfile.gettempdir(), "slices")
    else:
        # Standard Linux path requested by user
        output_dir = "/tmp/slices"

    os.makedirs(output_dir, exist_ok=True)
    logger.info(f"Saving slices to directory: {output_dir}")

    # 4. Save slices as separate image files
    for idx, slice_img in enumerate(slices):
        slice_path = os.path.join(output_dir, f"slice_{idx + 1:03d}.png")
        cv2.imwrite(slice_path, slice_img)
        logger.info(f"Saved: {slice_path} (Dimensions: {slice_img.shape[1]}x{slice_img.shape[0]})")

    logger.info("Verification execution completed successfully!")
