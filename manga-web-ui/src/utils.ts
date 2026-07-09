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

      if (height <= maxHeight) {
        return resolve([file]);
      }

      const fileParts: File[] = [];
      const numParts = Math.ceil(height / maxHeight);

      for (let i = 0; i < numParts; i++) {
        const yOffset = i * maxHeight;
        const sliceHeight = Math.min(maxHeight, height - yOffset);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = sliceHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve([file]);
        }

        ctx.drawImage(img, 0, yOffset, width, sliceHeight, 0, 0, width, sliceHeight);

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
