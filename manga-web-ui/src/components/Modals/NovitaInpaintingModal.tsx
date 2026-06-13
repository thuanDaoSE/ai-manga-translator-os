import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Play, Loader, Check, Info } from 'lucide-react';

interface NovitaInpaintingModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawImageUrl: string;
  maskBase64: string;
  onApplyResult: (newImageUrl: string) => void;
}

export const NovitaInpaintingModal: React.FC<NovitaInpaintingModalProps> = ({
  isOpen,
  onClose,
  rawImageUrl,
  maskBase64,
  onApplyResult
}) => {
  const [prompt, setPrompt] = useState("cleanup, masterpiece, best quality, remove text, fill background");
  const [negativePrompt, setNegativePrompt] = useState("text, logo, watermark, low quality, deformed, blurry");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [taskId, setTaskId] = useState("");
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);

  const apiKey = (import.meta.env.VITE_NOVITA_API_KEY as string) || "";

  if (!isOpen) return null;

  const runTest = async () => {
    if (!apiKey) {
      toast.error("Không tìm thấy VITE_NOVITA_API_KEY trong file .env!");
      return;
    }
    setIsProcessing(true);
    setStatusText("1. Đang chuẩn bị và resize ảnh (giới hạn tối đa 1024px để tránh lỗi)...");
    setResultImageUrl(null);
    setTaskId("");

    try {
      // Load and resize original image and mask
      const resized = await performResize(rawImageUrl, maskBase64);
      
      setStatusText("2. Đang gửi yêu cầu Inpainting lên Novita AI...");
      
      const payload = {
        extra: {
          response_image_type: "png"
        },
        request: {
          model_name: "AnythingV5_v5PrtRE.safetensors",
          prompt: prompt,
          negative_prompt: negativePrompt,
          image_num: 1,
          steps: 25,
          seed: -1,
          clip_skip: 1,
          guidance_scale: 7.5,
          sampler_name: "Euler a",
          mask_blur: 1,
          inpainting_full_res: 1,
          inpainting_full_res_padding: 32,
          inpainting_mask_invert: 0,
          initial_noise_multiplier: 1,
          strength: 0.85,
          image_base64: resized.imageBase64,
          mask_image_base64: resized.maskBase64
        }
      };

      const response = await fetch('https://api.novita.ai/v3/async/inpainting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const resJson = await response.json();
      if (!response.ok) {
        throw new Error(resJson.message || resJson.reason || "Lỗi gửi yêu cầu inpainting");
      }

      const tId = resJson.data?.task_id || resJson.task_id;
      if (!tId) {
        throw new Error("Không nhận được task_id từ Novita!");
      }

      setTaskId(tId);
      setStatusText(`3. Đã nhận Task ID: ${tId}. Bắt đầu kiểm tra kết quả...`);

      // Polling
      let success = false;
      let finalUrl = "";
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 2000));

        const pollRes = await fetch(`https://api.novita.ai/v3/async/task-result?task_id=${tId}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        const pollJson = await pollRes.json();
        
        // Correctly parse task object and status
        const taskObj = pollJson.task || pollJson.data?.task || pollJson;
        const status = taskObj.status || "UNKNOWN";
        const reason = taskObj.reason || "";
        
        setStatusText(`4. Lần thử ${i+1}/120 - Trạng thái: ${status} ${reason ? `(${reason})` : ''}`);

        if (status === "TASK_STATUS_SUCCEED") {
          // Correctly extract the image URL from the images array
          const images = pollJson.images || pollJson.data?.images || [];
          if (images.length > 0) {
            finalUrl = images[0].image_url || images[0].url;
            success = true;
            break;
          }
          throw new Error("Novita báo thành công nhưng không tìm thấy link ảnh!");
        } else if (status === "TASK_STATUS_FAILED") {
          throw new Error(reason || "Novita báo cáo tác vụ thất bại");
        }
      }

      if (success && finalUrl) {
        setResultImageUrl(finalUrl);
        toast.success("Inpainting thành công!");
        setStatusText("Hoàn tất!");
      } else {
        throw new Error("Quá thời gian chờ (timeout) phản hồi từ Novita AI.");
      }

    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Lỗi test Novita AI!");
      setStatusText("Thất bại: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    if (resultImageUrl) {
      onApplyResult(resultImageUrl);
      toast.success("Đã áp dụng ảnh kết quả lên canvas!");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl w-full max-w-lg shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">🧪 Test API Novita Inpainting</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs text-neutral-200">
          {/* API Key Status */}
          <div className="bg-neutral-900 border border-white/5 p-3 rounded-xl flex items-center justify-between">
            <div>
              <p className="font-bold text-white">Trạng thái API Key:</p>
              <p className="text-[10px] text-neutral-400">Được cấu hình qua VITE_NOVITA_API_KEY</p>
            </div>
            {apiKey ? (
              <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full font-bold border border-emerald-500/20">ĐÃ CẤU HÌNH</span>
            ) : (
              <span className="bg-red-500/10 text-red-400 px-2.5 py-1 rounded-full font-bold border border-red-500/20">CHƯA CÓ KEY</span>
            )}
          </div>

          {/* Prompts */}
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-bold text-neutral-400 uppercase tracking-wide text-[10px]">Positive Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-14 bg-neutral-900 border border-white/10 rounded-xl p-2 focus:outline-none focus:border-indigo-500 transition-colors text-white resize-none"
                placeholder="cleanup, masterpiece..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-bold text-neutral-400 uppercase tracking-wide text-[10px]">Negative Prompt</label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                className="w-full h-14 bg-neutral-900 border border-white/10 rounded-xl p-2 focus:outline-none focus:border-indigo-500 transition-colors text-white resize-none"
                placeholder="text, logo, watermark..."
              />
            </div>
          </div>

          {/* Status Display */}
          {statusText && (
            <div className="bg-indigo-950/20 border border-indigo-500/20 p-3 rounded-xl flex items-start gap-2.5">
              <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-indigo-300">Trạng thái xử lý:</p>
                <p className="text-[11px] text-neutral-300 mt-0.5 font-mono leading-relaxed">{statusText}</p>
              </div>
            </div>
          )}

          {/* Results Preview */}
          {resultImageUrl && (
            <div className="border border-white/10 bg-neutral-950 p-2 rounded-xl">
              <p className="font-bold text-white mb-2 text-center text-[10px] uppercase tracking-wider">Ảnh Kết Quả Từ Novita</p>
              <div className="relative aspect-video max-h-48 overflow-hidden rounded-lg bg-black flex items-center justify-center">
                <img src={resultImageUrl} alt="Novita Inpainting Result" className="max-w-full max-h-full object-contain animate-fade-in" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-neutral-900/30 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-neutral-950 hover:bg-neutral-900 text-neutral-400 hover:text-white font-semibold rounded-xl border border-white/5 transition-colors cursor-pointer text-center">
            Hủy
          </button>
          
          {resultImageUrl ? (
            <button onClick={handleApply} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-1.5">
              <Check size={16} /> Áp dụng ảnh
            </button>
          ) : (
            <button
              onClick={runTest}
              disabled={isProcessing || !apiKey}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
            >
              {isProcessing ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
              {isProcessing ? "Đang chạy..." : "Gửi Test"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper: Performs resizing and formats Base64 for original image & mask
const performResize = (rawUrl: string, maskBase64: string): Promise<{ imageBase64: string; maskBase64: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maskImg = new Image();
      maskImg.onload = () => {
        const maxDim = 1024;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        // 1. Resized image to base64
        const imgCanvas = document.createElement('canvas');
        imgCanvas.width = w;
        imgCanvas.height = h;
        const imgCtx = imgCanvas.getContext('2d')!;
        imgCtx.drawImage(img, 0, 0, w, h);
        const imageBase64 = imgCanvas.toDataURL('image/jpeg', 0.9).split(',')[1];

        // 2. Grayscale monochrome mask to base64
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = w;
        maskCanvas.height = h;
        const maskCtx = maskCanvas.getContext('2d')!;
        maskCtx.drawImage(maskImg, 0, 0, w, h);

        const maskData = maskCtx.getImageData(0, 0, w, h);
        const finalMaskCanvas = document.createElement('canvas');
        finalMaskCanvas.width = w;
        finalMaskCanvas.height = h;
        const finalMaskCtx = finalMaskCanvas.getContext('2d')!;
        const finalMaskData = finalMaskCtx.createImageData(w, h);

        for (let i = 0; i < maskData.data.length; i += 4) {
          const alpha = maskData.data[i + 3];
          if (alpha > 10) { // White area for drawn stroke
            finalMaskData.data[i] = 255;
            finalMaskData.data[i + 1] = 255;
            finalMaskData.data[i + 2] = 255;
            finalMaskData.data[i + 3] = 255;
          } else { // Black background
            finalMaskData.data[i] = 0;
            finalMaskData.data[i + 1] = 0;
            finalMaskData.data[i + 2] = 0;
            finalMaskData.data[i + 3] = 255;
          }
        }
        finalMaskCtx.putImageData(finalMaskData, 0, 0);
        const maskBase64 = finalMaskCanvas.toDataURL('image/png').split(',')[1];

        resolve({ imageBase64, maskBase64 });
      };
      maskImg.onerror = () => reject(new Error("Lỗi load ảnh mask!"));
      maskImg.src = maskBase64;
    };
    img.onerror = () => reject(new Error("Lỗi load ảnh gốc!"));
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      img.src = `${rawUrl.split('?')[0]}?nocache=${Date.now()}`;
    } else {
      img.src = rawUrl;
    }
  });
};
