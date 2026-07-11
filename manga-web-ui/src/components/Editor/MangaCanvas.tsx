import { useEffect, useRef, useState } from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useConfigStore } from '../../store/useConfigStore';
import { useMangaEditorStore } from '../../store/useMangaEditorStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { mangaApi } from '../../services/api';
import { useAuthStore } from '../../store/useAuthStore';
import toast from 'react-hot-toast';

const fillContour = (ctx: CanvasRenderingContext2D, coords: number[], fillColor: string) => {
  if (coords.length === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(coords[0], coords[1]);
  for (let i = 2; i < coords.length; i += 2) {
    ctx.lineTo(coords[i], coords[i + 1]);
  }
  ctx.closePath();
  if (fillColor === 'transparent') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
  } else {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  ctx.restore();
};

const drawClonePoint = (
  ctx: CanvasRenderingContext2D,
  copyCanvas: HTMLCanvasElement,
  px: number,
  py: number,
  offset: { x: number; y: number },
  size: number
) => {
  const r = size / 2;
  let sx = px - offset.x - r;
  let sy = py - offset.y - r;
  let sw = size;
  let sh = size;
  let dx = px - r;
  let dy = py - r;
  let dw = size;
  let dh = size;

  // Sanitize source coordinates to avoid out-of-bounds DOMException (IndexSizeError)
  if (sx < 0) {
    const diff = -sx;
    sx = 0;
    sw -= diff;
    dx += diff;
    dw -= diff;
  }
  if (sy < 0) {
    const diff = -sy;
    sy = 0;
    sh -= diff;
    dy += diff;
    dh -= diff;
  }
  if (sx + sw > copyCanvas.width) {
    const diff = (sx + sw) - copyCanvas.width;
    sw -= diff;
    dw -= diff;
  }
  if (sy + sh > copyCanvas.height) {
    const diff = (sy + sh) - copyCanvas.height;
    sh -= diff;
    dh -= diff;
  }

  // Draw only if dimensions are valid and positive
  if (sw > 0 && sh > 0 && dw > 0 && dh > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, size / 2, 0, Math.PI * 2);
    ctx.clip();
    try {
      ctx.drawImage(
      copyCanvas,
      sx,
      sy,
      sw,
      sh,
      dx,
      dy,
      dw,
      dh
    );
    } catch (err) {
      // Fallback guard
    }
    ctx.restore();
  }
};

const drawStrokeSegment = (
  ctx: CanvasRenderingContext2D,
  p1: { x: number, y: number },
  p2: { x: number, y: number },
  size: number,
  color: string
) => {
  ctx.save();
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size;
  ctx.strokeStyle = color;
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.restore();
};

const drawRestoreSegment = (
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  p1: { x: number, y: number },
  p2: { x: number, y: number },
  size: number
) => {
  const minX = Math.floor(Math.max(0, Math.min(p1.x, p2.x) - size));
  const minY = Math.floor(Math.max(0, Math.min(p1.y, p2.y) - size));
  const maxX = Math.ceil(Math.min(sourceCanvas.width, Math.max(p1.x, p2.x) + size));
  const maxY = Math.ceil(Math.min(sourceCanvas.height, Math.max(p1.y, p2.y) + size));
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return;

  try {
    ctx.save();
    ctx.beginPath();
    
    // Draw capsule circular caps at start and end points
    ctx.arc(p1.x, p1.y, size / 2, 0, 2 * Math.PI);
    ctx.arc(p2.x, p2.y, size / 2, 0, 2 * Math.PI);

    // Draw the rectangle connecting the two points
    const theta = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const dx = Math.sin(theta) * (size / 2);
    const dy = -Math.cos(theta) * (size / 2);
    ctx.moveTo(p1.x + dx, p1.y + dy);
    ctx.lineTo(p1.x - dx, p1.y - dy);
    ctx.lineTo(p2.x - dx, p2.y - dy);
    ctx.lineTo(p2.x + dx, p2.y + dy);
    ctx.closePath();

    // Clip to the capsule path
    ctx.clip();

    // Draw the source pixels directly onto the destination canvas
    ctx.drawImage(sourceCanvas, minX, minY, w, h, minX, minY, w, h);
  } catch (err) {
    console.error("drawRestoreSegment failed:", err);
  } finally {
    ctx.restore();
  }
};

const drawCloneSegment = (
  ctx: CanvasRenderingContext2D,
  copyCanvas: HTMLCanvasElement,
  p1: { x: number, y: number },
  p2: { x: number, y: number },
  offset: { x: number; y: number },
  size: number
) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = 2;
  if (dist > step) {
    const steps = Math.ceil(dist / step);
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const ix = p1.x + dx * t;
      const iy = p1.y + dy * t;
      drawClonePoint(ctx, copyCanvas, ix, iy, offset, size);
    }
  } else {
    drawClonePoint(ctx, copyCanvas, p2.x, p2.y, offset, size);
  }
};



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
  const tempBufferCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeMode = useToolStore((state) => state.activeMode);
  const brushSize = useToolStore((state) => state.brushSize);
  const currentZoom = useToolStore((state) => state.currentZoom);

  // 🚀 Clone Brush states & actions
  const cloneSource = useToolStore((state) => state.cloneSource);
  const setCloneSource = useToolStore((state) => state.setCloneSource);
  const isSelectingSource = useToolStore((state) => state.isSelectingSource);
  const setIsSelectingSource = useToolStore((state) => state.setIsSelectingSource);

  // 🚀 Speedline states & actions
  const speedlineColor = useToolStore((state) => state.speedlineColor);
  const speedlineType = useToolStore((state) => state.speedlineType);



  // 🚀 Local & Ref states for Clone & Magic Wand
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const cloneDestCursorRef = useRef<HTMLDivElement | null>(null);
  const lastSavedDataUrlRef = useRef<string | null>(null);
  const lastPointRef = useRef<{ x: number, y: number } | null>(null);

  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isOffsetSetRef = useRef<boolean>(false);
  const cloneCopyCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const currentPoints = useRef<{ x: number, y: number }[]>([]);

  const isDrawing = useRef(false);
  const [isSpacePressedState, setIsSpacePressedState] = useState(false);
  const [isPanningState, setIsPanningState] = useState(false);
  const scanStart = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });
  const saveTimeoutRef = useRef<any>(null);

  const saveCleanImageToServer = async (dataUrl: string) => {
    const pStore = useProjectStore.getState();
    const pageId = pStore.pageIds[pStore.currentIndex];
    if (!pageId) return;

    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      const projectId = pStore.projectId;
      const serverPath = `workspace/${projectId}/clean/${pageId}_edited.png`;

      await mangaApi.uploadCleanImage(serverPath, blob);

      const bubbles = useCanvasStore.getState().bubbles;
      const relativeUrl = `/${serverPath}`;
      await mangaApi.savePageResults(pageId, relativeUrl, bubbles);
    } catch (err) {
      console.error("Lỗi tự động lưu ảnh lên server:", err);
    }
  };

  const saveCleanImageToServerDebounced = (dataUrl: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveCleanImageToServer(dataUrl);
      saveTimeoutRef.current = null;
    }, 2000);
  };

  // Tự động lưu ngay khi chuyển trang hoặc đóng tab nếu còn hàng chờ lưu
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        const targetCanvas = cleanRef.current;
        if (targetCanvas) {
          try {
            const newUrl = targetCanvas.toDataURL("image/png");
                 saveCleanImageToServerDebounced(newUrl);
          } catch (e) {
            console.error("Flush save failed:", e);
          }
        }
      }
    };
  }, []);

  // 1. Tải ảnh Gốc
  // 🚀 TỐI ƯU HÓA 1: TẢI TRANG MỚI (CHỈ CHẠY KHI ĐỔI TRANG)
  useEffect(() => {
    let isMounted = true;

    // Clear preview and committed layers when changing page
    [drawRef, committedRef].forEach(ref => {
      if (ref.current) {
        ref.current.getContext('2d')?.clearRect(0, 0, ref.current.width, ref.current.height);
      }
    });
    currentPoints.current = [];

    const loadImage = (url: string | null): Promise<HTMLImageElement | null> => {
      if (!url) return Promise.resolve(null);
      return new Promise((resolve) => {
        const img = new Image();
        if (!url.startsWith('blob:') && !url.startsWith('data:')) {
          img.crossOrigin = "anonymous";
        }
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        if (!url.startsWith('blob:') && !url.startsWith('data:')) {
          const sep = url.includes('?') ? '&' : '?';
          img.src = `${url}${sep}cors=1`;
        } else {
          img.src = url;
        }
      });
    };

    const initialDisplayUrl = useProjectStore.getState().processedUrls[useProjectStore.getState().currentIndex] || rawUrl;

    Promise.all([
      loadImage(initialDisplayUrl),
      loadImage(rawUrl),
      loadImage(originalCleanUrl)
    ]).then(([displayImg, rawImg, originalCleanImg]) => {
      if (!isMounted) return;

      let w = 0;
      let h = 0;

      if (displayImg) {
        w = displayImg.naturalWidth;
        h = displayImg.naturalHeight;
      } else if (originalCleanImg) {
        w = originalCleanImg.naturalWidth;
        h = originalCleanImg.naturalHeight;
      } else if (rawImg) {
        w = rawImg.naturalWidth;
        h = rawImg.naturalHeight;
      }

      if (w > 0 && h > 0) {
        [cleanRef, drawRef, committedRef, originalCleanRef, rawRef].forEach(ref => {
          if (ref.current) {
            ref.current.width = w;
            ref.current.height = h;
            const ctx = ref.current.getContext('2d');
            if (ctx) ctx.imageSmoothingEnabled = false;
          }
        });
      }

      if (displayImg && cleanRef.current) {
        const cleanCtx = cleanRef.current.getContext('2d');
        if (cleanCtx) {
          cleanCtx.imageSmoothingEnabled = false;
          cleanCtx.drawImage(displayImg, 0, 0);
        }
      }

      if (rawImg && rawRef.current) {
        const rawCtx = rawRef.current.getContext('2d');
        if (rawCtx) {
          rawCtx.imageSmoothingEnabled = false;
          rawCtx.drawImage(rawImg, 0, 0);
        }
      }

      if (originalCleanImg && originalCleanRef.current) {
        const origCtx = originalCleanRef.current.getContext('2d');
        if (origCtx) {
          origCtx.imageSmoothingEnabled = false;
          origCtx.drawImage(originalCleanImg, 0, 0);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [rawUrl, originalCleanUrl]);

  // 🚀 TỐI ƯU HÓA 2: ĐỒNG BỘ ẢNH ĐANG HIỂN THỊ CHÍNH (Đỡ giật giật màn hình khi vẽ cọ)
  useEffect(() => {
    if (!displayUrl) return;
    if (displayUrl === lastSavedDataUrlRef.current) return; // Không cần tải lại nếu vừa được vẽ trực tiếp trên canvas

    let isMounted = true;
    const img = new Image();
    if (!displayUrl.startsWith('blob:') && !displayUrl.startsWith('data:')) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      if (!isMounted) return;
      const cleanCanvas = cleanRef.current;
      if (cleanCanvas) {
        if (cleanCanvas.width !== img.naturalWidth || cleanCanvas.height !== img.naturalHeight) {
          cleanCanvas.width = img.naturalWidth;
          cleanCanvas.height = img.naturalHeight;
        }
        const cleanCtx = cleanCanvas.getContext('2d');
        if (cleanCtx) {
          cleanCtx.imageSmoothingEnabled = false;
          cleanCtx.clearRect(0, 0, cleanCanvas.width, cleanCanvas.height);
          cleanCtx.drawImage(img, 0, 0);
        }
      }
    };
    img.src = displayUrl;

    return () => {
      isMounted = false;
    };
  }, [displayUrl]);





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

    const isSpacePressed = { current: false };

    const handleWinKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
        e.preventDefault();
        isSpacePressed.current = true;
        setIsSpacePressedState(true);
        if (cursorRef.current) cursorRef.current.style.display = 'none';
      }
    };

    const handleWinKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressed.current = false;
        setIsSpacePressedState(false);
        setIsPanningState(false);
      }
    };

    const updateCursors = (pos: { x: number; y: number }, e?: PointerEvent) => {
      const mode = useToolStore.getState().activeMode;
      const isSelectingSource = useToolStore.getState().isSelectingSource;
      const cloneSource = useToolStore.getState().cloneSource;

      // Handle Shift Axis Lock
      let finalPos = { ...pos };
      if (e?.shiftKey && currentPoints.current.length > 0) {
        const start = currentPoints.current[0];
        const dx = Math.abs(pos.x - start.x);
        const dy = Math.abs(pos.y - start.y);
        if (dx > dy) finalPos.y = start.y;
        else finalPos.x = start.x;
      }

      if (cursorRef.current) {
        const showBrush = !isSpacePressed.current && (mode === 'erase' || mode === 'restore' || mode === 'redraw' || mode === 'clone' || mode === 'speedline');
        if (showBrush) {
          cursorRef.current.style.left = `${finalPos.x}px`;
          cursorRef.current.style.top = `${finalPos.y}px`;
          cursorRef.current.style.display = 'block';
        } else {
          cursorRef.current.style.display = 'none';
        }
      }

      if (cloneDestCursorRef.current) {
        const showCloneDest = mode === 'clone' && isDrawing.current && cloneSource;
        if (showCloneDest) {
          const rect = drawCanvas.getBoundingClientRect();
          const scaleX = rect.width / drawCanvas.width;
          const scaleY = rect.height / drawCanvas.height;
          cloneDestCursorRef.current.style.left = `${(finalPos.x - offsetRef.current.x) * scaleX}px`;
          cloneDestCursorRef.current.style.top = `${(finalPos.y - offsetRef.current.y) * scaleY}px`;
          cloneDestCursorRef.current.style.display = 'flex';
        } else {
          cloneDestCursorRef.current.style.display = 'none';
        }
      }
    };

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
      ctx.save();
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
        ctx.restore();
        return;
      }

      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const midPoint = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
        ctx.quadraticCurveTo(points[i].x, points[i].y, midPoint.x, midPoint.y);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.stroke();
      ctx.restore();
    };

    const renderCanvas = () => {
      const ctx = drawCanvas.getContext('2d');
      const committedCanvas = committedRef.current;
      if (!ctx || !committedCanvas) return;

      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      ctx.drawImage(committedCanvas, 0, 0);

      // Force standard composite operation to ensure preview strokes are visible
      ctx.globalCompositeOperation = 'source-over';

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
            if (!tempBufferCanvasRef.current) {
              tempBufferCanvasRef.current = document.createElement('canvas');
            }
            const tempCanvas = tempBufferCanvasRef.current;
            if (tempCanvas.width !== drawCanvas.width || tempCanvas.height !== drawCanvas.height) {
              tempCanvas.width = drawCanvas.width;
              tempCanvas.height = drawCanvas.height;
            }
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.restore();
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
        else if (mode === 'clone') {
          if (cloneCopyCanvasRef.current && cloneSource) {
            ctx.save();
            const points = currentPoints.current;
            if (points.length > 0) {
              for (let i = 0; i < points.length; i++) {
                if (i > 0) {
                  const p1 = points[i - 1];
                  const p2 = points[i];
                  const dx = p2.x - p1.x;
                  const dy = p2.y - p1.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const step = 2;
                  if (dist > step) {
                    const steps = Math.ceil(dist / step);
                    for (let j = 0; j <= steps; j++) {
                      const t = j / steps;
                      const ix = p1.x + dx * t;
                      const iy = p1.y + dy * t;
                      drawClonePoint(ctx, cloneCopyCanvasRef.current, ix, iy, offsetRef.current, currentBrushSize);
                    }
                  } else {
                    drawClonePoint(ctx, cloneCopyCanvasRef.current, p2.x, p2.y, offsetRef.current, currentBrushSize);
                  }
                } else {
                  drawClonePoint(ctx, cloneCopyCanvasRef.current, points[i].x, points[i].y, offsetRef.current, currentBrushSize);
                }
              }
            }
            ctx.restore();
          }
        }
        else if (mode === 'speedline') {
          const color = useToolStore.getState().speedlineColor || '#000000';
          const size = useToolStore.getState().brushSize || 35;
          const type = useToolStore.getState().speedlineType;
          if (type === 'line' && currentPoints.current.length > 0) {
            const startPt = currentPoints.current[0];
            ctx.save();
            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = size;
            ctx.strokeStyle = color;
            ctx.moveTo(startPt.x, startPt.y);
            ctx.lineTo(currentPos.current.x, currentPos.current.y);
            ctx.stroke();
            ctx.restore();
          } else if (type === 'eraser') {
            const sourceCanvas = originalCleanRef.current;
            if (sourceCanvas && sourceCanvas.width > 0) {
              ctx.save();
              drawStroke(ctx, currentPoints.current, size, "rgba(0,0,0,1)");
              ctx.globalCompositeOperation = 'source-in';
              ctx.drawImage(sourceCanvas, 0, 0);
              ctx.restore();
            }
          } else {
            ctx.save();
            drawStroke(ctx, currentPoints.current, size, color);
            ctx.restore();
          }
        }
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const mode = useToolStore.getState().activeMode;
      if (mode === 'none') return;
      
      const isSpacePan = e.button === 0 && isSpacePressed.current;
      const isMiddleClick = e.button === 1;
      if (isSpacePan || isMiddleClick) {
        isDrawing.current = false;
        useToolStore.getState().setIsDrawingState(false);
        setIsPanningState(true);
        return;
      }
      
      e.preventDefault();
      const pos = getPointerPos(e);
      updateCursors(pos, e);

      const speedlineType = useToolStore.getState().speedlineType;
      if (mode === 'speedline' && speedlineType === 'eyedropper') {
        const cleanCanvas = cleanRef.current;
        const ctx = cleanCanvas?.getContext('2d');
        if (cleanCanvas && ctx) {
          try {
            const px = Math.floor(pos.x);
            const py = Math.floor(pos.y);
            const pixel = ctx.getImageData(px, py, 1, 1).data;
            const hex = "#" + [pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('');
            useToolStore.getState().setSpeedlineColor(hex);
            useToolStore.getState().setSpeedlineType('brush');
            toast.success(`Đã chọn màu: ${hex.toUpperCase()}`, { icon: '🎨' });
          } catch (err) {
            console.error("Eyedropper failed:", err);
            toast.error("Không thể chọn màu.");
          }
        }
        isDrawing.current = false;
        useToolStore.getState().setIsDrawingState(false);
        return;
      }

      if (mode === 'clone') {
        const isSelecting = useToolStore.getState().isSelectingSource || e.altKey;
        if (isSelecting) {
          useToolStore.getState().setCloneSource(pos);
          useToolStore.getState().setIsSelectingSource(false);
          toast.success(`Đã chọn điểm nguồn tại (${Math.round(pos.x)}, ${Math.round(pos.y)})`);
          isOffsetSetRef.current = false;
          isDrawing.current = false;
          useToolStore.getState().setIsDrawingState(false);
          return;
        }

        if (!useToolStore.getState().cloneSource) {
          toast.error("Vui lòng thiết lập điểm nguồn trước (Alt+Click hoặc click nút Chọn Nguồn)");
          isDrawing.current = false;
          useToolStore.getState().setIsDrawingState(false);
          return;
        }

        isDrawing.current = true;
        useToolStore.getState().setIsDrawingState(true);
        drawCanvas.setPointerCapture(e.pointerId);
        currentPoints.current = [pos];
        lastPointRef.current = pos;
        if (!isOffsetSetRef.current) {
          const src = useToolStore.getState().cloneSource!;
          offsetRef.current = { x: pos.x - src.x, y: pos.y - src.y };
          isOffsetSetRef.current = true;
        }

        const cleanCanvas = cleanRef.current;
        if (cleanCanvas) {
          const copyCanvas = document.createElement('canvas');
          copyCanvas.width = cleanCanvas.width;
          copyCanvas.height = cleanCanvas.height;
          const copyCtx = copyCanvas.getContext('2d')!;
          copyCtx.drawImage(cleanCanvas, 0, 0);
          cloneCopyCanvasRef.current = copyCanvas;
        }

        renderCanvas();
        return;
      }



      isDrawing.current = true;
      useToolStore.getState().setIsDrawingState(true);
      drawCanvas.setPointerCapture(e.pointerId);

      if (mode === 'scan') {
        scanStart.current = { x: pos.x, y: pos.y };
        currentPos.current = { x: pos.x, y: pos.y };
      } else {
        currentPoints.current = [{ x: pos.x, y: pos.y }];
        lastPointRef.current = pos;
        if (mode === 'speedline' && useToolStore.getState().speedlineType === 'line') {
          currentPos.current = { x: pos.x, y: pos.y };
        }
        if (mode === 'erase' || mode === 'redraw') {
          if (!tempBufferCanvasRef.current) {
            tempBufferCanvasRef.current = document.createElement('canvas');
          }
          const tempCanvas = tempBufferCanvasRef.current;
          tempCanvas.width = drawCanvas.width;
          tempCanvas.height = drawCanvas.height;
          const tCtx = tempCanvas.getContext('2d')!;
          tCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
          
          const currentBrushSize = useToolStore.getState().brushSize;
          tCtx.fillStyle = "rgba(255, 0, 0, 1.0)";
          tCtx.beginPath();
          tCtx.arc(pos.x, pos.y, currentBrushSize / 2, 0, Math.PI * 2);
          tCtx.fill();
        }
      }
      renderCanvas();
    };

    const handlePointerMove = (e: PointerEvent) => {
      let pos = getPointerPos(e);
      e.preventDefault();

      // 🚀 Shift-key constraint for drawing straight horizontal/vertical lines (like Photoshop)
      if (e.shiftKey && currentPoints.current.length > 0) {
        const startPt = currentPoints.current[0];
        const dx = pos.x - startPt.x;
        const dy = pos.y - startPt.y;
        if (Math.abs(dx) > Math.abs(dy)) {
          pos = { x: pos.x, y: startPt.y };
        } else {
          pos = { x: startPt.x, y: pos.y };
        }
      }

      updateCursors(pos, e);

      if (!isDrawing.current) {
        const mode = useToolStore.getState().activeMode;
        if (e.buttons === 1 && mode !== 'none' && mode !== 'scan') {
          handlePointerDown(e);
          if (!isDrawing.current) return;
        } else {
          return;
        }
      }
      const mode = useToolStore.getState().activeMode;
      const type = useToolStore.getState().speedlineType;
      const currentBrushSize = useToolStore.getState().brushSize;

      if (mode === 'scan' || (mode === 'speedline' && type === 'line') || mode === 'erase' || mode === 'redraw') {
        currentPos.current = { x: pos.x, y: pos.y };
        if (mode === 'erase' || mode === 'redraw') {
          currentPoints.current.push({ x: pos.x, y: pos.y });
          const tempCanvas = tempBufferCanvasRef.current;
          if (tempCanvas && lastPointRef.current) {
            const tCtx = tempCanvas.getContext('2d')!;
            tCtx.strokeStyle = "rgba(255, 0, 0, 1.0)";
            tCtx.lineWidth = currentBrushSize;
            tCtx.lineCap = 'round';
            tCtx.lineJoin = 'round';
            tCtx.beginPath();
            tCtx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
            tCtx.lineTo(pos.x, pos.y);
            tCtx.stroke();

            const drawCtx = drawCanvas.getContext('2d')!;
            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            const committedCanvas = committedRef.current;
            if (committedCanvas) {
              drawCtx.drawImage(committedCanvas, 0, 0);
            }
            drawCtx.save();
            drawCtx.globalAlpha = 0.5;
            drawCtx.drawImage(tempCanvas, 0, 0);
            drawCtx.restore();
          }
          lastPointRef.current = pos;
        } else {
          renderCanvas();
        }
      } else {
        currentPoints.current.push({ x: pos.x, y: pos.y });

        // 🚀 VẼ TĂNG TRƯỞNG (INCREMENTAL DRAWING - O(1) frame budget)
        const ctx = drawCanvas.getContext('2d');
        if (ctx && lastPointRef.current) {
          ctx.globalCompositeOperation = 'source-over';
          
          if (mode === 'restore') {
            const restoreType = useToolStore.getState().restoreType;
            const sourceCanvas = restoreType === 'clean' ? originalCleanRef.current : rawRef.current;
            if (sourceCanvas && sourceCanvas.width > 0) {
              drawRestoreSegment(ctx, sourceCanvas, lastPointRef.current, pos, currentBrushSize);
            }
          } 
          else if (mode === 'clone') {
            if (cloneCopyCanvasRef.current && cloneSource) {
              drawCloneSegment(ctx, cloneCopyCanvasRef.current, lastPointRef.current, pos, offsetRef.current, currentBrushSize);
            }
          } 
          else if (mode === 'speedline') {
            const color = useToolStore.getState().speedlineColor || '#000000';
            if (type === 'eraser') {
              const sourceCanvas = originalCleanRef.current;
              if (sourceCanvas && sourceCanvas.width > 0) {
                drawRestoreSegment(ctx, sourceCanvas, lastPointRef.current, pos, currentBrushSize);
              }
            } else {
              drawStrokeSegment(ctx, lastPointRef.current, pos, currentBrushSize, color);
            }
          }
        }
        lastPointRef.current = pos;
      }
    };

    const handlePointerUp = async (e: PointerEvent) => {
      setIsPanningState(false);
      if (!isDrawing.current) return;

      const mode = useToolStore.getState().activeMode;
      const currentBrushSize = useToolStore.getState().brushSize;
      const shouldDelayClear = mode === 'restore' || mode === 'clone' || mode === 'speedline';

      if (!shouldDelayClear) {
        isDrawing.current = false;
        useToolStore.getState().setIsDrawingState(false);
      } else {
        useToolStore.getState().setIsDrawingState(false);
      }
      drawCanvas.releasePointerCapture(e.pointerId);

      if (mode === 'erase' || mode === 'restore' || mode === 'redraw') {
        const committedCtx = committedRef.current?.getContext('2d');
        if (committedCtx) {
          if (mode === 'erase' || mode === 'redraw') {
            if (!tempBufferCanvasRef.current) {
              tempBufferCanvasRef.current = document.createElement('canvas');
            }
            const tempCanvas = tempBufferCanvasRef.current;
            const committedCanvas = committedRef.current;
            if (committedCanvas) {
              if (tempCanvas.width !== committedCanvas.width || tempCanvas.height !== committedCanvas.height) {
                tempCanvas.width = committedCanvas.width;
                tempCanvas.height = committedCanvas.height;
              }
              const tCtx = tempCanvas.getContext('2d')!;
              tCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
              tCtx.imageSmoothingEnabled = false;
              
              drawStroke(tCtx, currentPoints.current, currentBrushSize, "rgba(255, 0, 0, 1.0)");
              
              committedCtx.save();
              committedCtx.globalAlpha = 0.5;
              committedCtx.drawImage(tempCanvas, 0, 0);
              committedCtx.restore();
            }
            setTimeout(() => {
              useToolStore.getState().setActionPosition({ x: e.clientX, y: e.clientY });
            }, 50);
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
                tCtx.imageSmoothingEnabled = false;

                drawStroke(tCtx, currentPoints.current, currentBrushSize, "rgba(0,0,0,1)");
                tCtx.globalCompositeOperation = 'source-in';
                tCtx.drawImage(sourceCanvas, 0, 0);

                const targetCtx = targetCanvas.getContext('2d');
                if (targetCtx) {
                  targetCtx.save();
                  targetCtx.imageSmoothingEnabled = false;
                  targetCtx.drawImage(tempCanvas, 0, 0);
                  targetCtx.restore();
                }

                setTimeout(() => {
                  const newUrl = targetCanvas.toDataURL("image/png");
                  lastSavedDataUrlRef.current = newUrl;
                  useProjectStore.getState().setProcessedUrl(useProjectStore.getState().currentIndex, newUrl);
                  useMangaEditorStore.getState().saveHistory();
                  useMangaEditorStore.getState().setImageUrl(newUrl);
                  saveCleanImageToServerDebounced(newUrl);
                }, 50);
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
        setTimeout(() => {
          isDrawing.current = false;
          currentPoints.current = [];
          renderCanvas();
        }, 30);
      } else if (mode === 'clone') {
        const targetCanvas = cleanRef.current;
        const targetCtx = targetCanvas?.getContext('2d');
        if (targetCanvas && targetCtx && cloneCopyCanvasRef.current && currentPoints.current.length > 0) {
          targetCtx.save();
          const points = currentPoints.current;
          for (let i = 0; i < points.length; i++) {
            if (i > 0) {
              const p1 = points[i - 1];
              const p2 = points[i];
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const step = 2;
              if (dist > step) {
                const steps = Math.ceil(dist / step);
                for (let j = 0; j <= steps; j++) {
                  const t = j / steps;
                  const ix = p1.x + dx * t;
                  const iy = p1.y + dy * t;
                  drawClonePoint(targetCtx, cloneCopyCanvasRef.current, ix, iy, offsetRef.current, currentBrushSize);
                }
              } else {
                drawClonePoint(targetCtx, cloneCopyCanvasRef.current, p2.x, p2.y, offsetRef.current, currentBrushSize);
              }
            } else {
              drawClonePoint(targetCtx, cloneCopyCanvasRef.current, points[i].x, points[i].y, offsetRef.current, currentBrushSize);
            }
          }
          targetCtx.restore();

          setTimeout(() => {
            const newUrl = targetCanvas.toDataURL("image/png");
            lastSavedDataUrlRef.current = newUrl;
            useProjectStore.getState().setProcessedUrl(useProjectStore.getState().currentIndex, newUrl);
            useMangaEditorStore.getState().saveHistory();
            useMangaEditorStore.getState().setImageUrl(newUrl);
            saveCleanImageToServerDebounced(newUrl);
          }, 50);
        }
        cloneCopyCanvasRef.current = null;
        isOffsetSetRef.current = false;
        setTimeout(() => {
          isDrawing.current = false;
          currentPoints.current = [];
          renderCanvas();
        }, 30);
      } else if (mode === 'speedline') {
        const targetCanvas = cleanRef.current;
        const targetCtx = targetCanvas?.getContext('2d');
        if (targetCanvas && targetCtx && currentPoints.current.length > 0) {
          const color = useToolStore.getState().speedlineColor || '#000000';
          const size = useToolStore.getState().brushSize || 35;
          const type = useToolStore.getState().speedlineType;
          
          if (type === 'line') {
            const startPt = currentPoints.current[0];
            const pos = getPointerPos(e);
            targetCtx.save();
            targetCtx.beginPath();
            targetCtx.lineCap = 'round';
            targetCtx.lineJoin = 'round';
            targetCtx.lineWidth = size;
            targetCtx.strokeStyle = color;
            targetCtx.moveTo(startPt.x, startPt.y);
            targetCtx.lineTo(pos.x, pos.y);
            targetCtx.stroke();
            targetCtx.restore();
          } else if (type === 'eraser') {
            const sourceCanvas = originalCleanRef.current;
            if (sourceCanvas && sourceCanvas.width > 0) {
              try {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = targetCanvas.width;
                tempCanvas.height = targetCanvas.height;
                const tCtx = tempCanvas.getContext('2d')!;
                tCtx.imageSmoothingEnabled = false;

                drawStroke(tCtx, currentPoints.current, size, "rgba(0,0,0,1)");
                tCtx.globalCompositeOperation = 'source-in';
                tCtx.drawImage(sourceCanvas, 0, 0);

                targetCtx.save();
                targetCtx.imageSmoothingEnabled = false;
                targetCtx.drawImage(tempCanvas, 0, 0);
                targetCtx.restore();
              } catch (err) {
                console.error("Eraser Crash:", err);
              }
            }
          } else {
            drawStroke(targetCtx, currentPoints.current, size, color);
          }
          setTimeout(() => {
            const newUrl = targetCanvas.toDataURL("image/png");
            lastSavedDataUrlRef.current = newUrl;
            useProjectStore.getState().setProcessedUrl(useProjectStore.getState().currentIndex, newUrl);
            useMangaEditorStore.getState().saveHistory();
            useMangaEditorStore.getState().setImageUrl(newUrl);
            saveCleanImageToServerDebounced(newUrl);
          }, 50);
        }
        setTimeout(() => {
          isDrawing.current = false;
          currentPoints.current = [];
          renderCanvas();
        }, 30);
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
            glossary: config.glossary,
            target_language: config.targetLanguage || "Tiếng Việt",
            source_language: config.sourceLanguage || "ja"
          });

          if (result.status === "success") {
            useToolStore.getState().setScanModal({
              isOpen: true, jap: result.japanese, vie: result.vietnamese,
              coords: { x1: scanStart.current.x, y1: scanStart.current.y, x2: pos.x, y2: pos.y }
            });

            const posthog = (window as any).posthog;
            if (posthog) {
              posthog.capture('translation_successful', {
                action_type: 'Quick_Scan',
                status: 'success'
              });
            }

            // Cập nhật số dư và lượt free còn lại trực tiếp trên frontend để giảm tải cho server
            const authStore = useAuthStore.getState();
            if (authStore.user) {
              const newCredits = result.charged_xu > 0 ? Math.max(0, (authStore.user.credits || 0) - result.charged_xu) : (authStore.user.credits || 0);
              const newFreeLens = result.lens_free_remaining !== undefined ? result.lens_free_remaining : authStore.user.lensFreeRemaining;
              useAuthStore.setState({
                user: {
                  ...authStore.user,
                  credits: newCredits,
                  lensFreeRemaining: newFreeLens
                }
              });
            }

            // Thông báo quota
            if (result.charged_xu > 0) {
              toast(`⚡ Đã trừ 1 xu (Lens dịch lần ${result.lens_used} hôm nay)`, {
                icon: '💸', duration: 2500,
                style: { background: '#1a1a2e', color: '#fbbf24', fontSize: '12px' }
              });
            } else if (result.lens_free_remaining <= 5 && result.lens_free_remaining > 0) {
              toast(`🔔 Còn ${result.lens_free_remaining} lần Lens Dịch miễn phí hôm nay`, {
                duration: 2500,
                style: { background: '#1a1a2e', color: '#a78bfa', fontSize: '12px' }
              });
            }
          }
        } catch (error: any) {
          const msg = error?.message || '';
          if (msg.includes('Không đủ Xu')) {
            toast.error('Không đủ xu để dùng Lens Dịch. Vui lòng nạp thêm!');
          } else {
            toast.error('Lỗi Lens Dịch! Vui lòng thử lại.');
          }
          useToolStore.getState().setScanModal(null);
        }
      }
    };

    drawCanvas.addEventListener('pointerdown', handlePointerDown);
    drawCanvas.addEventListener('pointermove', handlePointerMove);
    drawCanvas.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleWinKeyDown);
    window.addEventListener('keyup', handleWinKeyUp);

    return () => {
      drawCanvas.removeEventListener('pointerdown', handlePointerDown);
      drawCanvas.removeEventListener('pointermove', handlePointerMove);
      drawCanvas.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleWinKeyDown);
      window.removeEventListener('keyup', handleWinKeyUp);
    };
  }, []);

  const cursorStyle = isSpacePressedState
    ? (isPanningState ? 'grabbing' : 'grab')
    : activeMode === 'erase' || activeMode === 'restore' || activeMode === 'redraw' || activeMode === 'clone' || activeMode === 'speedline'
      ? 'none'
      : activeMode === 'scan' ? 'crosshair' : 'default';

  return (
    <>
      <canvas ref={rawRef} className="hidden ph-no-capture" />
      <canvas ref={cleanRef} className="hidden ph-no-capture" />
      <canvas ref={committedRef} className="hidden ph-no-capture" />
      {/* 🚀 Thêm Két sắt vào HTML để vẽ ẩn */}
      <canvas ref={originalCleanRef} className="hidden ph-no-capture" />
      <canvas
        ref={drawRef}
        id="draw-layer"
        className="absolute top-0 left-0 z-30 w-full h-full touch-none ph-no-capture"
        style={{ cursor: cursorStyle, pointerEvents: activeMode !== 'none' ? 'auto' : 'none' }}
        onPointerLeave={() => {
          if (cursorRef.current) cursorRef.current.style.display = 'none';
          if (cloneDestCursorRef.current) cloneDestCursorRef.current.style.display = 'none';
          isDrawing.current = false;
          useToolStore.getState().setIsDrawingState(false);
        }}
      />

      {/* 🚀 Tâm ngắm chỉ vị trí nguồn di chuyển song song theo chuột khi vẽ Clone Stamp giống Photoshop */}
      <div
        ref={cloneDestCursorRef}
        className="pointer-events-none absolute transform -translate-x-1/2 -translate-y-1/2 z-40 flex items-center justify-center"
        style={{
          display: 'none',
          width: '16px',
          height: '16px',
        }}
      >
        <span className="text-[14px] text-cyan-400 font-bold select-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">+</span>
      </div>

      {/* 🚀 Vòng tròn hiển thị kích cỡ cọ vẽ thực tế di chuyển theo chuột */}
      <div
        ref={cursorRef}
        className="pointer-events-none absolute rounded-full transform -translate-x-1/2 -translate-y-1/2 z-50"
        style={{
          display: 'none',
          width: `${brushSize}px`,
          height: `${brushSize}px`,
          border: `${1 / currentZoom}px solid black`,
          boxShadow: `0 0 0 ${1 / currentZoom}px white`,
        }}
      />
    </>
  );
}