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
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts';
import { useGlobalErrorHandler } from '../../hooks/useGlobalErrorHandler';
import { useDynamicLoadingText } from '../../hooks/useDynamicLoadingText';
import VisualGuideOverlay from '../Editor/VisualGuideOverlay';
import FloatingTextToolbar from '../Editor/FloatingTextToolbar';
import { useConfigStore } from '../../store/useConfigStore';

export default function Workspace() {
  const { currentIndex, processedUrls, fileQueue } = useProjectStore();
  const projectStore = useProjectStore();
  const canvasStore = useCanvasStore();

  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const pageId = projectStore.pageIds[projectStore.currentIndex];
    if (pageId) {
      mangaApi.getPageBubbles(pageId)
        .then(data => canvasStore.setBubbles(data.bubbles || []))
        .catch(err => console.error("Lỗi đồng bộ chữ từ Server:", err));
    } else {
      canvasStore.clearBubbles();
    }
  }, [projectStore.currentIndex, projectStore.pageIds]);

  const { currentZoom, activeMode, setActiveMode, brushSize, setBrushSize, setZoom, isComparing, setIsComparing, actionPosition, setActionPosition, showText } = useToolStore();

  const [rawUrl, setRawUrl] = useState<string | null>(null);

  const panRef = useRef({ x: 0, y: 0 });
  const workspaceContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPanning = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });
  const startMouse = useRef({ x: 0, y: 0 });
  const isSpaceDown = useRef(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const dynamicLoadingText = useDynamicLoadingText(isProcessing);

  const zoomRef = useRef(currentZoom);
  const activeModeRef = useRef(activeMode);

  useEffect(() => { zoomRef.current = currentZoom; }, [currentZoom]);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);

  useEffect(() => {
    const file = fileQueue[currentIndex];
    if (file) {
      if (file.size === 0) {
        const pageId = projectStore.pageIds[currentIndex];
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
        setRawUrl(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/workspace/${projectStore.projectId}/raw/${pageId}.${ext}?t=${Date.now()}`);
      } else {
        const url = URL.createObjectURL(file);
        setRawUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    } else {
      setRawUrl(null);
    }
  }, [currentIndex, fileQueue, projectStore.pageIds, projectStore.projectId]);

  const displayUrl = processedUrls[currentIndex] || rawUrl;

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

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    const container = containerRef.current;
    if (!container) return;

    const scaleFit = Math.min(container.clientWidth / img.naturalWidth, container.clientHeight / img.naturalHeight) * 0.95;
    const finalScale = Math.max(0.1, Math.min(scaleFit, 3.0));

    panRef.current.x = (container.clientWidth - img.naturalWidth * finalScale) / 2;
    panRef.current.y = (container.clientHeight - img.naturalHeight * finalScale) / 2;

    if (workspaceContainerRef.current) workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${finalScale})`;
    setZoom(finalScale);
  };

  useGlobalShortcuts();
  useGlobalErrorHandler();

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
    img.onload = () => {
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
      projectStore.setProcessedUrl(currentIndex, tempCanvas.toDataURL("image/png"));
      maskCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      setActiveMode("none");
      setActionPosition(null);
      toast.success(`Đã phủ ${color === 'white' ? 'Trắng' : 'Đen'} siêu tốc!`);
    };
    img.src = targetUrl.split('?')[0];
  };

  const handleErase = async () => {
    if (!projectStore.pageIds[currentIndex]) return toast.error("Ảnh đang tải lên!");
    const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;
    const ctx = drawCanvas?.getContext("2d");
    if (!ctx?.getImageData(0, 0, drawCanvas.width, drawCanvas.height).data.some((p, i) => i % 4 === 3 && p > 0)) return toast.error("Hãy khoanh vùng đỏ!");

    const fileName = fileQueue[currentIndex]?.name || "";
    const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
    const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${projectStore.projectId}/raw/${projectStore.pageIds[currentIndex]}.${fileExt}`;
    const targetUrl = processedUrls[currentIndex] || serverRawUrl;

    setIsProcessing(true);
    setActionPosition(null);
    try {
      const newUrl = await mangaApi.eraseMask(targetUrl, drawCanvas.toDataURL("image/png"), projectStore.pageIds[currentIndex]);
      projectStore.setProcessedUrl(currentIndex, newUrl);
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      toast.success("Đã xóa nền!");
      setActiveMode("none");
    } catch (e: any) { toast.error(e.message); } finally { setIsProcessing(false); }
  };

  useEffect(() => {
    const loadCustomFonts = async () => {
      try {
        const data = await mangaApi.getFonts();
        data.fonts.forEach((fontName: string) => {
          const familyName = fontName.replace(/\.[^/.]+$/, ""); 
          const fontUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/workspace/fonts/${fontName}`;
          const newFont = new FontFace(familyName, `url(${fontUrl})`);
          newFont.load().then((loadedFace) => {
            document.fonts.add(loadedFace);
          }).catch(err => console.error("Lỗi load font:", err));
        });
      } catch (e) {}
    };
    loadCustomFonts();
  }, []);

  const cleanImageOpacity = isComparing ? 'opacity-0' : (activeMode === 'restore' ? 'opacity-50' : 'opacity-100');

  const currentBubbles = useCanvasStore(state => state.bubbles);
  const bubblesRef = useRef(currentBubbles);
  const isFirstLoad = useRef(true); 

  useEffect(() => { isFirstLoad.current = true; }, [currentIndex]);

  useEffect(() => {
    if (currentBubbles === bubblesRef.current) return;
    bubblesRef.current = currentBubbles;
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }

    const pageId = projectStore.pageIds[currentIndex];
    if (!pageId) return;
    const timeoutId = setTimeout(() => {
      mangaApi.savePageBubbles(pageId, useCanvasStore.getState().bubbles).catch(err => console.error("Lỗi Auto-Save:", err));
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [currentBubbles, currentIndex]);

  // 🚀 TÌM KIẾM ĐƯỜNG LINK ẢNH SẠCH NGUYÊN THỦY TỪ LỊCH SỬ
  const originalCleanUrl = (() => {
     const past = projectStore.pastUrls[currentIndex] || [];
     const httpUrl = past.find(u => u && u.startsWith('http'));
     if (httpUrl) return httpUrl; // Ưu tiên ảnh thật tải từ Server
     if (past.length > 0 && past[0]) return past[0]; // Kế đến là ảnh cũ nhất trong lịch sử
     return processedUrls[currentIndex] || rawUrl; // Bần cùng lắm mới lấy ảnh đang hiển thị
  })();

  return (
    <div ref={containerRef} className="flex-1 bg-background overflow-hidden relative" style={{ cursor: activeMode === 'none' ? 'grab' : 'default' }}>
      {displayUrl ? (
        <>
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
            <img src={rawUrl || undefined} crossOrigin="anonymous" alt="Manga Raw" className="block m-0 p-0 pointer-events-none select-none" style={{ width: imgSize.w > 0 ? `${imgSize.w}px` : undefined, height: imgSize.h > 0 ? `${imgSize.h}px` : undefined }} onLoad={handleImageLoad} />

            <img
              src={displayUrl || undefined}  
              crossOrigin="anonymous"
              alt="Manga Clean"
              className={`absolute inset-0 block max-w-none m-0 p-0 pointer-events-none select-none transition-opacity duration-300 ${cleanImageOpacity}`}
            />

            <div className={`absolute inset-0 w-full h-full ${isComparing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              
              {/* 🚀 Truyền originalCleanUrl vào Canvas để Két sắt lưu giữ */}
              <MangaCanvas rawUrl={rawUrl} displayUrl={displayUrl} originalCleanUrl={originalCleanUrl} />
              
              <VisualGuideOverlay />

              <div className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${showText ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <MangaTextEngine imgWidth={imgSize.w} imgHeight={imgSize.h} /> 
                
                {/* 🚀 BẢN VÁ: Rút điện thanh công cụ nổi nếu người dùng bấm Ẩn Chữ */}
                {showText && <FloatingTextToolbar />} 
                
              </div>

            </div>
          </div>

          <FloatingCanvasToolbar />

          {!useToolStore.getState().showLeftPanel && (
            <button onClick={() => useToolStore.getState().toggleLeftPanel()} className="absolute left-0 top-1/2 -translate-y-1/2 z-50 p-1.5 bg-panel border-y border-r border-border rounded-r-xl shadow-[5px_0_15px_rgba(0,0,0,0.5)] text-text-muted hover:text-text-main hover:bg-border cursor-pointer transition-all hover:pr-3">
              <ChevronRight size={24} />
            </button>
          )}

          {actionPosition && activeMode === 'erase' && (
            <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300 flex items-center gap-1.5 p-1.5 bg-panel/95 backdrop-blur-xl border border-border shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-2xl pointer-events-auto">
              <button onClick={() => handleFillColor('white')} disabled={isProcessing} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-white text-black hover:bg-gray-200 disabled:opacity-50 transition-colors cursor-pointer shadow-sm">⬜ Trắng (Nhanh)</button>
              <button onClick={() => handleFillColor('black')} disabled={isProcessing} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-[#1a1a1a] text-white hover:bg-black disabled:opacity-50 transition-colors cursor-pointer border border-white/10 shadow-sm">⬛ Đen (Nhanh)</button>
              <div className="w-px h-8 bg-border mx-1"></div>
              <button onClick={handleErase} disabled={isProcessing} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white disabled:opacity-50 transition-all cursor-pointer group shadow-sm">
                {isProcessing ? <span className="animate-spin">⏳</span> : <Wand2 size={16} className="group-hover:text-white transition-colors" />}
                {isProcessing ? dynamicLoadingText : "✨ Xóa bằng AI"}
              </button>
            </div>
          )}
        </>
      ) : <WelcomeScreen />}
    </div>
  );
}