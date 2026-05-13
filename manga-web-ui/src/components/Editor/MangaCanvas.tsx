import { useEffect, useRef } from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useConfigStore } from '../../store/useConfigStore';
import { mangaApi } from '../../services/api';
import { getStroke } from 'perfect-freehand'; 

function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return '';
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

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
  
  const currentPoints = useRef<number[][]>([]);
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
      const pressure = e.pointerType === 'mouse' ? 1.0 : (e.pressure !== 0 ? e.pressure : 1.0);
      
      return { 
        x: (e.clientX - rect.left) * scaleX, 
        y: (e.clientY - rect.top) * scaleY, 
        p: pressure 
      };
    };

    const renderCanvas = () => {
       const ctx = drawCanvas.getContext('2d');
       const committedCanvas = committedRef.current;
       if (!ctx || !committedCanvas) return;

       ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
       ctx.drawImage(committedCanvas, 0, 0);

       const mode = useToolStore.getState().activeMode;

       if (isDrawing.current) {
         if (mode === 'scan') {
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = "#00BFFF";
            ctx.lineWidth = 2;
            ctx.strokeRect(scanStart.current.x, scanStart.current.y, currentPos.current.x - scanStart.current.x, currentPos.current.y - scanStart.current.y);
            ctx.setLineDash([]);
         } 
         // 🚀 ĐÃ SỬA: Thêm mode === 'redraw' vào điều kiện render
         else if (mode === 'erase' || mode === 'restore' || mode === 'redraw') {
            const strokeOutline = getStroke(currentPoints.current, {
               size: useToolStore.getState().brushSize, thinning: 0.6, smoothing: 0.8, streamline: 0.5, simulatePressure: false,
            });
            const pathData = getSvgPathFromStroke(strokeOutline);
            const path = new Path2D(pathData);

            // 🚀 ĐÃ SỬA: Cho redraw xài chung nét vẽ màu đỏ của erase
            if (mode === 'erase' || mode === 'redraw') {
               ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
               ctx.fill(path);
            } else if (mode === 'restore') {
               const sourceCanvas = useToolStore.getState().restoreType === 'clean' ? cleanRef.current : rawRef.current;
               if (sourceCanvas) {
                  ctx.save();
                  ctx.clip(path);
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
         currentPoints.current = [[pos.x, pos.y, pos.p]];
      }
      renderCanvas();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawing.current) return;
      const pos = getPointerPos(e);
      if (useToolStore.getState().activeMode === 'scan') {
         currentPos.current = { x: pos.x, y: pos.y };
      } else {
         currentPoints.current.push([pos.x, pos.y, pos.p]);
      }
      requestAnimationFrame(renderCanvas); 
    };

    const handlePointerUp = async (e: PointerEvent) => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      drawCanvas.releasePointerCapture(e.pointerId);
      
      const mode = useToolStore.getState().activeMode;
      
      // 🚀 ĐÃ SỬA: Thêm mode === 'redraw' vào điều kiện commit nét vẽ
      if (mode === 'erase' || mode === 'restore' || mode === 'redraw') {
         const committedCtx = committedRef.current?.getContext('2d');
         if (committedCtx) {
            const strokeOutline = getStroke(currentPoints.current, {
               size: useToolStore.getState().brushSize, thinning: 0.6, smoothing: 0.8, streamline: 0.5, simulatePressure: false,
            });
            const pathData = getSvgPathFromStroke(strokeOutline);
            const path = new Path2D(pathData);

            // 🚀 ĐÃ SỬA: Cho redraw xài chung màu đỏ để tạo Mask
            if (mode === 'erase' || mode === 'redraw') {
               committedCtx.fillStyle = "rgba(255, 0, 0, 0.5)";
               committedCtx.fill(path);
            } else if (mode === 'restore') {
               const sourceCanvas = useToolStore.getState().restoreType === 'clean' ? cleanRef.current : rawRef.current;
               if (sourceCanvas) {
                  committedCtx.save();
                  committedCtx.clip(path);
                  committedCtx.drawImage(sourceCanvas, 0, 0);
                  committedCtx.restore();
               }
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
            const currentUrl = pStore.processedUrls[pStore.currentIndex];
            const filename = currentUrl ? currentUrl.split('/').pop()?.split('?')[0] : "Clean_" + pStore.fileQueue[pStore.currentIndex].name;

            const result = await mangaApi.quickScan({
               filename: filename, x1: Math.floor(scanStart.current.x), y1: Math.floor(scanStart.current.y),
               x2: Math.floor(pos.x), y2: Math.floor(pos.y), genre: config.genre, tone: config.tone, pronouns: config.pronoun
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