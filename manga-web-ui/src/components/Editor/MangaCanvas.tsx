import { useEffect, useRef } from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useConfigStore } from '../../store/useConfigStore';
import { mangaApi } from '../../services/api';

interface Props {
  imgUrl: string;
}

export default function MangaCanvas({ imgUrl }: Props) {
  const drawRef = useRef<HTMLCanvasElement>(null);
  const rawRef = useRef<HTMLCanvasElement>(null);
  const cleanRef = useRef<HTMLCanvasElement>(null);
  
  const { activeMode, brushSize, currentZoom } = useToolStore();

  // Biến cục bộ để quản lý trạng thái vẽ (Không dùng state để chống giật)
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const scanStart = useRef({ x: 0, y: 0 });

  // 1. Tải ảnh vào Canvas ẩn (Raw & Clean) khi đổi trang
  useEffect(() => {
    if (!imgUrl) return;
    const img = new Image();
    img.src = imgUrl;
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      
      // Khởi tạo kích thước cho cả 3 canvas
      if (rawRef.current) {
        rawRef.current.width = w; rawRef.current.height = h;
        rawRef.current.getContext('2d')?.drawImage(img, 0, 0);
      }
      if (cleanRef.current) {
        cleanRef.current.width = w; cleanRef.current.height = h;
        cleanRef.current.getContext('2d')?.drawImage(img, 0, 0);
      }
      if (drawRef.current) {
        drawRef.current.width = w; drawRef.current.height = h;
      }
    };
  }, [imgUrl]);

  // 2. Hàm khoét lỗ cho Cọ Phục Hồi
  const applyRestoreStroke = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const radius = useToolStore.getState().brushSize / 2;
    const sourceCanvas = useToolStore.getState().restoreType === 'clean' ? cleanRef.current : rawRef.current;
    if (!sourceCanvas) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
  };

  // 3. Quản lý sự kiện chuột cho drawLayer
  useEffect(() => {
    const drawCanvas = drawRef.current;
    if (!drawCanvas) return;
    const ctx = drawCanvas.getContext('2d');
    if (!ctx) return;

    const getMousePos = (e: MouseEvent) => {
      const rect = drawCanvas.getBoundingClientRect();
      const zoom = useToolStore.getState().currentZoom;
      return {
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom
      };
    };

    const handleMouseDown = (e: MouseEvent) => {
      const mode = useToolStore.getState().activeMode;
      if (mode === 'none') return;
      
      isDrawing.current = true;
      const pos = getMousePos(e);
      lastPos.current = pos;

      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = useToolStore.getState().brushSize;

      if (mode === 'erase') {
        ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
        ctx.moveTo(pos.x, pos.y);
      } else if (mode === 'restore') {
        applyRestoreStroke(ctx, pos.x, pos.y);
      } else if (mode === 'scan') {
        scanStart.current = pos;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing.current) return;
      const mode = useToolStore.getState().activeMode;
      const pos = getMousePos(e);

      if (mode === 'erase') {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else if (mode === 'restore') {
        const dist = Math.hypot(pos.x - lastPos.current.x, pos.y - lastPos.current.y);
        const size = useToolStore.getState().brushSize;
        const steps = Math.max(1, Math.ceil(dist / (size / 4)));
        
        for (let i = 1; i <= steps; i++) {
            const ix = lastPos.current.x + (pos.x - lastPos.current.x) * (i / steps);
            const iy = lastPos.current.y + (pos.y - lastPos.current.y) * (i / steps);
            applyRestoreStroke(ctx, ix, iy);
        }
        lastPos.current = pos;
      } else if (mode === 'scan') {
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "#00BFFF";
        ctx.lineWidth = 2;
        ctx.strokeRect(scanStart.current.x, scanStart.current.y, pos.x - scanStart.current.x, pos.y - scanStart.current.y);
      }
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      
      const mode = useToolStore.getState().activeMode;
      if (mode === 'scan') {
        const drawCanvas = drawRef.current;
        if (!drawCanvas) return;
        
        const rect = drawCanvas.getBoundingClientRect();
        const zoom = useToolStore.getState().currentZoom;
        const endX = (e.clientX - rect.left) / zoom;
        const endY = (e.clientY - rect.top) / zoom;
        
        // Mở popup trạng thái chờ
        useToolStore.getState().setScanModal({
          isOpen: true, jap: "Đang quét OCR...", vie: "Đang dịch...",
          coords: { x1: scanStart.current.x, y1: scanStart.current.y, x2: endX, y2: endY }
        });

        // Gọi API Lens
        try {
          const config = useConfigStore.getState();
          const pStore = useProjectStore.getState();
          const currentUrl = pStore.processedUrls[pStore.currentIndex];
          const filename = currentUrl 
            ? currentUrl.split('/').pop()?.split('?')[0] 
            : "Clean_" + pStore.fileQueue[pStore.currentIndex].name;

          const result = await mangaApi.quickScan({
            filename: filename,
            x1: Math.floor(scanStart.current.x), y1: Math.floor(scanStart.current.y),
            x2: Math.floor(endX), y2: Math.floor(endY),
            genre: config.genre, tone: config.tone, pronouns: config.pronoun
          });
          
          if (result.status === "success") {
             useToolStore.getState().setScanModal({
                isOpen: true, jap: result.japanese, vie: result.vietnamese,
                coords: { x1: scanStart.current.x, y1: scanStart.current.y, x2: endX, y2: endY }
             });
          }
        } catch (error) {
           alert("Lỗi Lens Dịch!");
           useToolStore.getState().setScanModal(null);
        }
      }
    };

    drawCanvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      drawCanvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []); // Render 1 lần duy nhất, dùng getState() để lấy giá trị mới

  // 4. Cập nhật con trỏ chuột khi chọn cọ
  const cursorStyle = activeMode === 'erase' || activeMode === 'restore' 
    ? `url(data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="${brushSize * currentZoom}" height="${brushSize * currentZoom}" viewBox="0 0 ${brushSize * currentZoom} ${brushSize * currentZoom}"><circle cx="${(brushSize * currentZoom) / 2}" cy="${(brushSize * currentZoom) / 2}" r="${(brushSize * currentZoom) / 2 - 1}" fill="none" stroke="black" stroke-width="1.5"/><circle cx="${(brushSize * currentZoom) / 2}" cy="${(brushSize * currentZoom) / 2}" r="${(brushSize * currentZoom) / 2 - 2}" fill="none" stroke="white" stroke-width="1.5"/></svg>`)}) ${(brushSize * currentZoom) / 2} ${(brushSize * currentZoom) / 2}, crosshair`
    : activeMode === 'scan' ? 'crosshair' : 'default';

  return (
    <>
      <canvas ref={rawRef} className="hidden" />
      <canvas ref={cleanRef} className="hidden" />
      <canvas 
        ref={drawRef} 
        id="draw-layer"
        className="absolute top-0 left-0 z-30 w-full h-full"
        style={{ 
            cursor: cursorStyle,
            pointerEvents: activeMode !== 'none' ? 'auto' : 'none' 
        }}
      />
    </>
  );
}