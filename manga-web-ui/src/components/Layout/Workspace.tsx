
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
import FloatingTextToolbar from '../Editor/FloatingTextToolbar';
import { useConfigStore } from '../../store/useConfigStore';

export default function Workspace() {
  const { currentIndex, processedUrls, fileQueue } = useProjectStore();
  const projectStore = useProjectStore();
  const canvasStore = useCanvasStore();

  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  

  // =========================================================
  // 🚀 2. TỰ ĐỘNG KÉO CHỮ TỪ SERVER VỀ MỖI KHI LẬT TRANG / F5
  // =========================================================
  useEffect(() => {
    const pageId = projectStore.pageIds[projectStore.currentIndex];
    if (pageId) {
      mangaApi.getPageBubbles(pageId)
        .then(data => {
          // Đổ dữ liệu chữ cũ từ DB vào Canvas gõ chữ
          canvasStore.setBubbles(data.bubbles || []);
        })
        .catch(err => console.error("Lỗi đồng bộ chữ từ Server:", err));
    } else {
      // Nếu chưa chọn trang nào thì xóa sạch canvas
      canvasStore.clearBubbles();
    }
  }, [projectStore.currentIndex, projectStore.pageIds]);

  const { currentZoom, activeMode, setActiveMode, brushSize, setBrushSize, setZoom, isComparing, setIsComparing, fontSize, fontColor, fontFamily, restoreType, toggleRestoreType, actionPosition, setActionPosition } = useToolStore();

  const [rawUrl, setRawUrl] = useState<string | null>(null);

  const panRef = useRef({ x: 0, y: 0 });
  const workspaceContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPanning = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });
  const startMouse = useRef({ x: 0, y: 0 });
  const isSpaceDown = useRef(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [redrawPrompt, setRedrawPrompt] = useState("");

  const dynamicLoadingText = useDynamicLoadingText(isProcessing);

  const zoomRef = useRef(currentZoom);
  const activeModeRef = useRef(activeMode);

  useEffect(() => { zoomRef.current = currentZoom; }, [currentZoom]);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);

  // =========================================================
  // 🚀 4. ĐỌC FILE TỪ HÀNG ĐỢI (Đã vá lỗi hiển thị lại ảnh Clean khi F5)
  // =========================================================
  useEffect(() => {
    const file = fileQueue[currentIndex];
    if (file) {
      // 🥇 ƯU TIÊN 1: Nếu trang này đã có ảnh tẩy nền (Clean) từ Server thì hiện luôn!
      if (projectStore.processedUrls[currentIndex]) {
        setRawUrl(projectStore.processedUrls[currentIndex]);
      } 
      // 🥈 ƯU TIÊN 2: Nếu chưa có ảnh tẩy nền VÀ là File ảo do ấn F5 -> Hiện ảnh gốc (Raw)
      else if (file.size === 0) {
        const pageId = projectStore.pageIds[currentIndex];
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
        
        // 🚀 BẢN VÁ 3: Chống cache cho cả ảnh gốc
        setRawUrl(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/workspace/${projectStore.projectId}/raw/${pageId}.${ext}?t=${Date.now()}`);
      }
      // 🥉 ƯU TIÊN 3: Nếu là file ảnh mới tinh người dùng vừa kéo thả vào web
      else {
        const url = URL.createObjectURL(file);
        setRawUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    } else {
      setRawUrl(null);
    }
  }, [currentIndex, fileQueue, projectStore.processedUrls, projectStore.pageIds, projectStore.projectId]);

  const displayUrl = processedUrls[currentIndex] || rawUrl;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.toolbar-container') || target.tagName === 'SELECT' || target.tagName === 'INPUT') return;
      e.preventDefault();

      // 🚀 GIẢI QUYẾT LỖI 1: Tự động ẩn hộp lệnh khi người dùng lăn chuột (Zoom/Pan)
      useToolStore.getState().setActionPosition(null);

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.002;
        const currentZ = zoomRef.current;
        const newZoom = Math.max(0.1, Math.min(currentZ * (1 + delta), 5.0));

        const rect = container.getBoundingClientRect();

        panRef.current.x = (e.clientX - rect.left) - ((e.clientX - rect.left) - panRef.current.x) * (newZoom / currentZ);
        panRef.current.y = (e.clientY - rect.top) - ((e.clientY - rect.top) - panRef.current.y) * (newZoom / currentZ);

        if (workspaceContainerRef.current) {
          workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${newZoom})`;
        }
        setZoom(newZoom);
      } else {
        panRef.current.x -= e.deltaX;
        panRef.current.y -= e.deltaY;

        if (workspaceContainerRef.current) {
          workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // 1. Chặn kéo nền nếu click vào Thanh công cụ UI HOẶC BONG BÓNG CHỮ
      if (
        target.closest('.toolbar-container') || 
        target.closest('.react-draggable') ||         // 🚀 BẢN VÁ 1: Nhận diện khi click vào lòng ô chữ
        target.closest('.react-resizable-handle') ||  // 🚀 BẢN VÁ 2: Nhận diện khi bấm vào các chấm tròn kéo to/nhỏ
        target.tagName === 'BUTTON' || 
        target.tagName === 'INPUT' || 
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA'
      ) return;

      // 2. CẢM BIẾN THÔNG MINH (Giữ nguyên đoạn này)
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
      if (workspaceContainerRef.current) {
        workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
      }
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

    if (workspaceContainerRef.current) {
      workspaceContainerRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${finalScale})`;
    }
    setZoom(finalScale);
  };

  useGlobalShortcuts();

  useGlobalErrorHandler();
  // 🚀 TÍNH NĂNG MỚI: PHỦ MÀU BẰNG CANVAS TRÌNH DUYỆT (Tốc độ 0 giây, không gọi Server)
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
      // 1. Tạo một Canvas ẩn để trộn ảnh
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = drawCanvas.width;
      tempCanvas.height = drawCanvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      // 2. Vẽ bức ảnh hiện tại lên
      tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);

      // 3. Đọc dữ liệu điểm ảnh (Pixel Data)
      const maskData = maskCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const targetRGB = color === 'white' ? 255 : 0; // Trắng = 255, Đen = 0

      // 4. Nếu điểm nào người dùng bôi đỏ -> Quét đè màu trắng/đen lên điểm đó
      for (let i = 0; i < maskData.data.length; i += 4) {
        if (maskData.data[i + 3] > 0) {
          imgData.data[i] = targetRGB;     // Red
          imgData.data[i + 1] = targetRGB; // Green
          imgData.data[i + 2] = targetRGB; // Blue
        }
      }

      // 5. Áp dụng kết quả và lưu thẳng vào state của trình duyệt!
      tempCtx.putImageData(imgData, 0, 0);
      projectStore.setProcessedUrl(currentIndex, tempCanvas.toDataURL("image/png"));

      // 6. Dọn dẹp giao diện
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
      // 🚀 BẢN VÁ: Truyền projectStore.pageIds[currentIndex] vào cuối!
      const newUrl = await mangaApi.eraseMask(
        targetUrl, 
        drawCanvas.toDataURL("image/png"), 
        projectStore.pageIds[currentIndex]
      );
      
      projectStore.setProcessedUrl(currentIndex, newUrl);
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      toast.success("Đã xóa nền!");
      setActiveMode("none");
    } catch (e: any) { toast.error(e.message); } finally { setIsProcessing(false); }
  };

  // 🚀 TỰ ĐỘNG TẢI FONT TỪ SERVER XUỐNG TRÌNH DUYỆT
  useEffect(() => {
    const loadCustomFonts = async () => {
      try {
        const data = await mangaApi.getFonts();
        data.fonts.forEach((fontName: string) => {
          // Lấy tên font làm Family Name (VD: "AnimeAce.ttf" -> "AnimeAce")
          const familyName = fontName.replace(/\.[^/.]+$/, ""); 
          
          // Tạo đường dẫn móc thẳng vào thư mục workspace/fonts của Backend
          const fontUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/workspace/fonts/${fontName}`;
          
          // Bơm thẳng Font vào DOM (Bộ nhớ của Trình duyệt)
          const newFont = new FontFace(familyName, `url(${fontUrl})`);
          newFont.load().then((loadedFace) => {
            document.fonts.add(loadedFace);
            console.log(`✨ Đã load thành công Font: ${familyName}`);
          }).catch(err => console.error("Lỗi load font:", err));
        });
      } catch (e) {
        console.log("Chưa có font custom nào trên Server.");
      }
    };
    loadCustomFonts();
  }, []);

  // 🚀 GIẢI QUYẾT LỖI 2: Tính toán Opacity của lớp ảnh Clean để hỗ trợ "Phục hồi" chuẩn xác
  // Nếu đang xem bản gốc -> opacity = 0 (Tàng hình hoàn toàn)
  // Nếu đang dùng cọ Phục hồi (restore) -> opacity = 0.5 (Mờ mờ giấy can)
  // Bình thường -> opacity = 1 (Rõ nét hoàn toàn)

  
  const cleanImageOpacity = isComparing ? 'opacity-0' : (activeMode === 'restore' ? 'opacity-50' : 'opacity-100');


  // =========================================================
  // 🚀 5. ĐIỆP VIÊN AUTO-SAVE: CHỐNG LƯU ĐÈ VÀ KHÔNG CHẠY KHI MỚI F5
  // =========================================================
  const currentBubbles = useCanvasStore(state => state.bubbles);
  const bubblesRef = useRef(currentBubbles);
  const isFirstLoad = useRef(true); // 🚀 CHỐT BẢO VỆ 1: Đánh dấu lượt nạp chữ đầu tiên

  // Reset cờ hiệu mỗi khi lật sang trang khác để cho phép lưu bình thường
  useEffect(() => {
    isFirstLoad.current = true;
  }, [currentIndex]);

  useEffect(() => {
    // Nếu mảng chữ hoàn toàn không đổi -> Bỏ qua
    if (currentBubbles === bubblesRef.current) return;
    bubblesRef.current = currentBubbles;

    // 🚀 CHỐT BẢO VỆ 2: Nếu là lượt nạp chữ từ Server về khi mới F5 hoặc mới chuyển trang, 
    // tuyệt đối KHÔNG ĐƯỢC gọi API lưu đè lên dữ liệu cũ!
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }

    const pageId = projectStore.pageIds[currentIndex];
    if (!pageId) return;

    const timeoutId = setTimeout(() => {
      mangaApi.savePageBubbles(pageId, useCanvasStore.getState().bubbles)
        .then(() => console.log("💾 Đã Auto-Save chữ thành công!"))
        .catch(err => console.error("Lỗi Auto-Save:", err));
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [currentBubbles, currentIndex]);
  return (
    <div ref={containerRef} className="flex-1 bg-background overflow-hidden relative" style={{ cursor: activeMode === 'none' ? 'grab' : 'default' }}>

      {displayUrl ? (
        <>
          {/* 🚀 3. SỬA LẠI CÁI DIV NÀY: Khóa width và height chuẩn 1:1 theo ảnh gốc */}
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

            {/* Lớp RAW (Gốc) - Nằm dưới cùng */}
            <img src={rawUrl || undefined} crossOrigin="anonymous" alt="Manga Raw" className="block m-0 p-0 pointer-events-none select-none" style={{ width: imgSize.w > 0 ? `${imgSize.w}px` : undefined, height: imgSize.h > 0 ? `${imgSize.h}px` : undefined }} onLoad={handleImageLoad} />

            {/* Lớp CLEAN (Đã xóa) - Nằm giữa - Áp dụng hiệu ứng mờ Onion Skin */}
            <img
              src={displayUrl || undefined}  
              crossOrigin="anonymous"
              alt="Manga Clean"
              className={`absolute top-0 left-0 block m-0 p-0 pointer-events-none select-none transition-opacity duration-300 ${cleanImageOpacity}`}
              style={{ width: imgSize.w > 0 ? `${imgSize.w}px` : '100%', height: imgSize.h > 0 ? `${imgSize.h}px` : '100%' }}
            />

            {/* Lớp DRAW (Cọ) và CHỮ - Nằm trên cùng */}
            {/* Lớp DRAW (Cọ) và CHỮ - Nằm trên cùng */}
            <div className={`absolute inset-0 w-full h-full ${isComparing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <MangaCanvas rawUrl={rawUrl} displayUrl={displayUrl} />

              {/* 🚀 LỚP DEBUG: ÉP HIỂN THỊ KHUNG XANH LÁ CÂY ĐỘC LẬP */}
              {currentBubbles.map((b) => (
                (b.boxX !== undefined) && (
                  <div
                    key={`debug-box-${b.id}`}
                    style={{
                      position: 'absolute',
                      left: `${b.boxX}px`,
                      top: `${b.boxY}px`,
                      width: `${b.boxW}px`,
                      height: `${b.boxH}px`,
                      border: '4px solid #00ff00', // Đóng khung xanh lá cây thật đậm
                      backgroundColor: 'rgba(0, 255, 0, 0.3)',
                      pointerEvents: 'none', // Không cản trở click
                      zIndex: 99999, // 🚀 Cao nhất hệ mặt trời, đè lên mọi thứ
                    }}
                  />
                )
              ))}

              <MangaTextEngine imgWidth={imgSize.w} imgHeight={imgSize.h} /> 
              <FloatingTextToolbar /> 
            </div>
          </div>

          <FloatingCanvasToolbar />

          {!useToolStore.getState().showLeftPanel && (
            <button onClick={() => useToolStore.getState().toggleLeftPanel()} className="absolute left-0 top-1/2 -translate-y-1/2 z-50 p-1.5 bg-panel border-y border-r border-border rounded-r-xl shadow-[5px_0_15px_rgba(0,0,0,0.5)] text-text-muted hover:text-text-main hover:bg-border cursor-pointer transition-all hover:pr-3">
              <ChevronRight size={24} />
            </button>
          )}


          {/* Nút Action của cọ Tẩy */}
          {/* 🚀 ĐÃ SỬA: Hộp Action Nổi của cọ Tẩy với 3 lựa chọn */}
          {/* 🚀 ĐÃ SỬA: Hộp Action Nổi biến thành "Thanh Ngữ Cảnh Bám Đáy" (Contextual Bottom Bar) */}
          {actionPosition && activeMode === 'erase' && (
            <div
              // Vứt bỏ style left/top đi, thay bằng absolute bám đáy giữa màn hình (bottom-32 left-1/2 -translate-x-1/2)
              className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300 flex items-center gap-1.5 p-1.5 bg-panel/95 backdrop-blur-xl border border-border shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-2xl pointer-events-auto"
            >
              {/* Nút 1: Phủ Trắng */}
              <button
                onClick={() => handleFillColor('white')}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-white text-black hover:bg-gray-200 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
                title="Phủ trắng siêu tốc (Cho bong bóng thoại trắng)"
              >
                ⬜ Trắng (Nhanh)
              </button>

              {/* Nút 2: Phủ Đen */}
              <button
                onClick={() => handleFillColor('black')}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-[#1a1a1a] text-white hover:bg-black disabled:opacity-50 transition-colors cursor-pointer border border-white/10 shadow-sm"
                title="Phủ đen siêu tốc"
              >
                ⬛ Đen (Nhanh)
              </button>

              <div className="w-px h-8 bg-border mx-1"></div>

              {/* Nút 3: AI Xóa nền */}
              <button
                onClick={handleErase}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white disabled:opacity-50 transition-all cursor-pointer group shadow-sm"
                title="Dùng AI để vẽ bù nét đằng sau chữ (Xuyên thấu)"
              >
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