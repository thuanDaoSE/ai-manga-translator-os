import { useEffect, useRef } from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useConfigStore } from '../../store/useConfigStore';
import { mangaApi } from '../../services/api';
import toast from 'react-hot-toast';


interface Props { 
  rawUrl: string | null; 
  displayUrl: string | null; 
}

export default function MangaCanvas({ rawUrl, displayUrl }: Props) {
  const drawRef = useRef<HTMLCanvasElement>(null);      
  const committedRef = useRef<HTMLCanvasElement>(null); 
  const rawRef = useRef<HTMLCanvasElement>(null);
  const cleanRef = useRef<HTMLCanvasElement>(null);

  const { activeMode, brushSize, currentZoom } = useToolStore();
  
  const currentPoints = useRef<{x: number, y: number}[]>([]); 
  const isDrawing = useRef(false);
  const scanStart = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!rawUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = rawUrl;
    img.onload = () => {
      if (rawRef.current) {
        rawRef.current.width = img.naturalWidth;
        rawRef.current.height = img.naturalHeight;
        rawRef.current.getContext('2d')?.drawImage(img, 0, 0);
      }
    };
  }, [rawUrl]);

  useEffect(() => {
    if (!displayUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = displayUrl;
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      [cleanRef, drawRef, committedRef].forEach(ref => {
        if (ref.current) { ref.current.width = w; ref.current.height = h; }
      });
      cleanRef.current?.getContext('2d')?.drawImage(img, 0, 0);
    };
  }, [displayUrl]);

  useEffect(() => {
    if (activeMode === 'none') {
       const ctx1 = drawRef.current?.getContext('2d');
       const ctx2 = committedRef.current?.getContext('2d');
       if (drawRef.current && committedRef.current) {
         ctx1?.clearRect(0, 0, drawRef.current.width, drawRef.current.height);
         ctx2?.clearRect(0, 0, committedRef.current.width, committedRef.current.height);
       }
       currentPoints.current = [];
    }
  }, [activeMode]);

  useEffect(() => {
    const drawCanvas = drawRef.current;
    if (!drawCanvas) return;

    const getPointerPos = (e: PointerEvent) => {
      const rect = drawCanvas.getBoundingClientRect();
      const scaleX = drawCanvas.width / rect.width;
      const scaleY = drawCanvas.height / rect.height;
      return { 
        x: (e.clientX - rect.left) * scaleX, 
        y: (e.clientY - rect.top) * scaleY 
      };
    };

    // Nét cọ mượt Bezier
    const drawStroke = (ctx: CanvasRenderingContext2D, points: {x: number, y: number}[], size: number, color: string) => {
      if (points.length === 0) return;
      
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size;
      ctx.strokeStyle = color;

      if (points.length < 3) {
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        if (points.length === 1) ctx.lineTo(points[0].x + 0.1, points[0].y);
        ctx.stroke();
        return;
      }

      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const midPoint = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
        ctx.quadraticCurveTo(points[i].x, points[i].y, midPoint.x, midPoint.y);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.stroke();
    };

    const renderCanvas = () => {
       const ctx = drawCanvas.getContext('2d');
       const committedCanvas = committedRef.current;
       if (!ctx || !committedCanvas) return;

       ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
       ctx.drawImage(committedCanvas, 0, 0);

       const mode = useToolStore.getState().activeMode;
       const currentBrushSize = useToolStore.getState().brushSize;

       if (isDrawing.current) {
         if (mode === 'scan') {
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = "#00BFFF";
            ctx.lineWidth = 2;
            ctx.strokeRect(scanStart.current.x, scanStart.current.y, currentPos.current.x - scanStart.current.x, currentPos.current.y - scanStart.current.y);
            ctx.setLineDash([]);
         } 
         else if (mode === 'erase' || mode === 'restore' || mode === 'redraw') {
            if (mode === 'erase' || mode === 'redraw') {
               drawStroke(ctx, currentPoints.current, currentBrushSize, "rgba(255, 0, 0, 0.5)");
            } else if (mode === 'restore') {
               const sourceCanvas = useToolStore.getState().restoreType === 'clean' ? cleanRef.current : rawRef.current;
               if (sourceCanvas) {
                  ctx.save();
                  drawStroke(ctx, currentPoints.current, currentBrushSize, "rgba(0, 0, 0, 1)");
                  ctx.globalCompositeOperation = 'source-in';
                  ctx.drawImage(sourceCanvas, 0, 0);
                  ctx.restore();
               }
            }
         }
       }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const mode = useToolStore.getState().activeMode;
      if (mode === 'none') return;
      isDrawing.current = true;
      drawCanvas.setPointerCapture(e.pointerId); 
      const pos = getPointerPos(e);
      if (mode === 'scan') {
         scanStart.current = { x: pos.x, y: pos.y };
         currentPos.current = { x: pos.x, y: pos.y };
      } else {
         currentPoints.current = [{x: pos.x, y: pos.y}];
      }
      renderCanvas();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawing.current) return;
      const pos = getPointerPos(e);
      if (useToolStore.getState().activeMode === 'scan') {
         currentPos.current = { x: pos.x, y: pos.y };
      } else {
         currentPoints.current.push({x: pos.x, y: pos.y});
      }
      requestAnimationFrame(renderCanvas); 
    };

    const handlePointerUp = async (e: PointerEvent) => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      drawCanvas.releasePointerCapture(e.pointerId);
      
      const mode = useToolStore.getState().activeMode;
      const currentBrushSize = useToolStore.getState().brushSize;
      
      if (mode === 'erase' || mode === 'restore' || mode === 'redraw') {
         const committedCtx = committedRef.current?.getContext('2d');
         if (committedCtx) {
            if (mode === 'erase' || mode === 'redraw') {
               // Lưu cứng nét vẽ vào canvas ẩn (committedCanvas)
               drawStroke(committedCtx, currentPoints.current, currentBrushSize, "rgba(255, 0, 0, 0.5)");
               
               // 🚀 NÂNG CẤP UX: Hiện nút Action ngay tại vị trí thả chuột (trên màn hình)
               useToolStore.getState().setActionPosition({ x: e.clientX, y: e.clientY });
               
            } else if (mode === 'restore') {
               const sourceCanvas = useToolStore.getState().restoreType === 'clean' ? cleanRef.current : rawRef.current;
               if (sourceCanvas) {
                  const tempCanvas = document.createElement('canvas');
                  tempCanvas.width = committedRef.current!.width;
                  tempCanvas.height = committedRef.current!.height;
                  const tCtx = tempCanvas.getContext('2d')!;
                  
                  drawStroke(tCtx, currentPoints.current, currentBrushSize, "rgba(0,0,0,1)");
                  tCtx.globalCompositeOperation = 'source-in';
                  tCtx.drawImage(sourceCanvas, 0, 0);
                  
                  committedCtx.drawImage(tempCanvas, 0, 0);
               }
               // Với cọ khôi phục thì có thể không cần hiện bảng Action vì vẽ tới đâu AI gốc lộ ra tới đó luôn (hoặc sếp có thể bật lên tùy ý)
               useToolStore.getState().setActionPosition(null); 
            }
         }
         currentPoints.current = []; 
         renderCanvas(); 
      } else if (mode === 'scan') {
         const pos = getPointerPos(e);
         useToolStore.getState().setScanModal({
            isOpen: true, jap: "Đang quét OCR...", vie: "Đang dịch...",
            coords: { x1: scanStart.current.x, y1: scanStart.current.y, x2: pos.x, y2: pos.y }
         });

         try {
            const config = useConfigStore.getState();
            const pStore = useProjectStore.getState();
            
            // 🚀 BẮT CHUẨN ĐƯỜNG DẪN ẢNH 
            const originalName = pStore.fileQueue[pStore.currentIndex]?.name || "";
            const fileExt = originalName.includes('.') ? originalName.split('.').pop() : 'jpg'; 
            const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${pStore.projectId}/raw/${pStore.pageIds[pStore.currentIndex]}.${fileExt}`;
            const targetUrl = pStore.processedUrls[pStore.currentIndex] || serverRawUrl;

            // 🚀 ĐÃ SỬA: Thêm .split('?')[0] để CHẶT ĐỨT cái đuôi chống cache (?t=...) trước khi gửi cho OpenCV
            const relativePath = targetUrl.replace(`${import.meta.env.VITE_API_URL}/`, '').split('?')[0];
            const cleanTargetUrl = targetUrl.split('?')[0]; // Chặt luôn đuôi ở URL gốc gửi đi cho chắc cú

            const result = await mangaApi.quickScan({
               filename: relativePath, 
               image_url: cleanTargetUrl,   
               x1: Math.floor(scanStart.current.x), 
               y1: Math.floor(scanStart.current.y),
               x2: Math.floor(pos.x), 
               y2: Math.floor(pos.y), 
               genre: config.genre, 
               tone: config.tone, 
               pronouns: config.pronoun,
               // 🚀 BỔ SUNG DÒNG NÀY ĐỂ GỬI TỪ ĐIỂN LÊN SERVER
               glossary: config.glossary 
            });
            
            if (result.status === "success") {
               useToolStore.getState().setScanModal({
                  isOpen: true, jap: result.japanese, vie: result.vietnamese,
                  coords: { x1: scanStart.current.x, y1: scanStart.current.y, x2: pos.x, y2: pos.y }
               });
            }
         } catch (error) {
            alert("Lỗi Lens Dịch!");
            useToolStore.getState().setScanModal(null);
         }
      }
    };

    drawCanvas.addEventListener('pointerdown', handlePointerDown);
    drawCanvas.addEventListener('pointermove', handlePointerMove);
    drawCanvas.addEventListener('pointerup', handlePointerUp);

    return () => {
      drawCanvas.removeEventListener('pointerdown', handlePointerDown);
      drawCanvas.removeEventListener('pointermove', handlePointerMove);
      drawCanvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const cursorStyle = activeMode === 'erase' || activeMode === 'restore' || activeMode === 'redraw'
    ? `url(data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="${brushSize * currentZoom}" height="${brushSize * currentZoom}" viewBox="0 0 ${brushSize * currentZoom} ${brushSize * currentZoom}"><circle cx="${(brushSize * currentZoom) / 2}" cy="${(brushSize * currentZoom) / 2}" r="${(brushSize * currentZoom) / 2 - 1}" fill="none" stroke="black" stroke-width="1.5"/><circle cx="${(brushSize * currentZoom) / 2}" cy="${(brushSize * currentZoom) / 2}" r="${(brushSize * currentZoom) / 2 - 2}" fill="none" stroke="white" stroke-width="1.5"/></svg>`)}) ${(brushSize * currentZoom) / 2} ${(brushSize * currentZoom) / 2}, crosshair`
    : activeMode === 'scan' ? 'crosshair' : 'default';

  return (
    <>
      <canvas ref={rawRef} className="hidden" />
      <canvas ref={cleanRef} className="hidden" />
      <canvas ref={committedRef} className="hidden" /> 
      
      <canvas 
        ref={drawRef} 
        id="draw-layer"
        className="absolute top-0 left-0 z-30 w-full h-full touch-none"
        style={{ cursor: cursorStyle, pointerEvents: activeMode !== 'none' ? 'auto' : 'none' }}
      />
    </>
  );
}