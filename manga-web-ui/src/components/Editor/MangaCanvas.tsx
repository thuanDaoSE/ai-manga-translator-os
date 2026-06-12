import { useEffect, useRef } from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useConfigStore } from '../../store/useConfigStore';
import { useMangaEditorStore } from '../../store/useMangaEditorStore';
import { mangaApi } from '../../services/api';
import { createScreentonePattern } from './ScreentoneSelector';
import toast from 'react-hot-toast';

interface Props {
  rawUrl: string | null;
  displayUrl: string | null;
  originalCleanUrl: string | null; // 🚀 Két sắt chứa ảnh Sạch nguyên thủy
}

export default function MangaCanvas({ rawUrl, displayUrl, originalCleanUrl }: Props) {
  const drawRef = useRef<HTMLCanvasElement>(null);
  const committedRef = useRef<HTMLCanvasElement>(null);
  const rawRef = useRef<HTMLCanvasElement>(null);
  const cleanRef = useRef<HTMLCanvasElement>(null);
  const originalCleanRef = useRef<HTMLCanvasElement>(null); // 🚀 Thêm ref Két sắt

  const activeMode = useToolStore((state) => state.activeMode);
  const brushSize = useToolStore((state) => state.brushSize);
  const currentZoom = useToolStore((state) => state.currentZoom);

  const currentPoints = useRef<{ x: number, y: number }[]>([]);
  const isDrawing = useRef(false);
  const scanStart = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });

  // 1. Tải ảnh Gốc
  // 🚀 TỐI ƯU HÓA: TẢI ĐỒNG BỘ TẤT CẢ CÁC LỚP ẢNH CÙNG LÚC
  useEffect(() => {
    let isMounted = true; // C ng l i Race Condition

    // 🚀 BẢN VÁ 3: GIẶT SẠCH CỌ VẼ VÀ CANVAS CŨ KHI CHUYỂN TRANG
    [cleanRef, drawRef, committedRef, originalCleanRef].forEach(ref => {
      if (ref.current) {
        ref.current.getContext('2d')?.clearRect(0, 0, ref.current.width, ref.current.height);
      }
    });
    currentPoints.current = [];

    // Hàm tạo Promise tải 1 bức ảnh
    const loadImage = (url: string | null): Promise<HTMLImageElement | null> => {
      if (!url) return Promise.resolve(null);
      return new Promise((resolve) => {
        const img = new Image();
        if (!url.startsWith('blob:') && !url.startsWith('data:')) {
          img.crossOrigin = "anonymous";
        }
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null); // Lỗi thì trả về null chứ không làm sập toàn bộ
        img.src = url;
      });
    };

    // Chờ cả 3 ảnh tải xong vào RAM rồi mới vẽ ra UI
    Promise.all([
      loadImage(displayUrl), // Ảnh hiển thị chính (Clean/Processed)
      loadImage(rawUrl),     // Ảnh gốc
      loadImage(originalCleanUrl) // Két sắt ảnh sạch
    ]).then(([displayImg, rawImg, originalCleanImg]) => {

      // Nếu user đã bấm chuyển sang trang khác trong lúc ảnh đang tải -> Hủy vẽ
      if (!isMounted) return;

      // 1. VẼ ẢNH HIỂN THỊ CHÍNH & ĐỒNG BỘ SIZE CÁC CANVAS VẼ
      if (displayImg) {
        const w = displayImg.naturalWidth;
        const h = displayImg.naturalHeight;

        // Đổi size tất cả các canvas cùng 1 thời điểm chớp nhoáng
        [cleanRef, drawRef, committedRef].forEach(ref => {
          if (ref.current) {
            ref.current.width = w;
            ref.current.height = h;
          }
        });
        cleanRef.current?.getContext('2d')?.drawImage(displayImg, 0, 0);
      }

      // 2. VẼ ẢNH RAW (Lớp ẩn)
      if (rawImg && rawRef.current) {
        rawRef.current.width = rawImg.naturalWidth;
        rawRef.current.height = rawImg.naturalHeight;
        rawRef.current.getContext('2d')?.drawImage(rawImg, 0, 0);
      }

      // 3. VẼ ẢNH ORIGINAL CLEAN (Két sắt ẩn)
      if (originalCleanImg && originalCleanRef.current) {
        originalCleanRef.current.width = originalCleanImg.naturalWidth;
        originalCleanRef.current.height = originalCleanImg.naturalHeight;
        originalCleanRef.current.getContext('2d')?.drawImage(originalCleanImg, 0, 0);
      }

      // Xóa các nét vẽ cũ (nếu có) khi sang trang mới
      currentPoints.current = [];
    });

    // Hàm dọn dẹp khi Component bị unmount hoặc URL thay đổi
    return () => {
      isMounted = false;
    };
  }, [rawUrl, displayUrl, originalCleanUrl]);

  useEffect(() => {
    const ctx1 = drawRef.current?.getContext('2d');
    const ctx2 = committedRef.current?.getContext('2d');
    if (drawRef.current && committedRef.current) {
      ctx1?.clearRect(0, 0, drawRef.current.width, drawRef.current.height);
      ctx2?.clearRect(0, 0, committedRef.current.width, committedRef.current.height);
    }
    currentPoints.current = [];
    useToolStore.getState().setActionPosition(null);
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

    const drawStroke = (ctx: CanvasRenderingContext2D, points: { x: number, y: number }[], size: number, color: string | CanvasPattern) => {
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
        else if (mode === 'erase' || mode === 'restore' || mode === 'redraw' || mode === 'screentone') {
          if (mode === 'erase' || mode === 'redraw') {
            drawStroke(ctx, currentPoints.current, currentBrushSize, "rgba(255, 0, 0, 0.5)");
          } else if (mode === 'screentone') {
            const screentoneType = useToolStore.getState().screentoneType;
            const screentoneColor = useToolStore.getState().screentoneColor;
            const pattern = createScreentonePattern(ctx, screentoneType, screentoneColor);
            drawStroke(ctx, currentPoints.current, currentBrushSize, pattern);
          } else if (mode === 'restore') {
            // 🚀 LẤY NGUỒN CỌ CHUẨN XÁC DỰA VÀO NÚT BẤM
            const restoreType = useToolStore.getState().restoreType;
            const sourceCanvas = restoreType === 'clean' ? originalCleanRef.current : rawRef.current;

            if (sourceCanvas && sourceCanvas.width > 0) {
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
        currentPoints.current = [{ x: pos.x, y: pos.y }];
      }
      renderCanvas();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawing.current) return;
      const pos = getPointerPos(e);
      if (useToolStore.getState().activeMode === 'scan') {
        currentPos.current = { x: pos.x, y: pos.y };
      } else {
        currentPoints.current.push({ x: pos.x, y: pos.y });
      }
      requestAnimationFrame(renderCanvas);
    };

    const handlePointerUp = async (e: PointerEvent) => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      drawCanvas.releasePointerCapture(e.pointerId);

      const mode = useToolStore.getState().activeMode;
      const currentBrushSize = useToolStore.getState().brushSize;

      if (mode === 'erase' || mode === 'restore' || mode === 'redraw' || mode === 'screentone') {
        if (mode === 'screentone') {
          const targetCanvas = cleanRef.current;
          if (targetCanvas) {
            try {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = targetCanvas.width;
              tempCanvas.height = targetCanvas.height;
              const tCtx = tempCanvas.getContext('2d')!;

              const screentoneType = useToolStore.getState().screentoneType;
              const screentoneColor = useToolStore.getState().screentoneColor;
              const pattern = createScreentonePattern(tCtx, screentoneType, screentoneColor);

              drawStroke(tCtx, currentPoints.current, currentBrushSize, pattern);

              const finalCanvas = document.createElement('canvas');
              finalCanvas.width = targetCanvas.width;
              finalCanvas.height = targetCanvas.height;
              const fCtx = finalCanvas.getContext('2d')!;

              fCtx.drawImage(targetCanvas, 0, 0);
              fCtx.drawImage(tempCanvas, 0, 0);

              await useMangaEditorStore.getState().saveCanvasImageState(finalCanvas);
              const newUrl = useMangaEditorStore.getState().imageUrl;
              if (newUrl) {
                useProjectStore.getState().setProcessedUrl(useProjectStore.getState().currentIndex, newUrl);
              }
            } catch (err) {
              console.error("Screentone Crash:", err);
              toast.error("Lỗi trình duyệt: Không thể vẽ họa tiết.");
            }
          }
          useToolStore.getState().setActionPosition(null);
        } else {
          const committedCtx = committedRef.current?.getContext('2d');
          if (committedCtx) {
            if (mode === 'erase' || mode === 'redraw') {
              drawStroke(committedCtx, currentPoints.current, currentBrushSize, "rgba(255, 0, 0, 0.5)");
              useToolStore.getState().setActionPosition({ x: e.clientX, y: e.clientY });
            } else if (mode === 'restore') {
              // 🚀 LƯU NÉT VẼ TỪ NGUỒN CỌ CHUẨN XÁC
              const restoreType = useToolStore.getState().restoreType;
              const sourceCanvas = restoreType === 'clean' ? originalCleanRef.current : rawRef.current;
              const targetCanvas = cleanRef.current;

              if (sourceCanvas && targetCanvas && sourceCanvas.width > 0) {
                try {
                  const tempCanvas = document.createElement('canvas');
                  tempCanvas.width = targetCanvas.width;
                  tempCanvas.height = targetCanvas.height;
                  const tCtx = tempCanvas.getContext('2d')!;

                  drawStroke(tCtx, currentPoints.current, currentBrushSize, "rgba(0,0,0,1)");
                  tCtx.globalCompositeOperation = 'source-in';
                  tCtx.drawImage(sourceCanvas, 0, 0);

                  const finalCanvas = document.createElement('canvas');
                  finalCanvas.width = targetCanvas.width;
                  finalCanvas.height = targetCanvas.height;
                  const fCtx = finalCanvas.getContext('2d')!;

                  fCtx.drawImage(targetCanvas, 0, 0);
                  fCtx.drawImage(tempCanvas, 0, 0);

                  const newUrl = finalCanvas.toDataURL("image/png");
                  useProjectStore.getState().setProcessedUrl(useProjectStore.getState().currentIndex, newUrl);
                } catch (err) {
                  console.error("Canvas Crash:", err);
                  toast.error("Lỗi trình duyệt: Không thể lưu (Chặn CORS ảnh).");
                }
              } else {
                toast.error("Vui lòng đợi ảnh tải xong trước khi cọ!");
              }
              useToolStore.getState().setActionPosition(null);
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
          const originalName = pStore.fileQueue[pStore.currentIndex]?.name || "";
          const fileExt = originalName.includes('.') ? originalName.split('.').pop() : 'jpg';
          const serverRawUrl = `${import.meta.env.VITE_API_URL}/workspace/${pStore.projectId}/raw/${pStore.pageIds[pStore.currentIndex]}.${fileExt}`;
          const targetUrl = pStore.processedUrls[pStore.currentIndex] || serverRawUrl;

          const relativePath = targetUrl.replace(`${import.meta.env.VITE_API_URL}/`, '').split('?')[0];
          const cleanTargetUrl = targetUrl.split('?')[0];

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

  const cursorStyle = activeMode === 'erase' || activeMode === 'restore' || activeMode === 'redraw' || activeMode === 'screentone'
    ? `url(data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="${brushSize * currentZoom}" height="${brushSize * currentZoom}" viewBox="0 0 ${brushSize * currentZoom} ${brushSize * currentZoom}"><circle cx="${(brushSize * currentZoom) / 2}" cy="${(brushSize * currentZoom) / 2}" r="${(brushSize * currentZoom) / 2 - 1}" fill="none" stroke="black" stroke-width="1.5"/><circle cx="${(brushSize * currentZoom) / 2}" cy="${(brushSize * currentZoom) / 2}" r="${(brushSize * currentZoom) / 2 - 2}" fill="none" stroke="white" stroke-width="1.5"/></svg>`)}) ${(brushSize * currentZoom) / 2} ${(brushSize * currentZoom) / 2}, crosshair`
    : activeMode === 'scan' ? 'crosshair' : 'default';

  return (
    <>
      <canvas ref={rawRef} className="hidden" />
      <canvas ref={cleanRef} className="hidden" />
      <canvas ref={committedRef} className="hidden" />
      {/* 🚀 Thêm Két sắt vào HTML để vẽ ẩn */}
      <canvas ref={originalCleanRef} className="hidden" />
      <canvas
        ref={drawRef}
        id="draw-layer"
        className="absolute top-0 left-0 z-30 w-full h-full touch-none"
        style={{ cursor: cursorStyle, pointerEvents: activeMode !== 'none' ? 'auto' : 'none' }}
      />
    </>
  );
}