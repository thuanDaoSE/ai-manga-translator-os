import { useEffect, useRef } from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useConfigStore } from '../../store/useConfigStore';
import { mangaApi } from '../../services/api';
import { getStroke } from 'perfect-freehand'; // 🚀 Import động cơ cọ vẽ

// Thuật toán Helper: Chuyển mảng điểm đa giác thành lệnh vẽ SVG Path2D
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

interface Props { imgUrl: string; }

export default function MangaCanvas({ imgUrl }: Props) {
  const drawRef = useRef<HTMLCanvasElement>(null);      // Canvas hiển thị (Real-time)
  const committedRef = useRef<HTMLCanvasElement>(null); // 🚀 Canvas ẩn lưu các nét ĐÃ VẼ XONG
  const rawRef = useRef<HTMLCanvasElement>(null);
  const cleanRef = useRef<HTMLCanvasElement>(null);

  const { activeMode, brushSize, currentZoom } = useToolStore();
  
  // Lưu trữ tọa độ mượt mà
  const currentPoints = useRef<number[][]>([]);
  const isDrawing = useRef(false);
  const scanStart = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });

  // 1. Tải ảnh ban đầu
  useEffect(() => {
    if (!imgUrl) return;
    const img = new Image();
    img.src = imgUrl;
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      // Khởi tạo kích cỡ cho cả 4 canvas
      [rawRef, cleanRef, drawRef, committedRef].forEach(ref => {
        if (ref.current) { ref.current.width = w; ref.current.height = h; }
      });
      rawRef.current?.getContext('2d')?.drawImage(img, 0, 0);
      cleanRef.current?.getContext('2d')?.drawImage(img, 0, 0);
    };
  }, [imgUrl]);

  // 2. ĐỘNG CƠ POINTER EVENT VÀ CỌ VẼ CHUYÊN NGHIỆP
  useEffect(() => {
    const drawCanvas = drawRef.current;
    if (!drawCanvas) return;

    // Trích xuất tọa độ và Lực nhấn (Pressure) từ Bút/Chuột
    // Trích xuất tọa độ và Lực nhấn (Pressure) từ Bút/Chuột
    // Trích xuất tọa độ và Lực nhấn (Pressure) từ Bút/Chuột
    const getPointerPos = (e: PointerEvent) => {
      const rect = drawCanvas.getBoundingClientRect();
      const scaleX = drawCanvas.width / rect.width;
      const scaleY = drawCanvas.height / rect.height;
      
      // 🚀 FIX LỖI CỠ CỌ: 
      // Nếu là chuột, ép lực nhấn = 1.0 để nét vẽ to đúng bằng viền con trỏ. 
      // Nếu là bút, lấy lực nhấn thật.
      const pressure = e.pointerType === 'mouse' ? 1.0 : (e.pressure !== 0 ? e.pressure : 1.0);
      
      return { 
        x: (e.clientX - rect.left) * scaleX, 
        y: (e.clientY - rect.top) * scaleY, 
        p: pressure 
      };
    };

    
    // Hàm render 60 FPS
    const renderCanvas = () => {
       const ctx = drawCanvas.getContext('2d');
       const committedCanvas = committedRef.current;
       if (!ctx || !committedCanvas) return;

       // Khôi phục lại các nét đã vẽ trước đó
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
         } else if (mode === 'erase' || mode === 'restore') {
            // 🚀 Thuật toán vẽ cọ mượt mà của Perfect Freehand
            const strokeOutline = getStroke(currentPoints.current, {
               size: useToolStore.getState().brushSize,
               thinning: 0.6, // Tự động thuôn nhọn nét khi nhấn nhẹ
               smoothing: 0.8, // Lọc rung tay cực tốt
               streamline: 0.5,
               simulatePressure: false, // Tắt mô phỏng vì ta dùng áp lực thật của Pencil
            });
            
            const pathData = getSvgPathFromStroke(strokeOutline);
            const path = new Path2D(pathData);

            // Đổ màu trực tiếp (Xóa) hoặc dùng làm Mặt nạ (Restore)
            if (mode === 'erase') {
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

    // --- BẮT ĐẦU CHẠM ---
    const handlePointerDown = (e: PointerEvent) => {
      const mode = useToolStore.getState().activeMode;
      if (mode === 'none') return;
      
      isDrawing.current = true;
      drawCanvas.setPointerCapture(e.pointerId); // Khóa con trỏ vào Canvas để vuốt ra mép không bị mất nét
      
      const pos = getPointerPos(e);
      if (mode === 'scan') {
         scanStart.current = { x: pos.x, y: pos.y };
         currentPos.current = { x: pos.x, y: pos.y };
      } else {
         currentPoints.current = [[pos.x, pos.y, pos.p]];
      }
      renderCanvas();
    };

    // --- DI CHUYỂN BÚT ---
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawing.current) return;
      const pos = getPointerPos(e);

      if (useToolStore.getState().activeMode === 'scan') {
         currentPos.current = { x: pos.x, y: pos.y };
      } else {
         currentPoints.current.push([pos.x, pos.y, pos.p]);
      }
      requestAnimationFrame(renderCanvas); // Tối ưu GPU
    };

    // --- NHẤC BÚT LÊN ---
    const handlePointerUp = async (e: PointerEvent) => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      drawCanvas.releasePointerCapture(e.pointerId);
      
      const mode = useToolStore.getState().activeMode;
      
      if (mode === 'erase' || mode === 'restore') {
         // 🚀 CHỐT NÉT VẼ VÀO LỚP ẨN (COMMITTED CANVAS)
         const committedCtx = committedRef.current?.getContext('2d');
         if (committedCtx) {
            const strokeOutline = getStroke(currentPoints.current, {
               size: useToolStore.getState().brushSize, thinning: 0.6, smoothing: 0.8, streamline: 0.5, simulatePressure: false,
            });
            const pathData = getSvgPathFromStroke(strokeOutline);
            const path = new Path2D(pathData);

            if (mode === 'erase') {
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
         currentPoints.current = []; // Xóa bộ nhớ tạm nét vẽ
         renderCanvas(); // Xóa khỏi màn hình Real-time, hiện ảnh từ Committed
      } else if (mode === 'scan') {
         const pos = getPointerPos(e);
         // Logic gọi API Lens y hệt cũ
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

  // 3. Cập nhật con trỏ chuột
  const cursorStyle = activeMode === 'erase' || activeMode === 'restore' || activeMode === 'redraw'
    ? `url(data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="${brushSize * currentZoom}" height="${brushSize * currentZoom}" viewBox="0 0 ${brushSize * currentZoom} ${brushSize * currentZoom}"><circle cx="${(brushSize * currentZoom) / 2}" cy="${(brushSize * currentZoom) / 2}" r="${(brushSize * currentZoom) / 2 - 1}" fill="none" stroke="black" stroke-width="1.5"/><circle cx="${(brushSize * currentZoom) / 2}" cy="${(brushSize * currentZoom) / 2}" r="${(brushSize * currentZoom) / 2 - 2}" fill="none" stroke="white" stroke-width="1.5"/></svg>`)}) ${(brushSize * currentZoom) / 2} ${(brushSize * currentZoom) / 2}, crosshair`
    : activeMode === 'scan' ? 'crosshair' : 'default';

  return (
    <>
      <canvas ref={rawRef} className="hidden" />
      <canvas ref={cleanRef} className="hidden" />
      {/* 🚀 Canvas ẩn cực kỳ quan trọng để lưu giữ các nét cũ đã hoàn tất */}
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