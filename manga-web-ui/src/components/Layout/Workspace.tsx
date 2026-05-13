import { useEffect, useState, useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { mangaApi } from '../../services/api';
import toast from 'react-hot-toast';
import TextLayer from '../Editor/TextLayer';
import MangaCanvas from '../Editor/MangaCanvas';
import WelcomeScreen from '../Editor/WelcomeScreen';
import { Search, Eraser, Paintbrush, Sparkles, Type as TypeIcon } from 'lucide-react';

export default function Workspace() {
  const { currentIndex, processedUrls, fileQueue } = useProjectStore();
  const projectStore = useProjectStore();
  const canvasStore = useCanvasStore();
  const { currentZoom, activeMode, setActiveMode, brushSize, setBrushSize, setZoom, isComparing, setIsComparing, fontSize, fontColor, fontFamily, restoreType, toggleRestoreType } = useToolStore(); 
  
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });
  const startMouse = useRef({ x: 0, y: 0 });
  const isSpaceDown = useRef(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [redrawPrompt, setRedrawPrompt] = useState("");

  const panRef = useRef(pan);
  const zoomRef = useRef(currentZoom);
  const activeModeRef = useRef(activeMode);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = currentZoom; }, [currentZoom]);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);

  useEffect(() => {
    const file = fileQueue[currentIndex];
    if (file) {
      const url = URL.createObjectURL(file);
      setRawUrl(url);
      return () => URL.revokeObjectURL(url); 
    } else setRawUrl(null);
  }, [currentIndex, fileQueue]);

  const displayUrl = processedUrls[currentIndex] || rawUrl;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.toolbar-container') || target.tagName === 'SELECT' || target.tagName === 'INPUT') return;
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.002;
        const currentZ = zoomRef.current;
        const newZoom = Math.max(0.1, Math.min(currentZ * (1 + delta), 5.0));

        const rect = container.getBoundingClientRect();
        setPan({
          x: (e.clientX - rect.left) - ((e.clientX - rect.left) - panRef.current.x) * (newZoom / currentZ),
          y: (e.clientY - rect.top) - ((e.clientY - rect.top) - panRef.current.y) * (newZoom / currentZ)
        });
        setZoom(newZoom);
      } else {
        setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.toolbar-container') || target.closest('.react-draggable') || target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
      
      const isLeftClickOnBg = e.button === 0 && activeModeRef.current === 'none';
      const isSpacePan = e.button === 0 && isSpaceDown.current;
      const isMiddleClick = e.button === 1;

      if (isMiddleClick || isLeftClickOnBg || isSpacePan) {
        e.preventDefault();
        isPanning.current = true;
        container.style.cursor = 'grabbing';
        document.body.style.cursor = 'grabbing';
        startMouse.current = { x: e.clientX, y: e.clientY };
        startPan.current = panRef.current;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      setPan({ x: startPan.current.x + (e.clientX - startMouse.current.x), y: startPan.current.y + (e.clientY - startMouse.current.y) });
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
    const container = containerRef.current;
    if (!container) return;
    const scaleFit = Math.min(container.clientWidth / img.naturalWidth, container.clientHeight / img.naturalHeight) * 0.95;
    const finalScale = Math.max(0.1, Math.min(scaleFit, 3.0));
    setZoom(finalScale);
    setPan({ x: (container.clientWidth - img.naturalWidth * finalScale) / 2, y: (container.clientHeight - img.naturalHeight * finalScale) / 2 });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        isSpaceDown.current = true;
        if (containerRef.current) containerRef.current.style.cursor = 'grab';
        document.body.style.cursor = 'grab';
      }
      if (e.key === '\\' && !e.repeat && displayUrl) setIsComparing(true); 
    };
    
    const handleKeyUp = (e: KeyboardEvent) => { 
      if (e.code === 'Space') {
        isSpaceDown.current = false;
        if (containerRef.current) containerRef.current.style.cursor = activeModeRef.current === 'none' ? 'grab' : 'default';
        document.body.style.cursor = ''; 
      }
      if (e.key === '\\') setIsComparing(false); 
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [displayUrl, setIsComparing]);

  const handleErase = async () => {
    if (!projectStore.pageIds[currentIndex]) {
        return toast.error("Ảnh đang được tải lên máy chủ, vui lòng chờ giây lát!");
    }
    const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;

    const ctx = drawCanvas?.getContext("2d");
    if (!ctx?.getImageData(0,0,drawCanvas.width,drawCanvas.height).data.some((p,i)=>i%4===3 && p>0)) return toast.error("Hãy khoanh vùng đỏ!");

    // 🚀 LẤY ĐƯỜNG DẪN THỰC TẾ TRÊN MÁY CHỦ
    const fileName = fileQueue[currentIndex]?.name || "";
    const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'jpg'; 
    const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${projectStore.projectId}/raw/${projectStore.pageIds[currentIndex]}.${fileExt}`;
    
    // Nếu ảnh đã dịch thì dùng ảnh đó, chưa thì dùng ảnh gốc server
    const targetUrl = processedUrls[currentIndex] || serverRawUrl;

    setIsProcessing(true);
    try {
      const newUrl = await mangaApi.eraseMask(targetUrl, drawCanvas.toDataURL("image/png"));
      projectStore.setProcessedUrl(currentIndex, newUrl);
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      toast.success("Đã xóa nền!");
      setActiveMode("none");
    } catch (e: any) { toast.error(e.message); } finally { setIsProcessing(false); }
  };

  const handleRedraw = async () => {
    if (!projectStore.pageIds[currentIndex]) {
        return toast.error("Ảnh đang được tải lên máy chủ, vui lòng chờ giây lát!");
    }
    if (!redrawPrompt.trim()) return toast.error("Nhập Prompt!");
    const drawCanvas = document.getElementById("draw-layer") as HTMLCanvasElement;
    const ctx = drawCanvas?.getContext("2d");
    if (!ctx?.getImageData(0,0,drawCanvas.width,drawCanvas.height).data.some((p,i)=>i%4===3 && p>0)) return toast.error("Hãy khoanh vùng đỏ!");

    // 🚀 LẤY ĐƯỜNG DẪN THỰC TẾ TRÊN MÁY CHỦ
    const fileName = fileQueue[currentIndex]?.name || "";
    const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'jpg'; 
    const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${projectStore.projectId}/raw/${projectStore.pageIds[currentIndex]}.${fileExt}`;
    const targetUrl = processedUrls[currentIndex] || serverRawUrl;

    setIsProcessing(true);
    try {
      const newUrl = await mangaApi.redrawMask(targetUrl, drawCanvas.toDataURL("image/png"), redrawPrompt);
      projectStore.setProcessedUrl(currentIndex, newUrl);
      ctx.clearRect(0,0,drawCanvas.width,drawCanvas.height);
      toast.success("Đã vẽ lại!");
      setActiveMode("none");
      setRedrawPrompt("");
    } catch (e: any) { toast.error(e.message); } finally { setIsProcessing(false); }
  };

  const handleAddText = () => {
    const container = containerRef.current;
    let cx = 50, cy = 50;
    if (container) {
      cx = (-panRef.current.x + container.clientWidth / 2) / zoomRef.current - 75;
      cy = (-panRef.current.y + container.clientHeight / 2) / zoomRef.current - 30;
    }
    canvasStore.addBubble({ x: cx, y: cy, w: 150, h: 60, text: "Nhập chữ...", fontSize, fontColor, fontFamily, rotation: 0 });
  };

  return (
    <div ref={containerRef} className="flex-1 bg-background overflow-hidden relative" style={{ cursor: activeMode === 'none' ? 'grab' : 'default' }}> 
      
      {/* 🚀 LEFT TOOLBAR: Dùng 'absolute' để nằm ĐÈ lên ảnh, không chiếm diện tích ngang */}
      {displayUrl && (
        <div className="toolbar-container absolute left-4 top-1/2 -translate-y-1/2 z-50 flex flex-row gap-2 items-start pointer-events-none">
          {/* Cột icon chính */}
          <div className="bg-panel/90 backdrop-blur-md border border-border rounded-xl shadow-2xl flex flex-col p-1.5 gap-1 pointer-events-auto">
            <button onClick={() => setActiveMode('scan')} className={`p-2.5 rounded-lg transition-all ${activeMode === 'scan' ? 'bg-primary text-white' : 'text-text-muted hover:bg-border'}`}><Search size={20}/></button>
            <button onClick={() => setActiveMode('erase')} className={`p-2.5 rounded-lg transition-all ${activeMode === 'erase' ? 'bg-danger text-white' : 'text-text-muted hover:bg-border'}`}><Eraser size={20}/></button>
            <button onClick={() => setActiveMode('restore')} className={`p-2.5 rounded-lg transition-all ${activeMode === 'restore' ? 'bg-accent text-white' : 'text-text-muted hover:bg-border'}`}><Paintbrush size={20}/></button>
            <button onClick={() => setActiveMode('redraw')} className={`p-2.5 rounded-lg transition-all ${activeMode === 'redraw' ? 'bg-emerald-500 text-white' : 'text-text-muted hover:bg-border'}`}><Sparkles size={20}/></button>
            <div className="w-8 h-px bg-border mx-auto my-1"></div>
            <button onClick={handleAddText} className="p-2.5 rounded-lg text-text-muted hover:bg-border"><TypeIcon size={20}/></button>
          </div>

          {/* 🚀 BẢN VÁ: Menu phụ hiện ra bên cạnh nhưng KHÔNG ĐẨY ẢNH (Dùng absolute) */}
          {(activeMode === 'erase' || activeMode === 'restore' || activeMode === 'redraw') && (
            <div className="bg-panel/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl p-3 flex flex-col gap-3 w-44 pointer-events-auto animate-in fade-in slide-in-from-left-2">
               <div>
                  <label className="text-[10px] text-text-muted mb-1 block uppercase font-bold">Cỡ cọ: <span className="text-primary">{brushSize}px</span></label>
                  <input type="range" min="5" max="150" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full accent-primary cursor-pointer" />
               </div>
               {activeMode === 'erase' && <button onClick={handleErase} disabled={isProcessing} className="w-full btn-primary py-1.5 text-[11px] justify-center">{isProcessing ? "⏳..." : "Thực thi Xóa"}</button>}
               {activeMode === 'restore' && <button onClick={toggleRestoreType} className="w-full bg-accent text-white py-1.5 rounded text-[10px] font-bold shadow-lg">Nét: {restoreType === 'raw' ? 'GỐC' : 'SẠCH'}</button>}
               {activeMode === 'redraw' && (
                 <div className="flex flex-col gap-2">
                    <input type="text" placeholder="Mô tả AI..." value={redrawPrompt} onChange={(e) => setRedrawPrompt(e.target.value)} className="bg-background text-text-main text-[11px] px-2 py-1.5 rounded border border-border outline-none focus:border-emerald-500" />
                    <button onClick={handleRedraw} disabled={isProcessing} className="w-full bg-emerald-500 text-white py-1.5 rounded text-[10px] font-bold">{isProcessing ? "⏳..." : "Vẽ Redraw"}</button>
                 </div>
               )}
            </div>
          )}
        </div>
      )}

      {/* Xóa bỏ hoàn toàn cái Right Properties Panel ở đây để nó không chiếm không gian hiển thị ảnh */}

      {displayUrl ? (
        <div id="workspace-container" className="absolute left-0 top-0 shadow-2xl will-change-transform origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${currentZoom})` }}>
          <img src={rawUrl || ''} crossOrigin="anonymous" alt="Manga Raw" className="block max-w-none m-0 p-0 pointer-events-none select-none" onLoad={handleImageLoad} />
          <img src={displayUrl} crossOrigin="anonymous" alt="Manga Clean" className={`absolute inset-0 block max-w-none m-0 p-0 pointer-events-none select-none ${isComparing ? 'opacity-0' : 'opacity-100'}`} />
          <div className={`absolute inset-0 w-full h-full ${isComparing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <MangaCanvas rawUrl={rawUrl} displayUrl={displayUrl} />
            <TextLayer />
          </div>
        </div>
      ) : <WelcomeScreen />}
    </div>
  );
}