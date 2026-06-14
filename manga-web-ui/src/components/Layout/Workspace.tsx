import { useEffect, useState, useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { mangaApi } from '../../services/api';
import toast from 'react-hot-toast';
import MangaTextEngine from '../Editor/MangaTextEngine';
import MangaCanvas from '../Editor/MangaCanvas';
import WelcomeScreen from '../Editor/WelcomeScreen';
import { Search, Eraser, Paintbrush, Sparkles, Type as TypeIcon, PanelLeft, PanelRight, ChevronRight, ChevronLeft, Check, Wand2 } from 'lucide-react';
import { FloatingCanvasToolbar } from '../Editor/FloatingCanvasToolbar';
import { RedrawPromptInput } from '../Editor/RedrawPromptInput';
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts';
import { useGlobalErrorHandler } from '../../hooks/useGlobalErrorHandler';
import { useDynamicLoadingText } from '../../hooks/useDynamicLoadingText';
import VisualGuideOverlay from '../Editor/VisualGuideOverlay';
import FloatingTextToolbar from '../Editor/FloatingTextToolbar';
import { useConfigStore } from '../../store/useConfigStore';
import { PaywallDrawer } from '../Modals/PaywallDrawer';
import { useHotkeys } from 'react-hotkeys-hook';
import { useMangaEditorStore } from '../../store/useMangaEditorStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useDeviceDetect } from '../../hooks/useDeviceDetect';
import { Smartphone, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Workspace() {
  const { t } = useTranslation();
  const isMobileOrTouch = useDeviceDetect();
  const { signOut } = useAuthStore();
  const [showPaywall, setShowPaywall] = useState(false);
  const { currentIndex, processedUrls, fileQueue } = useProjectStore();
  const projectStore = useProjectStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isEraseProcessingRef = useRef(false);
  const isRedrawProcessingRef = useRef(false);

  // 1. Lifecycle Garbage Collection (CRITICAL)
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

  // Dán đoạn này vào đầu hàm Workspace()
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success') {
      toast.success('🎉 Thanh toán thành công! Credits đã được cộng vào tài khoản.', { duration: 5000, icon: '💎' });
      // Xóa URL param cho sạch đẹp
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'failed') {
      toast.error('❌ Giao dịch đã bị hủy hoặc thất bại.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

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
            fontColor: b.fontColor || toolState.fontColor || "#000000",
            fontFamily: b.fontFamily || toolState.fontFamily || "'Comic Neue', cursive",
            rotation: b.rotation !== undefined ? b.rotation : 0,
            sfxClass: b.sfxClass || "",
            boxX: b.boxX !== undefined ? b.boxX : x,
            boxY: b.boxY !== undefined ? b.boxY : y,
            boxW: b.boxW !== undefined ? b.boxW : w,
            boxH: b.boxH !== undefined ? b.boxH : h,
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

  const { currentZoom, activeMode, setActiveMode, brushSize, setBrushSize, setZoom, isComparing, setIsComparing, actionPosition, setActionPosition, showText, isProcessing, setIsProcessing, isRedrawSessionActive, setIsRedrawSessionActive } = useToolStore();

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

  // 🚀 KỸ THUẬT MEMORY PRE-LOADING: Tính toán 100% trong RAM rồi mới Render HTML
  useEffect(() => {
    let isMounted = true;
    const file = fileQueue[currentIndex];

    // 🚀 BẢN VÁ 1: XÓA TRẮNG ẢNH CŨ NGAY LẬP TỨC ĐỂ CHỐNG "BÓNG MA"
    setRawUrl(null);

    // 1. Xác định URL cần tải
    let targetUrl = '';
    let objectUrlToRevoke = '';

    if (file) {
      if (file.size === 0) {
        const pageId = projectStore.pageIds[currentIndex];
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
        targetUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/workspace/${projectStore.projectId}/raw/${pageId}.${ext}?t=${Date.now()}`;
      } else {
        targetUrl = URL.createObjectURL(file);
        objectUrlToRevoke = targetUrl;
      }
    } else {
      setRawUrl(null);
      return;
    }

    // 2. Tải ngầm bức ảnh vào RAM (Javascript Image Object)
    const img = new Image();
    img.onload = () => {
      if (!isMounted) return;

      // 3. TÍNH TOÁN NGAY TRONG RAM: Không để DOM biết
      const container = containerRef.current;
      if (container) {
        setImgSize({ w: img.naturalWidth, h: img.naturalHeight });

        // Trở về thuật toán tỷ lệ chuẩn 95% vì "container" giờ đây sẽ là một cái khung có giới hạn!
        const scaleFit = Math.min(container.clientWidth / img.naturalWidth, container.clientHeight / img.naturalHeight) * 0.95;
        const finalScale = Math.max(0.1, Math.min(scaleFit, 3.0));

        panRef.current.x = (container.clientWidth - img.naturalWidth * finalScale) / 2;
        panRef.current.y = (container.clientHeight - img.naturalHeight * finalScale) / 2;

        if (workspaceContainerRef.current) {
          workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${finalScale})`;
        }
        setZoom(finalScale);
      }

      // 4. CHỐT SỔ: Khi mọi thứ đã chuẩn form, mới ném URL cho thẻ <img> hiển thị
      setRawUrl(targetUrl);
    };

    img.onerror = () => {
      if (!isMounted) return;
      setRawUrl(targetUrl);
    };

    img.src = targetUrl;

    return () => {
      isMounted = false;
      if (objectUrlToRevoke) {
        // 🚀 BẢN VÁ: Trì hoãn việc hủy Blob URL 10 giây để tránh lỗi ERR_FILE_NOT_FOUND khi chuyển trang hoặc re-render nhanh
        setTimeout(() => URL.revokeObjectURL(objectUrlToRevoke), 10000);
      }
    };
  }, [currentIndex, fileQueue, projectStore.pageIds, projectStore.projectId, setZoom]);

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
        const newZoom = Math.max(0.1, Math.min(currentZ * (1 + delta), 5.0));

        const rect = container.getBoundingClientRect();
        panRef.current.x = (e.clientX - rect.left) - ((e.clientX - rect.left) - panRef.current.x) * (newZoom / currentZ);
        panRef.current.y = (e.clientY - rect.top) - ((e.clientY - rect.top) - panRef.current.y) * (newZoom / currentZ);

        if (workspaceContainerRef.current) workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${newZoom})`;
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

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
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
    const toastId = toast.loading("Bắt đầu xử lý xóa nền thông minh...");
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
      toast.success("Đã xóa nền thông minh thành công!", { id: toastId });
      setActiveMode("none");
    } catch (e: any) { 
      toast.error(e.message || "Xử lý xóa nền thất bại!", { id: toastId }); 
    } finally { 
      isEraseProcessingRef.current = false;
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
    const toastId = toast.loading("Bắt đầu vẽ lại vùng chọn bằng AI...");
    
    // Trực tiếp trừ xu cục bộ trước dựa trên trạng thái phiên hoạt động
    const amountToDeduct = isRedrawSessionActive ? 1 : 4;
    toast(`Đã trừ ${amountToDeduct} Xu`, { icon: "💰", duration: 2000 });
    useAuthStore.getState().deductLocalCredits(amountToDeduct);

    try {
      const maskBase64 = drawCanvas.toDataURL("image/png");
      const pageId = projectStore.pageIds[currentIndex];

      const fileName = fileQueue[currentIndex]?.name || "";
      const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
      const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`;
      const targetUrl = processedUrls[currentIndex] || serverRawUrl;

      // Call API with originalImageHash to prevent hash mismatch
      const originalImageHash = pageId || fileName || "default";
      const newUrl = await mangaApi.redrawMask(targetUrl, maskBase64, positivePrompt, pageId, negativePrompt, originalImageHash);

      // Save history and set image in editor store
      useMangaEditorStore.getState().saveHistory();
      useMangaEditorStore.getState().setImageUrl(newUrl);

      // Sync stored URL with projectStore
      projectStore.setProcessedUrl(currentIndex, newUrl);

      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      toast.success("Vẽ lại vùng chọn bằng AI thành công!", { id: toastId });
      setActiveMode("none");
      setRedrawPrompt("");
      // Lưu lại trạng thái vẽ lại hoạt động vào localStorage
      persistRedrawSessionActive(true);
      // Đồng bộ ví từ server
      await useAuthStore.getState().fetchProfile();
    } catch (e: any) {
      toast.error(e.message || "Vẽ lại bằng AI thất bại!", { id: toastId });
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
          const fontUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/workspace/fonts/${fontName}`;
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
    const past = projectStore.pastUrls[currentIndex] || [];
    const httpUrl = past.find(u => u && u.startsWith('http'));
    if (httpUrl) return httpUrl; // Ưu tiên ảnh thật tải từ Server
    if (past.length > 0 && past[0]) return past[0]; // Kế đến là ảnh cũ nhất trong lịch sử
    return processedUrls[currentIndex] || rawUrl; // Bần cùng lắm mới lấy ảnh đang hiển thị
  })();

  if (isMobileOrTouch) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0c0c0e] flex flex-col items-center justify-center p-6 text-center text-white font-sans overflow-auto select-none">
        {/* Glowing background orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/3 w-[200px] h-[200px] bg-purple-500/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative max-w-md w-full bg-[#16161a]/85 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
          {/* Animated Device Icon Container */}
          <div className="relative flex items-center justify-center w-20 h-20 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
            <Smartphone size={40} strokeWidth={1.5} className="animate-pulse" />
            <div className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 items-center justify-center text-[9px] font-black text-white">!</span>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-extrabold text-white tracking-tight uppercase flex items-center justify-center gap-2">
              {t('workspace.mobileBlockTitle')}
            </h2>
            <p className="text-xs text-gray-300 leading-relaxed text-left bg-neutral-900/60 p-4 rounded-xl border border-white/5 font-medium">
              {t('workspace.mobileBlockDesc')}
            </p>
          </div>

          {/* Button: Quay lại Trang chủ */}
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all cursor-pointer border border-white/10"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            {t('workspace.backToHome')}
          </button>
        </div>
      </div>
    );
  }

  return (
    // TẦNG 0: NỀN APP TỔNG THỂ (#121212)
    <div className="flex-1 bg-[#121212] relative overflow-hidden flex flex-col items-center justify-center">

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
            className="absolute left-0 top-0 shadow-2xl will-change-transform origin-top-left"
            style={{
              width: imgSize.w > 0 ? `${imgSize.w}px` : 'auto',
              height: imgSize.h > 0 ? `${imgSize.h}px` : 'auto',
              transform: `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${currentZoom})`
            }}
          >
            {/* Render Canvas */}
            <img src={rawUrl || undefined} crossOrigin="anonymous" alt="Manga Raw" className="block m-0 p-0 pointer-events-none select-none ph-no-capture" style={{ width: imgSize.w > 0 ? `${imgSize.w}px` : undefined, height: imgSize.h > 0 ? `${imgSize.h}px` : undefined }} />
            <img src={displayUrl || undefined} crossOrigin="anonymous" alt="Manga Clean" className={`absolute inset-0 block max-w-none m-0 p-0 pointer-events-none select-none transition-opacity duration-300 ${cleanImageOpacity} ph-no-capture`} />
            <div className={`absolute inset-0 w-full h-full ${isComparing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <MangaCanvas rawUrl={rawUrl} displayUrl={displayUrl} originalCleanUrl={originalCleanUrl} />
              <VisualGuideOverlay />
              <div className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${showText ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <MangaTextEngine imgWidth={imgSize.w} imgHeight={imgSize.h} />
                {showText && <FloatingTextToolbar />}
              </div>
            </div>
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
      {fileQueue.length > 0 && !displayUrl && (
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
            <div className="absolute bottom-[100px] left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300 flex items-center gap-1.5 p-1.5 bg-[#2A2A2A]/90 backdrop-blur-md ring-1 ring-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-2xl pointer-events-auto">
              <button onClick={() => handleFillColor('white')} disabled={isProcessing} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-white text-black hover:bg-gray-200 disabled:opacity-50 transition-colors cursor-pointer shadow-sm">⬜ Trắng</button>
              <button onClick={() => handleFillColor('black')} disabled={isProcessing} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-[#1a1a1a] text-white hover:bg-black disabled:opacity-50 transition-colors cursor-pointer border border-white/10 shadow-sm">⬛ Đen</button>
              <div className="w-px h-8 bg-border mx-1"></div>
              <button onClick={handleErase} disabled={isProcessing} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white disabled:opacity-50 transition-all cursor-pointer group shadow-sm">
                {isProcessing ? <span className="animate-spin">⏳</span> : <Wand2 size={16} className="group-hover:text-white transition-colors" />}
                {isProcessing ? dynamicLoadingText : "✨ Xóa nền thông minh"}
              </button>
            </div>
          )}

          {actionPosition && activeMode === 'redraw' && (
            <div className="absolute bottom-[100px] left-1/2 -translate-x-1/2 z-[100] pointer-events-auto flex flex-col gap-2">
              <RedrawPromptInput
                isProcessing={isProcessing}
                onCancel={() => {
                  const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;
                  const ctx = drawCanvas?.getContext("2d");
                  if (ctx) ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
                  setActionPosition(null);
                  setRedrawPrompt("");
                }}
                onSubmit={async ({ positive, negative }) => {
                  await handleRedraw(positive, negative);
                }}
              />
            </div>
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



      {/* 🚀 COMPONENT GIAO DIỆN THANH TOÁN */}
      <PaywallDrawer
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
      />
    </div>
  );
}