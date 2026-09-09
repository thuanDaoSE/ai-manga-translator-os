import React, { useEffect, useState, useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { mangaApi, getAuthHeaders } from '../../services/api';
import toast from 'react-hot-toast';
import MangaTextEngine from '../Editor/MangaTextEngine';
import MangaCanvas from '../Editor/MangaCanvas';
import WelcomeScreen from '../Editor/WelcomeScreen';
import { Search, Eraser, Paintbrush, Sparkles, Type as TypeIcon, PanelLeft, PanelRight, ChevronRight, ChevronLeft, Check, Wand2, Settings, ChevronUp, Bolt } from 'lucide-react';
import { FloatingCanvasToolbar } from '../Editor/FloatingCanvasToolbar';
import { RedrawPromptInput } from '../Editor/RedrawPromptInput';
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts';
import { useGlobalErrorHandler } from '../../hooks/useGlobalErrorHandler';
import { useDynamicLoadingText } from '../../hooks/useDynamicLoadingText';
import VisualGuideOverlay from '../Editor/VisualGuideOverlay';
import FloatingTextToolbar from '../Editor/FloatingTextToolbar';
import { useConfigStore } from '../../store/useConfigStore';
import { useServerStatusStore } from '../../store/useServerStatusStore';
import { useHotkeys } from 'react-hotkeys-hook';
import { useMangaEditorStore } from '../../store/useMangaEditorStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Smartphone, ArrowLeft, ArrowRight, Loader2, Languages, Hourglass, Play, Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Helper to convert base64/dataURL to Blob
const dataURLtoBlob = (dataurl: string) => {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

function getPageGroupKey(filename: string): string {
  const match = filename.match(/^(.*)_part_\d+\.[^.]+$/i);
  return match ? match[1] : filename.split('.')[0] || filename;
}


const BoltIcon = () => (
  <svg className="w-3.5 h-3.5 text-amber-500 fill-current inline-block align-middle" viewBox="-11 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.84 26.24c-0.080 0-0.16 0-0.24-0.040-0.4-0.12-0.64-0.52-0.56-0.92l1.32-9.16h-1.52c-0.24 0-0.52-0.12-0.68-0.32s-0.2-0.48-0.16-0.72l2.32-8.68c0.080-0.36 0.44-0.64 0.8-0.64h5.56c0.28 0 0.56 0.16 0.72 0.4s0.16 0.56 0.040 0.8l-2.6 5.12h1.24c0.28 0 0.56 0.16 0.72 0.4s0.16 0.56 0.040 0.8l-6.24 12.48c-0.12 0.28-0.44 0.48-0.76 0.48zM1.92 14.44h1.4c0.24 0 0.48 0.12 0.64 0.28 0.16 0.2 0.24 0.44 0.2 0.68l-0.72 4.92 3.28-6.56h-1.24c-0.28 0-0.56-0.16-0.72-0.4s-0.16-0.56-0.040-0.8l2.6-5.12h-3.56l-1.84 7z"></path>
  </svg>
);

const GrokIcon = ({ className = "w-5 h-5 text-slate-200" }: { className?: string }) => (
  <svg className={className} fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <title>Grok</title>
    <path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"></path>
  </svg>
);

const OpenaiIcon = ({ className = "w-5.5 h-5.5 text-slate-200" }: { className?: string }) => (
  <svg className={className} fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <title>OpenAI</title>
    <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"></path>
  </svg>
);

export default function Workspace() {
  const { t } = useTranslation();
  const isMobileOrTouch = useDeviceDetect();
  const [isMobileAdvisoryDismissed, setIsMobileAdvisoryDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return sessionStorage.getItem('manga_dismiss_mobile_advisory') === 'true';
      } catch (e) {}
    }
    return false;
  });

  const handleDismissMobileAdvisory = () => {
    setIsMobileAdvisoryDismissed(true);
    try {
      sessionStorage.setItem('manga_dismiss_mobile_advisory', 'true');
    } catch (e) {}
  };

  const { signOut, user } = useAuthStore();
  const { currentIndex, processedUrls, fileQueue } = useProjectStore();
  const projectStore = useProjectStore();
  const activeFile = fileQueue[currentIndex];
  const activeGroupKey = activeFile ? getPageGroupKey(activeFile.name) : "";
  const activeGroupPages = fileQueue
    .map((file, idx) => ({ file, idx }))
    .filter(({ file }) => getPageGroupKey(file.name) === activeGroupKey)
    .sort((a, b) => {
      const matchA = a.file.name.match(/_part_(\d+)/i);
      const matchB = b.file.name.match(/_part_(\d+)/i);
      if (matchA && matchB) {
        return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
      }
      return a.file.name.localeCompare(b.file.name);
    });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isEraseProcessingRef = useRef(false);
  const isRedrawProcessingRef = useRef(false);
  const isCtdEraseProcessingRef = useRef(false);
  const [showAiPromptInput, setShowAiPromptInput] = useState(false);
  const [aiErasePrompt, setAiErasePrompt] = useState("");

  const [isBetaTranslating, setIsBetaTranslating] = useState(false);
  const isBetaTranslatingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  
  const translationMode = useConfigStore((s) => s.translationMode);
  const setTranslationMode = useConfigStore((s) => s.setTranslationMode);
  const serverStatus = useServerStatusStore((s) => s.serverStatus);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const [isWaitingConfirm, setIsWaitingConfirm] = useState(false);

  const grokSubModel = useConfigStore((s) => s.grokSubModel);
  const setGrokSubModel = useConfigStore((s) => s.setGrokSubModel);
  const openaiSubModel = useConfigStore((s) => s.openaiSubModel);
  const setOpenaiSubModel = useConfigStore((s) => s.setOpenaiSubModel);
  const studioSubModel = useConfigStore((s) => s.studioSubModel);
  const setStudioSubModel = useConfigStore((s) => s.setStudioSubModel);
  const kieResolution = useConfigStore((s) => s.kieResolution);
  const setKieResolution = useConfigStore((s) => s.setKieResolution);
  const kieOutputFormat = useConfigStore((s) => s.kieOutputFormat);
  const setKieOutputFormat = useConfigStore((s) => s.setKieOutputFormat);

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showAdvancedModels, setShowAdvancedModels] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const startBetaTranslation = async (detectOnly = false) => {
    if (isBetaTranslatingRef.current || isBetaTranslating || isProcessing) return;
    isBetaTranslatingRef.current = true;

    setIsBetaTranslating(true);
    setIsProcessing(true);
    setActionPosition(null);
    setAiStatus("Đang kết nối...");
    projectStore.setPageStatus(currentIndex, "processing");

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const pageId = projectStore.pageIds[currentIndex];

    try {
      if (!displayUrl) throw new Error("Không tìm thấy ảnh gốc.");
      const imageResponse = await fetch(displayUrl);
      const imageBlob = await imageResponse.blob();

      const formData = new FormData();
      formData.append('image', imageBlob, 'image.png');
      formData.append('prompt', 'Clean and translate this page');
      formData.append('translation_mode', translationMode);
      formData.append('detect_only', detectOnly ? 'true' : 'false');
      if (pageId) {
        formData.append('page_id', pageId);
      }

      const configState = useConfigStore.getState();
      formData.append('target_language', configState.targetLanguage);
      formData.append('source_language', configState.sourceLanguage || 'ja');
      formData.append('genre', configState.genre);
      formData.append('tone', configState.tone);
      formData.append('pronoun', configState.pronoun);
 
      const serverStatus = useServerStatusStore.getState().serverStatus;
      formData.append('client_saw_hot', serverStatus === 'HOT' ? 'true' : 'false');

      if (translationMode === 'studio') {
        formData.append('studio_model', studioSubModel);
        formData.append('resolution', kieResolution);
        formData.append('output_format', kieOutputFormat);
      }

      const currentBubbles = useCanvasStore.getState().bubbles;
      if (currentBubbles && currentBubbles.length > 0) {
        formData.append('existing_bubbles', JSON.stringify(currentBubbles));
      }

      const baseUrl = import.meta.env.VITE_API_URL || '';
      const authHeaders = await getAuthHeaders(true);
      const response = await fetch(`${baseUrl}/api/v1/ai-process`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned status: ${response.statusText} (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Trình duyệt không hỗ trợ stream.');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let detectedBoxes: any[] = [];
      let detectedTexts: any[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const cleanPart = part.trim();
          if (!cleanPart) continue;

          if (cleanPart.startsWith('data: ')) {
            const jsonStr = cleanPart.slice(6).trim();
            let event: any;
            try {
              event = JSON.parse(jsonStr);
            } catch (jsonErr: any) {
              console.error('Error parsing JSON chunk:', jsonErr, jsonStr);
              continue;
            }

            if (event.status === 'error') {
              throw new Error(event.message || 'Lỗi không xác định từ server.');
            }

            switch (event.status) {
                case 'image_nsfw_passed':
                  setAiStatus("Kiểm duyệt ảnh...");
                  break;
                case 'nsfw_passed':
                  setAiStatus("Kiểm duyệt prompt...");
                  break;
                case 'kie_progress': {
                  const state = event.state;
                  if (state === 'uploading_r2') {
                    setAiStatus("Đang lưu trữ ảnh...");
                  } else if (state === 'submitting' || state === 'submitting_runpod') {
                    setAiStatus("Đang gửi yêu cầu...");
                  } else if (state === 'waiting' || state === 'queued') {
                    setAiStatus("Đang xếp hàng vẽ lại...");
                  } else if (state === 'running' || state === 'active' || state === 'processing' || state === 'IN_QUEUE' || state === 'IN_PROGRESS') {
                    setAiStatus("Đang vẽ lại ảnh (AI)...");
                  } else if (state === 'resizing') {
                    setAiStatus("Đang xử lý ảnh...");
                  } else if (state === 'success' || state === 'COMPLETED') {
                    setAiStatus("Vẽ lại ảnh hoàn tất!");
                  } else {
                    setAiStatus(`Đang xử lý vẽ lại (${state})...`);
                  }
                  break;
                }
                case 'detect_completed': {
                  setAiStatus(null);
                  setIsProcessing(false);
                  setIsBetaTranslating(false);
                  isBetaTranslatingRef.current = false;
                  projectStore.setPageStatus(currentIndex, "unprocessed");
                  
                  // Load bubbles immediately to screen so the user can inspect/edit them
                  detectedBoxes = event.boxes || [];
                  detectedTexts = event.texts || [];
                  
                  const toolState = useToolStore.getState();
                  const tempBubbles = detectedBoxes.map((box: any, idx: number) => {
                    const x = box.x1;
                    const y = box.y1;
                    const w = box.x2 - box.x1;
                    const h = box.y2 - box.y1;
                    const safeColor = toolState.fontColor || "#000000";
                    return {
                      id: `bubble_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 9)}`,
                      x,
                      y,
                      w,
                      h,
                      text: "",
                      vietnamese: "",
                      japanese: detectedTexts[idx] || "",
                      fontSize: toolState.fontSize || 20,
                      fontFamily: toolState.fontFamily || "Playpen Sans",
                      rotation: 0,
                      boxX: x,
                      boxY: y,
                      boxW: w,
                      boxH: h,
                      outlineWidth: toolState.outlineWidth,
                      outlineColor: safeColor.toLowerCase() === '#000000' ? '#ffffff' : '#000000'
                    };
                  });
                  useCanvasStore.getState().setBubbles(tempBubbles);

                  // Store mask preview URL
                  if (event.mask_base64) {
                    processMaskImage(event.mask_base64).then(processedUrl => {
                      setMaskPreviewUrl(processedUrl);
                    });
                  }
                  setIsWaitingConfirm(true);
                  break;
                }
                case 'text_detected':
                  setAiStatus("Nhận diện chữ...");
                  detectedBoxes = event.boxes || [];
                  detectedTexts = event.texts || [];
                  break;
                case 'translating_text':
                  setAiStatus("Đang dịch nghĩa...");
                  break;
                case 'image_ready':
                  setAiStatus("Đang dịch & vẽ...");
                  if (event.image_base64) {
                    const dataUrl = 'data:image/png;base64,' + event.image_base64;
                    const imageRes = await fetch(dataUrl);
                    const cleanBlob = await imageRes.blob();
                    const newUrl = URL.createObjectURL(cleanBlob);

                    // Lưu lịch sử trong Editor store
                    useMangaEditorStore.getState().saveHistory();
                    useMangaEditorStore.getState().setImageUrl(newUrl);

                    // Đồng bộ URL mới vào projectStore
                    projectStore.setProcessedUrl(currentIndex, newUrl);
                  }
                  break;
                case 'image_failed': {
                  const errMsg = event.error || 'Lỗi không xác định';
                  console.error("Kie.ai Image redraw failed:", errMsg);
                  if (errMsg.toLowerCase().includes('nsfw') || errMsg.toLowerCase().includes('content check') || errMsg.toLowerCase().includes('nhạy cảm')) {
                    throw new Error(`NSFW: ${errMsg}`);
                  }
                  toast.error(`Vẽ lại ảnh thất bại: ${errMsg}`);
                  break;
                }
                case 'translation_ready': {
                  const translations = event.translations || [];
                  const toolState = useToolStore.getState();
                  const newBubbles = detectedBoxes.map((box: any, index: number) => {
                    const x = box.x1;
                    const y = box.y1;
                    const w = box.x2 - box.x1;
                    const h = box.y2 - box.y1;
 
                    const safeColor = toolState.fontColor || "#000000";
                    return {
                      id: `bubble_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 9)}`,
                      x,
                      y,
                      w,
                      h,
                      text: translations[index] || "",
                      vietnamese: translations[index] || "",
                      japanese: detectedTexts[index] || "",
                      fontSize: toolState.fontSize || 20,
                      fontFamily: toolState.fontFamily || "Playpen Sans",
                      rotation: 0,
                      boxX: x,
                      boxY: y,
                      boxW: w,
                      boxH: h,
                      outlineWidth: toolState.outlineWidth,
                      outlineColor: safeColor.toLowerCase() === '#000000' ? '#ffffff' : '#000000'
                    };
                  });
 
                  // Nạp bubbles vào store
                  useCanvasStore.getState().setBubbles(newBubbles);
 
                  // Lưu lưu trữ local/server
                  if (pageId) {
                    mangaApi.savePageBubbles(pageId, newBubbles).catch(err => console.error("Lỗi Auto-Save Bubbles:", err));
                  }

                  // Cập nhật trạng thái hoàn thành để lưu trong projectStore và cập nhật sidebar checkmark
                  projectStore.setPageStatus(currentIndex, "completed");
 

 
                  // Xóa vùng chọn vẽ trên mask
                  const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;
                  const ctx = drawCanvas?.getContext("2d");
                  if (ctx) ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
 
                  toast.success("✨ Dịch và xóa chữ thành công!", { duration: 3000 });
                  setActiveMode("none");
                  break;
                }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast("Đã hủy tiến trình dịch AI.");
        projectStore.setPageStatus(currentIndex, "unprocessed");
        return;
      }
      console.error(err);
      projectStore.setPageStatus(currentIndex, "error");

      const errorMsg = err.message || "";
      if (
        errorMsg.includes("Không phù hợp") || 
        errorMsg.includes("không phù hợp") || 
        errorMsg.includes("Ảnh chứa nội dung") || 
        errorMsg.includes("NSFW") || 
        errorMsg.includes("400")
      ) {
        toast.error("🛑 CẢNH BÁO: Phát hiện nội dung 18+ không hợp lệ. Từ chối phục vụ!", { duration: 6000 });
      } else {
        toast.error("Máy chủ đang quá tải hoặc lỗi mạng, vui lòng thử lại sau.");
      }

      // Đồng bộ ví từ server
      await useAuthStore.getState().fetchProfile();
    } finally {
      isBetaTranslatingRef.current = false;
      setIsBetaTranslating(false);
      setIsProcessing(false);
      setAiStatus(null);
      abortControllerRef.current = null;
    }

  };

  const processMaskImage = (maskBase64: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + maskBase64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('data:image/png;base64,' + maskBase64);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          if (r < 25) {
            // Text area: make it transparent
            data[i+3] = 0;
          } else {
            // Background area: make it a dim translucent dark overlay
            data[i] = 0;      // R (black)
            data[i+1] = 0;    // G (black)
            data[i+2] = 0;    // B (black)
            data[i+3] = 110;  // Alpha (approx 43% opacity)
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL());
      };
      img.onerror = () => {
        resolve('data:image/png;base64,' + maskBase64);
      };
    });
  };

  const handleConfirmSendToKie = async () => {
    setIsWaitingConfirm(false);
    setMaskPreviewUrl(null);
    await startBetaTranslation(false);
  };

  const handleCancelConfirm = () => {
    setIsWaitingConfirm(false);
    setMaskPreviewUrl(null);
    useCanvasStore.getState().setBubbles([]);
  };

  const handleExecuteBetaTranslate = () => {
    startBetaTranslation(false);
  };

  // 1. Lifecycle Garbage Collection
  useEffect(() => {
    const handleBeforeUnload = () => {
      useMangaEditorStore.getState().clearHistory();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      useMangaEditorStore.getState().clearHistory();
    };
  }, []);

  // 🚀 TỐI ƯU HÓA LAYOUT: Chống giật cuộn màn hình khi focus textarea ẩn của Fabric.js
  useEffect(() => {
    const preventScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', preventScroll, { passive: true });
    return () => window.removeEventListener('scroll', preventScroll);
  }, []);

  // 2. Undo/Redo Hotkeys
  useHotkeys('mod+z', (e) => {
    e.preventDefault();
    const canvasStore = useCanvasStore.getState();
    const editorStore = useMangaEditorStore.getState();
    if (canvasStore.past.length > 0) {
      canvasStore.undo();
    } else if (editorStore.past.length > 0) {
      editorStore.undo();
      const newUrl = editorStore.imageUrl;
      if (newUrl) {
        projectStore.setProcessedUrl(currentIndex, newUrl);
      }
    }
  }, { preventDefault: true, enableOnFormTags: false });

  useHotkeys('mod+y, mod+shift+z', (e) => {
    e.preventDefault();
    const canvasStore = useCanvasStore.getState();
    const editorStore = useMangaEditorStore.getState();
    if (canvasStore.future.length > 0) {
      canvasStore.redo();
    } else if (editorStore.future.length > 0) {
      editorStore.redo();
      const newUrl = editorStore.imageUrl;
      if (newUrl) {
        projectStore.setProcessedUrl(currentIndex, newUrl);
      }
    }
  }, { preventDefault: true, enableOnFormTags: false });

  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  // 🚀 ĐẶT Ổ KHÓA BẢO VỆ Ở ĐÂY (Ngay dưới các state đầu file)
  const ignoreSaveRef = useRef(false);

  // 🚀 BẢN VÁ TỐI THƯỢNG: HỆ THỐNG TẢI CHỮ AN TOÀN TUYỆT ĐỐI
  useEffect(() => {
    let isMounted = true;
    const pageId = projectStore.pageIds[projectStore.currentIndex];

    if (!pageId) {
      ignoreSaveRef.current = false;
      return;
    }

    ignoreSaveRef.current = true;

    // 🚀 BÍ QUYẾT TỐI ƯU: Nếu đã có cache thì dán thẳng đồng bộ, tránh nhấp nháy màn hình và gọi mạng!
    const cachedBubbles = mangaApi.getCachedPageBubbles(pageId);
    if (cachedBubbles) {
      useCanvasStore.getState().setBubbles(cachedBubbles);
      ignoreSaveRef.current = false;
      return;
    }

    // Nếu chưa có cache thì mới xóa trắng và tải từ Server
    useCanvasStore.getState().clearBubbles();

    mangaApi.getPageBubbles(pageId)
      .then(data => {
        if (!isMounted) return;

        // ✅ BẢN VÁ: Chuẩn hóa bong bóng từ database để hiển thị bản dịch chuẩn xác
        const loadedBubbles = (data.bubbles || []).map((b: any) => {
          let x = b.x;
          let y = b.y;
          let w = b.w;
          let h = b.h;
          
          if ((x === undefined || y === undefined || w === undefined || h === undefined) && b.box_coordinates) {
            x = b.box_coordinates.x1;
            y = b.box_coordinates.y1;
            w = b.box_coordinates.x2 - b.box_coordinates.x1;
            h = b.box_coordinates.y2 - b.box_coordinates.y1;
          } else if ((x === undefined || y === undefined || w === undefined || h === undefined) && b.rawBox) {
            x = b.rawBox.x1;
            y = b.rawBox.y1;
            w = b.rawBox.x2 - b.rawBox.x1;
            h = b.rawBox.y2 - b.rawBox.y1;
          }
          
          x = x !== undefined ? x : 0;
          y = y !== undefined ? y : 0;
          w = w !== undefined ? w : 100;
          h = h !== undefined ? h : 50;

          const toolState = useToolStore.getState();

          const safeColor = b.fontColor || toolState.fontColor || "#000000";
          return {
            ...b,
            x,
            y,
            w,
            h,
            text: b.text !== undefined && b.text !== "" ? b.text : (b.vietnamese || ""),
            japanese: b.japanese || "",
            vietnamese: b.vietnamese || b.text || "",
            fontSize: b.fontSize || toolState.fontSize || 20,
            fontFamily: b.fontFamily || toolState.fontFamily || "Playpen Sans",
            rotation: b.rotation !== undefined ? b.rotation : 0,
            sfxClass: b.sfxClass || "",
            boxX: b.boxX !== undefined ? b.boxX : x,
            boxY: b.boxY !== undefined ? b.boxY : y,
            boxW: b.boxW !== undefined ? b.boxW : w,
            boxH: b.boxH !== undefined ? b.boxH : h,
            outlineWidth: b.outlineWidth !== undefined ? b.outlineWidth : toolState.outlineWidth,
            outlineColor: b.outlineColor || (safeColor.toLowerCase() === '#000000' ? '#ffffff' : '#000000')
          };
        });
        useCanvasStore.getState().setBubbles(loadedBubbles);

        setTimeout(() => {
          if (isMounted) ignoreSaveRef.current = false;
        }, 100);
      })
      .catch(err => {
        if (isMounted) ignoreSaveRef.current = false;
      });

    return () => { isMounted = false; };
  }, [projectStore.currentIndex, projectStore.pageIds]);

  const { currentZoom, activeMode, setActiveMode, brushSize, setBrushSize, setZoom, isComparing, setIsComparing, actionPosition, setActionPosition, showText, isProcessing, setIsProcessing, isRedrawSessionActive, setIsRedrawSessionActive, viewLayout, setViewLayout } = useToolStore();
  const pageStatuses = useProjectStore((s) => s.pageStatuses);
  const progresses = useProjectStore((s) => s.progresses);
  const isCurrentPageProcessing = pageStatuses[currentIndex] === 'processing' || pageStatuses[currentIndex] === 'waiting';
  const currentProgress = progresses[currentIndex];
  const activeStatus = aiStatus || (isCurrentPageProcessing ? (currentProgress ? `${Math.round(currentProgress.percent)}% - ${currentProgress.message}` : "Đang chuẩn bị...") : null);

  const [rawUrl, setRawUrl] = useState<string | null>(null);

  // 🚀 Đọc/ghi trạng thái phiên vẽ lại từ localStorage để tránh lệch trạng thái khi F5
  const pageId = projectStore.pageIds[currentIndex];
  const fileName = fileQueue[currentIndex]?.name || "";
  const pageKey = pageId || fileName || "default";

  const checkRedrawSessionActive = () => {
    try {
      const sessionsStr = localStorage.getItem("redraw_sessions");
      if (!sessionsStr) return false;
      const sessions = JSON.parse(sessionsStr);
      const timestamp = sessions[pageKey];
      if (!timestamp) return false;
      const now = Date.now();
      if (now - timestamp < 15 * 60 * 1000) {
        return true;
      }
      // Xóa nếu hết hạn
      delete sessions[pageKey];
      localStorage.setItem("redraw_sessions", JSON.stringify(sessions));
      return false;
    } catch (e) {
      return false;
    }
  };

  const persistRedrawSessionActive = (isActive: boolean) => {
    setIsRedrawSessionActive(isActive);
    try {
      const sessionsStr = localStorage.getItem("redraw_sessions") || "{}";
      const sessions = JSON.parse(sessionsStr);
      if (isActive) {
        sessions[pageKey] = Date.now();
      } else {
        delete sessions[pageKey];
      }
      localStorage.setItem("redraw_sessions", JSON.stringify(sessions));
    } catch (e) {
      console.error(e);
    }
  };

  // Đồng bộ trạng thái vẽ lại từ localStorage khi đổi trang hoặc mount
  useEffect(() => {
    const isActive = checkRedrawSessionActive();
    setIsRedrawSessionActive(isActive);
  }, [currentIndex, pageId, setIsRedrawSessionActive]);

  // 🚀 TỰ ĐỘNG CHUYỂN SANG BẢN CUỘN WEBTOON NẾU PHÁT HIỆN HƠN 1 PHẦN CẮT
  useEffect(() => {
    if (activeGroupPages.length > 1) {
      if (viewLayout !== 'webtoon') {
        setViewLayout('webtoon');
      }
    }
  }, [activeGroupPages.length, viewLayout, setViewLayout]);

  // Đăng ký các handler vẽ lại lên store để sidebar gọi được
  useEffect(() => {
    useToolStore.getState().setRedrawHandlers(
      async (prompts: { positive: string; negative: string }) => {
        await handleRedraw(prompts.positive, prompts.negative);
      },
      () => {
        const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;
        const ctx = drawCanvas?.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        setActionPosition(null);
        setRedrawPrompt("");
      }
    );
    return () => {
      useToolStore.getState().setRedrawHandlers(null, null);
    };
  }, [fileQueue, processedUrls, currentIndex, isRedrawSessionActive]);

  const panRef = useRef({ x: 0, y: 0 });
  const workspaceContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPanning = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });
  const startMouse = useRef({ x: 0, y: 0 });
  const isSpaceDown = useRef(false);

  // isProcessing and setIsProcessing are loaded from useToolStore
  const [redrawPrompt, setRedrawPrompt] = useState("");
  const dynamicLoadingText = useDynamicLoadingText(isProcessing);

  const zoomRef = useRef(currentZoom);
  const activeModeRef = useRef(activeMode);

  useEffect(() => { zoomRef.current = currentZoom; }, [currentZoom]);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);

  useEffect(() => {
    setShowAiPromptInput(false);
    setAiErasePrompt("");
  }, [activeMode, currentIndex]);

  // 🚀 KỸ THUẬT MEMORY PRE-LOADING: Tính toán 100% trong RAM rồi mới Render HTML
  useEffect(() => {
    let isMounted = true;
    const file = fileQueue[currentIndex];

    // 🚀 BẢN VÁ 1: XÓA TRẮNG ẢNH CŨ NGAY LẬP TỨC ĐỂ CHỐNG "BÓNG MA"
    if (viewLayout !== 'webtoon') {
      setRawUrl(null);
    }

    // 1. Xác định URL cần tải
    let targetUrl = '';
    let objectUrlToRevoke = '';

    if (file) {
      if (file.size === 0) {
        const pageId = projectStore.pageIds[currentIndex];
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
        targetUrl = `${import.meta.env.VITE_API_URL || ''}/workspace/${projectStore.projectId}/raw/${pageId}.${ext}`;
      } else {
        targetUrl = URL.createObjectURL(file);
        objectUrlToRevoke = targetUrl;
      }
    } else {
      setRawUrl(null);
      return;
    }

    // 2. Tải bức ảnh vào bộ nhớ
    if (viewLayout === 'webtoon') {
      // 🚀 Chế độ Webtoon: gán rawUrl ngay lập tức để tránh khoảng trống và đồng bộ canvas tức thì
      setRawUrl(targetUrl);
      const img = new Image();
      img.onload = () => {
        if (!isMounted) return;
        setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      };
      img.src = targetUrl;
    } else {
      // 🚀 Chế độ chuẩn (Trang đơn): Đợi tính toán kích thước rồi mới hiển thị để chống giật
      const img = new Image();
      img.onload = () => {
        if (!isMounted) return;

        const container = containerRef.current;
        if (container) {
          setImgSize({ w: img.naturalWidth, h: img.naturalHeight });

          const scaleFit = Math.min(container.clientWidth / img.naturalWidth, container.clientHeight / img.naturalHeight) * 0.95;
          const finalScale = Math.max(0.1, Math.min(scaleFit, 3.0));

          panRef.current.x = (container.clientWidth - img.naturalWidth * finalScale) / 2;
          panRef.current.y = (container.clientHeight - img.naturalHeight * finalScale) / 2;

          if (workspaceContainerRef.current) {
            workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${finalScale})`;
          }
          setZoom(finalScale);
        }
        setRawUrl(targetUrl);
      };

      img.onerror = () => {
        if (!isMounted) return;
        setRawUrl(targetUrl);
        projectStore.verifyAndRemovePage(currentIndex);
      };

      img.src = targetUrl;
    }

    return () => {
      isMounted = false;
      if (objectUrlToRevoke) {
        // 🚀 BẢN VÁ: Trì hoãn việc hủy Blob URL 10 giây để tránh lỗi ERR_FILE_NOT_FOUND khi chuyển trang hoặc re-render nhanh
        setTimeout(() => URL.revokeObjectURL(objectUrlToRevoke), 10000);
      }
    };
  }, [currentIndex, fileQueue[currentIndex], projectStore.pageIds[currentIndex], projectStore.projectId, setZoom]);

  const displayUrl = processedUrls[currentIndex] || rawUrl;

  // Điều khiển Chuột & Phím
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.toolbar-container') || target.tagName === 'SELECT' || target.tagName === 'INPUT') return;
      e.preventDefault();

      useToolStore.getState().setActionPosition(null);

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.002;
        const currentZ = zoomRef.current;
        const newZoom = Math.max(0.1, Math.min(currentZ * (1 + delta), 30.0));

        const rect = container.getBoundingClientRect();
        panRef.current.x = (e.clientX - rect.left) - ((e.clientX - rect.left) - panRef.current.x) * (newZoom / currentZ);
        panRef.current.y = (e.clientY - rect.top) - ((e.clientY - rect.top) - panRef.current.y) * (newZoom / currentZ);

        if (workspaceContainerRef.current) workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${newZoom})`;
        zoomRef.current = newZoom;
        setZoom(newZoom);
      } else {
        panRef.current.x -= e.deltaX;
        panRef.current.y -= e.deltaY;
        if (workspaceContainerRef.current) workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.toolbar-container') || target.closest('.react-draggable') || target.closest('.react-resizable-handle') || target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;

      const isHoveringText = useCanvasStore.getState().hoveredBubbleId !== null;
      if (isHoveringText) return;

      const isSpacePan = e.button === 0 && isSpaceDown.current;
      const isMiddleClick = e.button === 1;
      const isLeftClickOnBg = e.button === 0 && activeModeRef.current === 'none';

      if (isMiddleClick || isLeftClickOnBg || isSpacePan) {
        e.preventDefault();
        isPanning.current = true;
        if (container) container.style.cursor = 'grabbing';
        document.body.style.cursor = 'grabbing';
        startMouse.current = { x: e.clientX, y: e.clientY };
        startPan.current = { x: panRef.current.x, y: panRef.current.y };
        useToolStore.getState().setActionPosition(null);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      panRef.current.x = startPan.current.x + (e.clientX - startMouse.current.x);
      panRef.current.y = startPan.current.y + (e.clientY - startMouse.current.y);
      if (workspaceContainerRef.current) workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
    };

    const handleMouseUp = () => {
      if (isPanning.current) {
        isPanning.current = false;
        if (container) container.style.cursor = isSpaceDown.current ? 'grab' : (activeModeRef.current === 'none' ? 'grab' : 'default');
        document.body.style.cursor = isSpaceDown.current ? 'grab' : '';
      }
    };

    // 🚀 BỔ SUNG: TOUCH GESTURES (TOUCH PAN & PINCH-TO-ZOOM) TRÊN MOBILE
    let initialPinchDist = 0;
    let initialPinchZoom = 1;
    let pinchCenter = { x: 0, y: 0 };
    let isTouchPanning = false;
    let startTouchPan = { x: 0, y: 0 };
    let startTouchMouse = { x: 0, y: 0 };

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.toolbar-container') || target.closest('.react-draggable') || target.closest('.react-resizable-handle') || target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;

      const isHoveringText = useCanvasStore.getState().hoveredBubbleId !== null;
      if (isHoveringText) return;

      if (e.touches.length === 2) {
        // 2 ngón tay -> Pinch to zoom
        e.preventDefault();
        isTouchPanning = false;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        initialPinchZoom = zoomRef.current;
        pinchCenter = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
      } else if (e.touches.length === 1 && activeModeRef.current === 'none') {
        // 1 ngón tay ở chế độ 'none' (con trỏ) -> Pan di chuyển canvas
        isTouchPanning = true;
        const touch = e.touches[0];
        startTouchMouse = { x: touch.clientX, y: touch.clientY };
        startTouchPan = { x: panRef.current.x, y: panRef.current.y };
        useToolStore.getState().setActionPosition(null);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDist > 0) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (currentDist > 0) {
          const scaleFactor = currentDist / initialPinchDist;
          const newZoom = Math.max(0.1, Math.min(initialPinchZoom * scaleFactor, 30.0));
          const rect = container.getBoundingClientRect();
          
          const currentZ = zoomRef.current;
          panRef.current.x = (pinchCenter.x - rect.left) - ((pinchCenter.x - rect.left) - panRef.current.x) * (newZoom / currentZ);
          panRef.current.y = (pinchCenter.y - rect.top) - ((pinchCenter.y - rect.top) - panRef.current.y) * (newZoom / currentZ);
          
          if (workspaceContainerRef.current) workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${newZoom})`;
          zoomRef.current = newZoom;
          setZoom(newZoom);
        }
      } else if (e.touches.length === 1 && isTouchPanning) {
        e.preventDefault();
        const touch = e.touches[0];
        panRef.current.x = startTouchPan.x + (touch.clientX - startTouchMouse.x);
        panRef.current.y = startTouchPan.y + (touch.clientY - startTouchMouse.y);
        if (workspaceContainerRef.current) workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDist = 0;
      }
      if (e.touches.length === 0) {
        isTouchPanning = false;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [setZoom]);

  useGlobalShortcuts();
  useGlobalErrorHandler();

  // 3. Replace Base64 State Captures (Refactored to use saveCanvasImageState)
  const handleFillColor = (color: 'white' | 'black') => {
    const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;
    const maskCtx = drawCanvas?.getContext("2d");
    if (!maskCtx?.getImageData(0, 0, drawCanvas.width, drawCanvas.height).data.some((p, i) => i % 4 === 3 && p > 0)) return toast.error("Hãy khoanh vùng đỏ!");

    const fileName = fileQueue[currentIndex]?.name || "";
    const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
    const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${projectStore.projectId}/raw/${projectStore.pageIds[currentIndex]}.${fileExt}`;
    const targetUrl = processedUrls[currentIndex] || serverRawUrl;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = drawCanvas.width;
      tempCanvas.height = drawCanvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;
      tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);

      const maskData = maskCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const targetRGB = color === 'white' ? 255 : 0;

      for (let i = 0; i < maskData.data.length; i += 4) {
        if (maskData.data[i + 3] > 0) {
          imgData.data[i] = targetRGB;
          imgData.data[i + 1] = targetRGB;
          imgData.data[i + 2] = targetRGB;
        }
      }

      tempCtx.putImageData(imgData, 0, 0);

      // Set ref current to canvas being captured
      canvasRef.current = tempCanvas;
      await useMangaEditorStore.getState().saveCanvasImageState(canvasRef.current);

      // Sync stored URL with the project store
      const newUrl = useMangaEditorStore.getState().imageUrl;
      if (newUrl) {
        projectStore.setProcessedUrl(currentIndex, newUrl);
      }

      maskCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      setActiveMode("none");
      setActionPosition(null);
      toast.success(`Đã phủ ${color === 'white' ? 'Trắng' : 'Đen'} siêu tốc!`);
    };
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      img.src = `${targetUrl.split('?')[0]}?nocache=${Date.now()}`;
    } else {
      img.src = targetUrl;
    }
  };

  // 4. AI Backend Integration (Actual Erase Mask)
  const handleErase = async () => {
    if (isEraseProcessingRef.current) return;
    if (!projectStore.pageIds[currentIndex]) return toast.error("Ảnh đang tải lên!");
    const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;
    const ctx = drawCanvas?.getContext("2d");
    if (!ctx?.getImageData(0, 0, drawCanvas.width, drawCanvas.height).data.some((p, i) => i % 4 === 3 && p > 0)) return toast.error("Hãy khoanh vùng đỏ!");

    isEraseProcessingRef.current = true;
    setIsProcessing(true);
    setActionPosition(null);
    try {
      const maskBase64 = drawCanvas.toDataURL("image/png");
      const pageId = projectStore.pageIds[currentIndex];

      const fileName = fileQueue[currentIndex]?.name || "";
      const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
      const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`;
      const targetUrl = processedUrls[currentIndex] || serverRawUrl;

      // Call API
      const newUrl = await mangaApi.eraseMask(targetUrl, maskBase64, pageId);

      // Save history and set image in editor store
      useMangaEditorStore.getState().saveHistory();
      useMangaEditorStore.getState().setImageUrl(newUrl);

      // Sync stored URL with projectStore
      projectStore.setProcessedUrl(currentIndex, newUrl);

      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      toast.success("Đã xóa nền thông minh thành công!");
      
      const posthog = (window as any).posthog;
      if (posthog) {
        posthog.capture('translation_successful', {
          action_type: 'Erase_Mask',
          status: 'success'
        });
      }

      setActiveMode("none");
    } catch (e: any) { 
      toast.error(e.message || "Xử lý xóa nền thất bại!"); 
    } finally { 
      isEraseProcessingRef.current = false;
      setIsProcessing(false); 
    }
  };

  // 4.1. Smart Text Removal (CTD Erase)
  const handleCtdErase = async () => {
    if (isCtdEraseProcessingRef.current) return;
    if (!projectStore.pageIds[currentIndex]) return toast.error("Ảnh đang tải lên!");
    const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;
    const ctx = drawCanvas?.getContext("2d");
    if (!ctx?.getImageData(0, 0, drawCanvas.width, drawCanvas.height).data.some((p, i) => i % 4 === 3 && p > 0)) return toast.error("Hãy khoanh vùng đỏ!");

    isCtdEraseProcessingRef.current = true;
    setIsProcessing(true);
    setActionPosition(null);
    try {
      const maskBase64 = drawCanvas.toDataURL("image/png");
      const pageId = projectStore.pageIds[currentIndex];

      const fileName = fileQueue[currentIndex]?.name || "";
      const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
      const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`;
      const targetUrl = processedUrls[currentIndex] || serverRawUrl;

      // Call API
      const newUrl = await mangaApi.ctdErase(targetUrl, maskBase64, pageId);

      // Save history and set image in editor store
      useMangaEditorStore.getState().saveHistory();
      useMangaEditorStore.getState().setImageUrl(newUrl);

      // Sync stored URL with projectStore
      projectStore.setProcessedUrl(currentIndex, newUrl);

      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      toast.success("Đã xóa chữ thông minh thành công!");
      
      const posthog = (window as any).posthog;
      if (posthog) {
        posthog.capture('translation_successful', {
          action_type: 'Ctd_Erase_Mask',
          status: 'success'
        });
      }

      setActiveMode("none");
    } catch (e: any) { 
      toast.error(e.message || "Xử lý xóa chữ thất bại!"); 
    } finally { 
      isCtdEraseProcessingRef.current = false;
      setIsProcessing(false); 
    }
  };

  // 4.2. AI-Powered Redraw/Erase (AI Redraw Mask)
  const handleAiErase = async (promptText: string) => {
    if (isRedrawProcessingRef.current) return;
    if (!projectStore.pageIds[currentIndex]) return toast.error("Ảnh đang tải lên!");
    const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;
    const ctx = drawCanvas?.getContext("2d");
    if (!ctx?.getImageData(0, 0, drawCanvas.width, drawCanvas.height).data.some((p, i) => i % 4 === 3 && p > 0)) return toast.error("Hãy khoanh vùng đỏ!");

    isRedrawProcessingRef.current = true;
    setIsProcessing(true);
    setActionPosition(null);
    setShowAiPromptInput(false);

    toast("Đang xử lý Xóa với AI...", { icon: "✨", duration: 2500 });

    try {
      const maskBase64 = drawCanvas.toDataURL("image/png");
      const pageId = projectStore.pageIds[currentIndex];

      const fileName = fileQueue[currentIndex]?.name || "";
      const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
      const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`;
      const targetUrl = processedUrls[currentIndex] || serverRawUrl;

      const finalPrompt = promptText.trim() || "clean background, erase text, restore original manga artwork";

      // Call API
      const newUrl = await mangaApi.aiRedrawMask(
        targetUrl,
        maskBase64,
        finalPrompt,
        translationMode,
        pageId
      );

      // Save history and set image in editor store
      useMangaEditorStore.getState().saveHistory();
      useMangaEditorStore.getState().setImageUrl(newUrl);

      // Sync stored URL with projectStore
      projectStore.setProcessedUrl(currentIndex, newUrl);

      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      toast.success("Xóa với AI thành công!");
      
      const posthog = (window as any).posthog;
      if (posthog) {
        posthog.capture('translation_successful', {
          action_type: 'Ai_Redraw_Mask_Erase',
          status: 'success'
        });
      }

      setActiveMode("none");
      setAiErasePrompt("");
      await useAuthStore.getState().fetchProfile();
    } catch (e: any) { 
      toast.error(e.message || "Xử lý vẽ lại bằng AI thất bại!"); 
      await useAuthStore.getState().fetchProfile();
    } finally { 
      isRedrawProcessingRef.current = false;
      setIsProcessing(false); 
    }
  };

  // 4.5. AI Redraw Integration (Waifu SDXL Model)
  const handleRedraw = async (positivePrompt: string, negativePrompt: string) => {
    if (isRedrawProcessingRef.current) return;
    if (!positivePrompt.trim()) return toast.error("Vui lòng nhập prompt!");
    if (!projectStore.pageIds[currentIndex]) return toast.error("Ảnh đang tải lên!");
    const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;
    const ctx = drawCanvas?.getContext("2d");
    if (!ctx?.getImageData(0, 0, drawCanvas.width, drawCanvas.height).data.some((p, i) => i % 4 === 3 && p > 0)) return toast.error("Hãy khoanh vùng đỏ!");

    isRedrawProcessingRef.current = true;
    setIsProcessing(true);
    setActionPosition(null);
    
    toast("Đang xử lý vẽ lại bằng AI...", { icon: "🎨", duration: 2000 });

    try {
      const maskBase64 = drawCanvas.toDataURL("image/png");
      const pageId = projectStore.pageIds[currentIndex];

      const fileName = fileQueue[currentIndex]?.name || "";
      const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
      const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`;
      const targetUrl = processedUrls[currentIndex] || serverRawUrl;

      // Call API with originalImageHash to prevent hash mismatch
      const originalImageHash = pageId || fileName || "default";
      const { newUrl, updatedPages } = await mangaApi.redrawMask(targetUrl, maskBase64, positivePrompt, pageId, negativePrompt, originalImageHash);

      // Save history and set image in editor store
      useMangaEditorStore.getState().saveHistory();
      useMangaEditorStore.getState().setImageUrl(newUrl);

      // Sync stored URL with projectStore
      projectStore.setProcessedUrl(currentIndex, newUrl);

      // Sync all other boundary-stitched updated pages
      if (updatedPages) {
        Object.entries(updatedPages).forEach(([pid, purl]) => {
          const idxStr = Object.keys(projectStore.pageIds).find(
            (k) => projectStore.pageIds[Number(k)] === pid
          );
          if (idxStr !== undefined) {
            const idx = Number(idxStr);
            if (idx !== currentIndex) {
              projectStore.setProcessedUrl(idx, purl as string);
            }
          }
        });
      }

      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      toast.success("Vẽ lại vùng chọn bằng AI thành công!");
      
      const posthog = (window as any).posthog;
      if (posthog) {
        posthog.capture('translation_successful', {
          action_type: 'Redraw_Mask',
          status: 'success'
        });
      }

      setActiveMode("none");
      setRedrawPrompt("");
      // Lưu lại trạng thái vẽ lại hoạt động vào localStorage
      persistRedrawSessionActive(true);
      // Đồng bộ ví từ server
      await useAuthStore.getState().fetchProfile();
    } catch (e: any) {
      toast.error(e.message || "Vẽ lại bằng AI thất bại!");
      // Hoàn lại xu hoặc đồng bộ lại ví chính xác từ server
      await useAuthStore.getState().fetchProfile();
    } finally {
      isRedrawProcessingRef.current = false;
      setIsProcessing(false);
    }
  };


  // Tải Custom Fonts
  useEffect(() => {
    const loadCustomFonts = async () => {
      try {
        const data = await mangaApi.getFonts();
        data.fonts.forEach((fontName: string) => {
          const familyName = fontName.replace(/\.[^/.]+$/, "");
          const fontUrl = `${import.meta.env.VITE_API_URL || ''}/workspace/fonts/${fontName}`;
          const newFont = new FontFace(familyName, `url(${fontUrl})`);
          newFont.load().then((loadedFace) => {
            (document.fonts as any).add(loadedFace);
          }).catch(err => console.error("Lỗi load font:", err));
        });
      } catch (e) { }
    };
    loadCustomFonts();
  }, []);

  const cleanImageOpacity = isComparing ? 'opacity-0' : (activeMode === 'restore' ? 'opacity-50' : 'opacity-100');

  // 🚀 HỆ THỐNG AUTO-SAVE MỚI (TUÂN THỦ Ổ KHÓA)
  const currentBubbles = useCanvasStore(state => state.bubbles);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const latestBubbles = useRef(currentBubbles);
  const latestPageId = useRef(projectStore.pageIds[currentIndex]);

  // 1. Luôn backup dữ liệu mới nhất vào RAM mỗi mili-giây
  useEffect(() => {
    latestBubbles.current = currentBubbles;
    latestPageId.current = projectStore.pageIds[currentIndex];
  }, [currentBubbles, projectStore.pageIds, currentIndex]);

  // 2. KHI ĐỔI TRANG: Ép lưu dữ liệu trang cũ ngay lập tức (Cứu tinh chống mất chữ)
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current && latestPageId.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        mangaApi.savePageBubbles(latestPageId.current, latestBubbles.current).catch(() => { });
      }
    };
  }, [currentIndex]);

  // 3. KHI USER GÕ CHỮ: Hẹn giờ lưu
  useEffect(() => {
    // 🚀 NẾU Ổ KHÓA ĐANG ĐÓNG (nghĩa là đang chuyển trang) -> CẤM LƯU ĐỂ CHỐNG XÓA DATABASE!
    if (ignoreSaveRef.current) return;

    const pageId = projectStore.pageIds[currentIndex];
    if (!pageId) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      mangaApi.savePageBubbles(pageId, useCanvasStore.getState().bubbles).catch(err => console.error("Lỗi Auto-Save:", err));
      saveTimeoutRef.current = null;
    }, 500);

  }, [currentBubbles]);

  // 🚀 TÌM KIẾM ĐƯỜNG LINK ẢNH SẠCH NGUYÊN THỦY TỪ LỊCH SỬ
  const originalCleanUrl = (() => {
    if (!rawUrl || rawUrl.startsWith('blob:')) return '';
    return rawUrl.replace("/raw/", "/clean/");
  })();

  return (
    // TẦNG 0: NỀN APP TỔNG THỂ (#121212)
    <div className="flex-1 bg-[#121212] relative overflow-hidden flex flex-col items-center justify-center">
      {/* 📱 Cảnh Báo Mềm Cho Thiết Bị Di Động (Soft Dismissible Advisory) */}
      {isMobileOrTouch && !isMobileAdvisoryDismissed && (
        <div className="fixed inset-0 z-[9999] bg-[#0c0c0e]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white font-sans overflow-auto select-none animate-in fade-in duration-300">
          {/* Glowing background orbs */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-1/4 left-1/3 w-[200px] h-[200px] bg-purple-500/5 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative max-w-md w-full bg-[#16161a]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col items-center gap-5 animate-in zoom-in-95 duration-300">
            {/* Animated Device Icon Container */}
            <div className="relative flex items-center justify-center w-16 h-16 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
              <Smartphone size={32} strokeWidth={1.5} className="animate-pulse" />
              <div className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 items-center justify-center text-[9px] font-black text-black">!</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-base font-extrabold text-white tracking-tight uppercase flex items-center justify-center gap-2">
                {t('workspace.mobileBlockTitle')}
              </h2>
              <p className="text-xs text-gray-300 leading-relaxed text-left bg-neutral-900/70 p-3.5 rounded-xl border border-white/5 font-medium">
                {t('workspace.mobileBlockDesc')}
              </p>
            </div>

            {/* Action Buttons: Continue vs Back */}
            <div className="w-full space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handleDismissMobileAdvisory}
                className="w-full flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer border border-white/15"
              >
                <span>{t('workspace.continueOnMobile', 'Tôi đã hiểu, tiếp tục trên điện thoại')}</span>
                <ArrowRight size={14} strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-neutral-400 hover:text-white font-medium text-xs rounded-xl transition-all cursor-pointer border border-white/5"
              >
                <ArrowLeft size={13} strokeWidth={2} />
                <span>{t('workspace.backToHome')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 KHUNG VIEWPORT (Vẫn giữ nguyên kích thước để thuật toán Zoom tính toán đúng, nhưng "tàng hình" khi chưa có ảnh) */}
      <div
        ref={containerRef}
        className={`absolute top-4 left-4 right-4 bottom-[90px] rounded-2xl transition-all duration-300 ease-in-out ${displayUrl ? 'ring-1 ring-white/10 shadow-[0_0_40px_rgba(0,0,0,0.5)_inset] overflow-hidden' : 'opacity-0 pointer-events-none'}`}
        style={{
          cursor: activeMode === 'none' ? 'grab' : 'default',
          backgroundImage: displayUrl ? 'repeating-conic-gradient(#202020 0% 25%, #181818 0% 50%)' : 'none',
          backgroundSize: displayUrl ? '24px 24px' : 'auto',
          backgroundPosition: displayUrl ? 'center center' : 'auto'
        }}
      >
        {displayUrl && (
          <div
            id="workspace-container"
            ref={workspaceContainerRef}
            className="absolute left-0 top-0 shadow-2xl origin-top-left"
            style={{
              width: imgSize.w > 0 ? `${imgSize.w}px` : 'auto',
              height: viewLayout === 'webtoon' ? 'auto' : (imgSize.h > 0 ? `${imgSize.h}px` : 'auto'),
              transform: `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${currentZoom})`
            }}
          >
            {viewLayout === 'webtoon' ? (
              <div className="flex flex-col gap-0 m-0 p-0" style={{ width: imgSize.w > 0 ? `${imgSize.w}px` : 'auto' }}>

                {activeGroupPages.map(({ file, idx }) => {
                  if (idx === currentIndex) {
                    return (
                      <div key={idx} className={`relative m-0 p-0 ${viewLayout === 'webtoon' ? '' : 'animate-fade-in'}`} style={{ width: imgSize.w > 0 ? `${imgSize.w}px` : 'auto', height: viewLayout === 'webtoon' ? 'auto' : (imgSize.h > 0 ? `${imgSize.h}px` : 'auto'), marginTop: viewLayout === 'webtoon' ? '-1px' : '0px' }}>
                        <img src={rawUrl || undefined} crossOrigin="anonymous" alt="Manga Raw" className={`block w-full ${viewLayout === 'webtoon' ? 'h-auto' : 'h-full'} pointer-events-none select-none ph-no-capture`} style={{ imageRendering: 'pixelated' }} draggable={false} onDragStart={(e) => e.preventDefault()} />
                        <img src={displayUrl || undefined} crossOrigin="anonymous" alt="Manga Clean" className={`absolute inset-0 block max-w-none w-full ${viewLayout === 'webtoon' ? 'h-auto' : 'h-full'} pointer-events-none select-none transition-opacity duration-300 ${cleanImageOpacity} ph-no-capture`} draggable={false} onDragStart={(e) => e.preventDefault()} />
                        <div className={`absolute inset-0 w-full h-full ${isComparing ? 'opacity-0 pointer-events-none' : 'opacity-100'} ${isCurrentPageProcessing ? 'pointer-events-none' : ''}`}>
                          <MangaCanvas rawUrl={rawUrl} displayUrl={displayUrl} originalCleanUrl={originalCleanUrl} />
                          <VisualGuideOverlay />
                          <div className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${showText ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <MangaTextEngine imgWidth={imgSize.w} imgHeight={imgSize.h} />
                            {showText && <FloatingTextToolbar />}
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <WebtoonImage
                        key={idx}
                        file={file}
                        pageId={projectStore.pageIds[idx]}
                        projectId={projectStore.projectId || undefined}
                        processedUrl={processedUrls[idx]}
                        onPointerDown={() => projectStore.setCurrentIndex(idx)}
                        width={imgSize.w}
                      />
                    );
                  }
                })}
              </div>
            ) : (
              <>
                <img src={rawUrl || undefined} crossOrigin="anonymous" alt="Manga Raw" className="block m-0 p-0 pointer-events-none select-none ph-no-capture" style={{ width: imgSize.w > 0 ? `${imgSize.w}px` : undefined, height: imgSize.h > 0 ? `${imgSize.h}px` : undefined, imageRendering: 'pixelated' }} draggable={false} onDragStart={(e) => e.preventDefault()} />
                <img src={displayUrl || undefined} crossOrigin="anonymous" alt="Manga Clean" className={`absolute inset-0 block max-w-none m-0 p-0 pointer-events-none select-none transition-opacity duration-300 ${cleanImageOpacity} ph-no-capture`} style={{ width: imgSize.w > 0 ? `${imgSize.w}px` : undefined, height: imgSize.h > 0 ? `${imgSize.h}px` : undefined }} draggable={false} onDragStart={(e) => e.preventDefault()} />
                <div className={`absolute inset-0 w-full h-full ${isComparing ? 'opacity-0 pointer-events-none' : 'opacity-100'} ${isCurrentPageProcessing ? 'pointer-events-none' : ''}`}>
                  <MangaCanvas rawUrl={rawUrl} displayUrl={displayUrl} originalCleanUrl={originalCleanUrl} />
                  <VisualGuideOverlay />
                  <div className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${showText ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <MangaTextEngine imgWidth={imgSize.w} imgHeight={imgSize.h} />
                    {showText && <FloatingTextToolbar />}
                  </div>
                </div>
              </>
            )}
            {/* 🏁 Pixel Grid Overlay for Zoom level >= 8x (Photoshop style) */}
            {currentZoom >= 8 && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, rgba(255, 255, 255, 0.2) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 1px, transparent 1px)
                  `,
                  backgroundSize: '1px 1px',
                  mixBlendMode: 'difference',
                  opacity: Math.min(1.0, (currentZoom - 8) / 4)
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* 🚀 BẢN VÁ UX: MÀN HÌNH WELCOME ĐƯỢC GIẢI PHÓNG RA NGOÀI */}
      {/* Nó sẽ chiếm trọn không gian trống và đè lên khung tàng hình ở trên */}
      {/* ========================================================= */}
      {/* 🚀 BẢN VÁ UX 1: CHỈ HIỆN WELCOME KHI DANH SÁCH TRỐNG TRƠN */}
      {fileQueue.length === 0 && (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center z-10 bg-[#121212]">
          <WelcomeScreen />
        </div>
      )}

      {/* 🚀 BẢN VÁ UX 2: HIỆU ỨNG LOADING MƯỢT MÀ KHI CHUYỂN TRANG */}
      {fileQueue.length > 0 && !displayUrl && viewLayout !== 'webtoon' && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center z-10 bg-[#121212]">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
          <p className="text-text-muted text-[13px] mt-4 font-semibold tracking-widest uppercase animate-pulse">
            {t('sidebar.loadingImage')}
          </p>
        </div>
      )}
      {/* ========================================================= */}

      {/* TẦNG 3: THANH TOOLBAR & CỤC NÚT (Nằm ngoài cùng) */}

      {/* 🚀 TẦNG 3: THANH TOOLBAR & CÁC NÚT (Nằm ngoài cùng) */}
      {displayUrl && (
        <>
          <FloatingCanvasToolbar />


          {actionPosition && activeMode === 'erase' && (
            <>
              {showAiPromptInput ? (
                <div className="absolute bottom-[82px] left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300 flex items-center gap-2 p-1.5 bg-[#2A2A2A]/90 backdrop-blur-md ring-1 ring-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-2xl pointer-events-auto w-[430px]">
                  {/* Model AI selection (Grok/KIE models) */}
                  <div className="relative flex items-center shrink-0" ref={dropdownRef}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowModelDropdown(!showModelDropdown);
                      }}
                      disabled={isCurrentPageProcessing || isProcessing}
                      className="flex items-center justify-center w-7.5 h-7.5 rounded-xl hover:bg-white/10 transition-all cursor-pointer overflow-hidden border border-white/10 bg-black/40 hover:scale-105 active:scale-95 shadow-sm"
                      title="Chọn mô hình AI"
                    >
                      {translationMode === 'grok' && (
                        <GrokIcon className="w-4 h-4 text-slate-200" />
                      )}
                      {translationMode === 'studio' && studioSubModel === 'gpt-image-2-image-to-image' && (
                        <OpenaiIcon className="w-4 h-4 text-white" />
                      )}
                      {translationMode === 'studio' && studioSubModel !== 'gpt-image-2-image-to-image' && (
                        <img src="/nanobanana.webp" className="w-full h-full object-cover" alt="Studio" />
                      )}
                    </button>

                    {showModelDropdown && (
                      <div 
                        onClick={(e) => e.stopPropagation()} 
                        className="absolute bottom-10 left-0 w-64 bg-[#141417]/95 backdrop-blur-md border border-white/10 rounded-xl p-2 shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex flex-col gap-1 z-[210] text-left pointer-events-auto"
                      >
                        {/* Tiêu đề */}
                        <div className="px-2 py-0.5 border-b border-white/5 mb-0.5 select-none flex items-center justify-between">
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Mô hình AI</span>
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAdvancedModels(!showAdvancedModels);
                            }}
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <span className="text-[8px] font-black text-slate-400 select-none uppercase tracking-wider">Tùy chọn</span>
                            <div className={`w-6 h-3.5 rounded-full p-0.5 transition-all duration-200 ${showAdvancedModels ? 'bg-amber-500' : 'bg-white/10'}`}>
                              <div className={`w-2.5 h-2.5 rounded-full bg-[#141417] transition-all duration-200 transform ${showAdvancedModels ? 'translate-x-2.5' : 'translate-x-0'}`} />
                            </div>
                          </div>
                        </div>

                        {/* Grok */}
                        <div
                          onClick={() => setTranslationMode('grok')}
                          className={`w-full text-left p-1.5 rounded-lg hover:bg-white/5 flex flex-col gap-1 transition-all cursor-pointer ${translationMode === 'grok' ? 'bg-amber-500/5' : ''}`}
                        >
                          <div className="flex items-start gap-2 w-full">
                            <div className="flex-shrink-0 w-6 h-6 rounded bg-black border border-white/10 flex items-center justify-center">
                              <GrokIcon className="w-3.5 h-3.5 text-slate-200" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-200">Grok Imagine</span>
                                <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
                                  Nhanh
                                </span>
                              </div>
                              <p className="text-[8px] text-slate-400 leading-normal truncate">
                                Mô hình Grok mới nhất
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* OpenAI GPT */}
                        <div className={`w-full text-left p-1.5 rounded-lg flex flex-col gap-1 transition-all ${translationMode === 'studio' && studioSubModel === 'gpt-image-2-image-to-image' ? 'bg-amber-500/5' : ''}`}>
                          <div
                            onClick={() => {
                              setTranslationMode('studio');
                              setStudioSubModel('gpt-image-2-image-to-image');
                            }}
                            className="flex items-start gap-2 w-full cursor-pointer hover:bg-white/5 p-1 rounded"
                          >
                            <div className="flex-shrink-0 w-6 h-6 rounded bg-[#10a37f] border border-white/10 flex items-center justify-center">
                              <OpenaiIcon className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-200">GPT Image 2</span>
                                <span className="text-[9px] font-bold text-sky-400 flex items-center gap-0.5">
                                  Chi tiết
                                </span>
                              </div>
                              <p className="text-[8px] text-slate-400 leading-normal truncate">
                                OpenAI image-to-image
                              </p>
                            </div>
                          </div>
                          {showAdvancedModels && translationMode === 'studio' && studioSubModel === 'gpt-image-2-image-to-image' && (
                            <div className="flex flex-col gap-1 pl-8 mt-1 select-none">
                              <span className="text-[7.5px] font-semibold text-slate-500 uppercase tracking-wider">Độ phân giải:</span>
                              <div className="flex gap-1.5">
                                {(['1K', '2K'] as const).map((res) => (
                                  <button
                                    key={res}
                                    type="button"
                                    onClick={() => {
                                      setKieResolution(res);
                                    }}
                                    className={`text-[8px] px-1.5 py-0.5 rounded transition-all font-black cursor-pointer ${
                                      kieResolution === res
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-white/5 text-slate-400 hover:text-slate-200'
                                    }`}
                                  >
                                    {res}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Nano Banana */}
                        <div className={`w-full text-left p-1.5 rounded-lg flex flex-col gap-1 transition-all ${translationMode === 'studio' && studioSubModel !== 'gpt-image-2-image-to-image' ? 'bg-amber-500/5' : ''}`}>
                          <div
                            onClick={() => {
                              setTranslationMode('studio');
                              if (studioSubModel === 'gpt-image-2-image-to-image') {
                                setStudioSubModel('nano-banana-2');
                              }
                            }}
                            className="flex items-start gap-2 w-full cursor-pointer hover:bg-white/5 p-1 rounded"
                          >
                            <div className="flex-shrink-0 w-6 h-6 rounded border border-white/10 flex items-center justify-center overflow-hidden">
                              <img src="/nanobanana.webp" className="w-full h-full object-cover" alt="Studio" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-200">Nano Banana</span>
                                <span className="text-[9px] font-bold text-amber-400 flex items-center gap-0.5">
                                  Studio
                                </span>
                              </div>
                              <p className="text-[8px] text-slate-400 leading-normal truncate">
                                Dịch ảnh giữ chi tiết gốc
                              </p>
                            </div>
                          </div>
                          {showAdvancedModels && translationMode === 'studio' && studioSubModel !== 'gpt-image-2-image-to-image' && (
                            <>
                              <div className="flex flex-col gap-1 pl-8 mt-1 select-none">
                                <span className="text-[7.5px] font-semibold text-slate-500 uppercase tracking-wider">Mô hình:</span>
                                <div className="flex flex-col gap-0.5">
                                  {[
                                    { id: 'google/nano-banana-edit', name: 'nano banana v1' },
                                    { id: 'nano-banana-2', name: 'nano banana v2' },
                                    { id: 'nano-banana-pro', name: 'nano banana v2 pro' }
                                  ].map((m) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() => {
                                        setStudioSubModel(m.id as any);
                                      }}
                                      className={`w-full text-left text-[8px] px-1.5 py-0.5 rounded transition-all font-black cursor-pointer ${
                                        studioSubModel === m.id
                                          ? 'bg-amber-500/20 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                                          : 'bg-white/5 text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      {m.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1 pl-8 mt-1 select-none">
                                <span className="text-[7.5px] font-semibold text-slate-500 uppercase tracking-wider">Độ phân giải:</span>
                                <div className="flex gap-1.5">
                                  {(['1K', '2K'] as const).map((res) => (
                                    <button
                                      key={res}
                                      type="button"
                                      onClick={() => {
                                        setKieResolution(res);
                                      }}
                                      className={`text-[8px] px-1.5 py-0.5 rounded transition-all font-black cursor-pointer ${
                                        kieResolution === res
                                          ? 'bg-amber-500/20 text-amber-400'
                                          : 'bg-white/5 text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      {res}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    className="flex-1 px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs font-medium placeholder-white/30 focus:outline-none focus:border-primary/50"
                    placeholder="Mô tả vẽ lại (để trống để tự động làm sạch)..."
                    value={aiErasePrompt}
                    onChange={(e) => setAiErasePrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAiErase(aiErasePrompt);
                      }
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => handleAiErase(aiErasePrompt)}
                    disabled={isCurrentPageProcessing || isProcessing}
                    className="px-3.5 py-1.5 rounded-xl font-bold text-xs bg-primary text-white hover:bg-primary/80 disabled:opacity-50 cursor-pointer transition-colors shadow-sm shrink-0"
                  >
                    Thực hiện
                  </button>
                  <button
                    onClick={() => setShowAiPromptInput(false)}
                    className="px-2.5 py-1.5 rounded-xl font-bold text-xs bg-white/5 text-white/70 hover:bg-white/10 cursor-pointer transition-colors shrink-0"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <div className="absolute bottom-[82px] left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300 flex items-center gap-1 p-1 bg-[#2A2A2A]/90 backdrop-blur-md ring-1 ring-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-xl pointer-events-auto">
                  {/* Button 1: Xóa nền thông minh */}
                  <button 
                    onClick={handleErase} 
                    disabled={isCurrentPageProcessing || isProcessing} 
                    className="relative flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg font-bold text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white disabled:opacity-50 transition-all cursor-pointer group shadow-sm"
                  >
                    {(isCurrentPageProcessing || isProcessing) ? <Loader2 className="animate-spin" size={14} /> : <Wand2 size={14} className="group-hover:text-white transition-colors" />}
                    <span>{(isCurrentPageProcessing || isProcessing) ? dynamicLoadingText : "✨ Xóa nền thông minh"}</span>
                  </button>

                  <div className="w-px h-6 bg-border mx-0.5"></div>

                  {/* Button 2: Xóa chữ thông minh */}
                  <button 
                    onClick={handleCtdErase} 
                    disabled={isCurrentPageProcessing || isProcessing} 
                    className="relative flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg font-bold text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 disabled:opacity-50 transition-all cursor-pointer group shadow-sm"
                  >
                    {(isCurrentPageProcessing || isProcessing) ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} className="group-hover:text-slate-950 transition-colors" />}
                    <span>{(isCurrentPageProcessing || isProcessing) ? dynamicLoadingText : "✨ Xóa chữ thông minh"}</span>
                  </button>

                  <div className="w-px h-6 bg-border mx-0.5"></div>

                  {/* Button 3: Xóa với AI */}
                  <button 
                    onClick={() => setShowAiPromptInput(true)} 
                    disabled={isCurrentPageProcessing || isProcessing} 
                    className="relative flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg font-bold text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500 hover:text-slate-950 disabled:opacity-50 transition-all cursor-pointer group shadow-sm"
                  >
                    {(isCurrentPageProcessing || isProcessing) ? <Loader2 className="animate-spin" size={14} /> : <Bot size={14} className="group-hover:text-slate-950 transition-colors" />}
                    <span>✨ Xóa với AI</span>
                  </button>
                </div>
              )}
            </>
          )}

        </>
      )}

      {/* TAY NẮM CỬA TRÁI PHẢI */}
      {!useToolStore.getState().showLeftPanel && (
        <button onClick={() => useToolStore.getState().toggleLeftPanel()} className="absolute left-0 top-1/2 -translate-y-1/2 z-[100] p-1.5 bg-panel border-y border-r border-border rounded-r-xl shadow-[5px_0_15px_rgba(0,0,0,0.5)] text-text-muted hover:text-text-main hover:bg-border cursor-pointer transition-all hover:pr-3">
          <ChevronRight size={24} />
        </button>
      )}

      {!useToolStore.getState().showRightPanel && (
        <button onClick={() => useToolStore.getState().toggleRightPanel()} className="absolute right-0 top-1/2 -translate-y-1/2 z-[100] p-1.5 bg-panel border-y border-l border-border rounded-l-xl shadow-[-5px_0_15px_rgba(0,0,0,0.5)] text-text-muted hover:text-text-main hover:bg-border cursor-pointer transition-all hover:pl-3">
          <ChevronLeft size={24} />
        </button>
      )}



    </div>
  );
}

// 🚀 LIGHTWEIGHT WEBTOON IMAGE COMPONENT FOR INACTIVE PAGES
const WebtoonImage = ({ 
  file, 
  pageId, 
  projectId, 
  processedUrl, 
  onPointerDown, 
  width 
}: { 
  file: File; 
  pageId?: string; 
  projectId?: string; 
  processedUrl?: string; 
  onPointerDown: () => void; 
  width: number; 
}) => {
  const [url, setUrl] = useState<string>('');
  const activeMode = useToolStore((state) => state.activeMode);
  
  useEffect(() => {
    if (processedUrl) {
      setUrl(processedUrl);
      return;
    }

    if (file.size === 0) {
      if (pageId && projectId) {
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
        const backendUrl = `${import.meta.env.VITE_API_URL || ''}/workspace/${projectId}/raw/${pageId}.${ext}`;
        setUrl(backendUrl);
      }
      return;
    }
  }, [processedUrl, file.size, file.name, pageId, projectId]);

  useEffect(() => {
    if (file.size > 0 && !processedUrl) {
      const u = URL.createObjectURL(file);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [file, processedUrl]);

  const cursorStyle = activeMode === 'none' 
    ? 'pointer' 
    : activeMode === 'scan' 
      ? 'crosshair' 
      : 'default';

  return (
    <div 
      onPointerDown={onPointerDown} 
      className="relative pointer-events-auto m-0 p-0 block outline-none" 
      style={{ 
        width: width > 0 ? `${width}px` : '100%', 
        outline: 'none',
        cursor: cursorStyle,
        marginTop: '-1px'
      }}
    >
      <img 
        src={url || undefined} 
        crossOrigin="anonymous"
        loading="eager"
        className="block w-full h-auto select-none pointer-events-none m-0 p-0" 
        alt={file.name} 
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      />
    </div>
  );
};
