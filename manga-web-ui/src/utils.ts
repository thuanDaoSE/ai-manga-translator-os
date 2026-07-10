import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function splitLongImage(file: File, maxHeight = 2000): Promise<File[]> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return resolve([file]);
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;

    img.onload = async () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;

      // 🚀 Tự động tính toán chiều cao cắt tối đa dựa trên chiều rộng
      // Đảm bảo tỷ lệ h/w của mỗi phần cắt luôn <= 2.0 (nhỏ hơn giới hạn 2.2 của backend)
      const maxH = Math.min(2000, width * 2.0);

      if (height <= maxH) {
        return resolve([file]);
      }

      // Smart Webtoon Slicing Algorithm - Proxy Analysis
      const targetH = Math.floor(maxH * 0.75);
      const minH = Math.floor(maxH * 0.5);

      const downscaleFactor = 4;
      const proxyWidth = Math.floor(width / downscaleFactor);
      const proxyHeight = Math.floor(height / downscaleFactor);

      if (proxyWidth <= 0 || proxyHeight <= 0) {
        return resolve([file]);
      }

      const proxyCanvas = document.createElement('canvas');
      proxyCanvas.width = proxyWidth;
      proxyCanvas.height = proxyHeight;
      const proxyCtx = proxyCanvas.getContext('2d');
      
      let cutPoints: number[] = [];

      if (!proxyCtx) {
        // Fallback to simple slicing if canvas context is not available
        const numParts = Math.ceil(height / maxH);
        for (let i = 0; i <= numParts; i++) {
          cutPoints.push(Math.min(i * maxH, height));
        }
      } else {
        proxyCtx.drawImage(img, 0, 0, width, height, 0, 0, proxyWidth, proxyHeight);
        let imgData: ImageData;
        try {
          imgData = proxyCtx.getImageData(0, 0, proxyWidth, proxyHeight);
        } catch (e) {
          // Fallback if image data cannot be read (CORS or other canvas restrictions)
          const numParts = Math.ceil(height / maxH);
          cutPoints = [];
          for (let i = 0; i <= numParts; i++) {
            cutPoints.push(Math.min(i * maxH, height));
          }
          imgData = null as any;
        }

        if (imgData) {
          const data = imgData.data;
          const gray = new Float32Array(proxyWidth * proxyHeight);
          for (let i = 0; i < proxyWidth * proxyHeight; i++) {
            const r = data[i * 4];
            const g = data[i * 4 + 1];
            const b = data[i * 4 + 2];
            gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
          }

          const rowStd = new Float32Array(proxyHeight);
          const rowEdgeDensity = new Float32Array(proxyHeight);
          const baseScore = new Float32Array(proxyHeight);

          for (let y = 0; y < proxyHeight; y++) {
            let sum = 0;
            const rowStart = y * proxyWidth;
            for (let x = 0; x < proxyWidth; x++) {
              sum += gray[rowStart + x];
            }
            const mean = sum / proxyWidth;

            let sumSqDiff = 0;
            let edgeSum = 0;
            for (let x = 0; x < proxyWidth; x++) {
              const val = gray[rowStart + x];
              sumSqDiff += (val - mean) * (val - mean);
              if (x > 0) {
                edgeSum += Math.abs(val - gray[rowStart + x - 1]);
              }
            }
            rowStd[y] = Math.sqrt(sumSqDiff / proxyWidth);
            rowEdgeDensity[y] = edgeSum / (proxyWidth - 1 || 1);
            baseScore[y] = rowStd[y] + rowEdgeDensity[y] * 2.0;
          }

          // Smoothing: Box Kernel (size 5)
          const smoothed = new Float32Array(proxyHeight);
          for (let y = 0; y < proxyHeight; y++) {
            let sum = 0;
            let count = 0;
            for (let k = -2; k <= 2; k++) {
              const ny = y + k;
              if (ny >= 0 && ny < proxyHeight) {
                sum += baseScore[ny];
                count++;
              }
            }
            smoothed[y] = sum / count;
          }

          // Search window
          const proxyMinHeight = Math.floor(minH / downscaleFactor);
          const proxyMaxHeight = Math.floor(maxH / downscaleFactor);
          const proxyTargetHeight = Math.floor(targetH / downscaleFactor);
          const penaltyWeight = 0.01;

          const cutPointsProxy: number[] = [0];
          let yCurrProxy = 0;

          while (yCurrProxy < proxyHeight) {
            if (proxyHeight - yCurrProxy <= proxyMaxHeight) {
              cutPointsProxy.push(proxyHeight);
              break;
            }

            const startY = yCurrProxy + proxyMinHeight;
            const endY = Math.min(yCurrProxy + proxyMaxHeight, proxyHeight);

            if (startY >= proxyHeight) {
              cutPointsProxy.push(proxyHeight);
              break;
            }

            const idealCutY = yCurrProxy + proxyTargetHeight;
            let bestScore = Infinity;
            let bestY = startY;

            for (let y = startY; y < endY; y++) {
              const dist = y - idealCutY;
              const penalty = penaltyWeight * (dist * dist);
              const score = smoothed[y] + penalty;
              if (score < bestScore) {
                bestScore = score;
                bestY = y;
              }
            }

            cutPointsProxy.push(bestY);
            yCurrProxy = bestY;
          }

          cutPoints = cutPointsProxy.map(y => y * downscaleFactor);
          if (cutPoints[cutPoints.length - 1] !== height) {
            cutPoints[cutPoints.length - 1] = height;
          }
        }
      }

      // Slice extracting
      const fileParts: File[] = [];
      for (let i = 0; i < cutPoints.length - 1; i++) {
        const y1 = cutPoints[i];
        const y2 = cutPoints[i + 1];
        const sliceHeight = y2 - y1;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = sliceHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        ctx.drawImage(img, 0, y1, width, sliceHeight, 0, 0, width, sliceHeight);

        const blob = await new Promise<Blob | null>((res) => {
          canvas.toBlob((b) => res(b), 'image/jpeg', 0.95);
        });

        if (blob) {
          const extension = file.name.split('.').pop() || 'jpg';
          const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const partFile = new File([blob], `${baseName}_part_${i + 1}.${extension}`, {
            type: 'image/jpeg',
          });
          fileParts.push(partFile);
        }
      }

      resolve(fileParts);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
  });
}
