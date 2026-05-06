import { useState } from 'react';
import { toJpeg } from 'html-to-image';
import { Undo2, Redo2, PanelLeft, PanelRight } from 'lucide-react';
import { Settings, Image as ImageIcon, Download, Trash2, ZoomIn, ZoomOut, Maximize, Eye, EyeOff,
  Brush, Type, Wand2, Save, FolderOpen,
   Search, Eraser, Paintbrush,
  Sparkles } from 'lucide-react';
import { useToolStore } from '../../store/useToolStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useConfigStore } from '../../store/useConfigStore';
import { mangaApi } from '../../services/api';
import html2canvas from 'html2canvas';

export default function Topbar() {
  // 1. GỌI HOOKS ĐỂ KHỞI TẠO CÁC STORE TRƯỚC
  const toolStore = useToolStore();
  const projectStore = useProjectStore();
  const canvasStore = useCanvasStore();
  const configStore = useConfigStore();

  // 2. SAU ĐÓ MỚI LẤY DỮ LIỆU TỪ STORE RA (DESTRUCTURING)
  const { currentZoom, brushSize, setBrushSize, showLeftPanel, showRightPanel, toggleLeftPanel, toggleRightPanel } = toolStore;
  const { undo, redo } = useCanvasStore.temporal.getState();
  
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name));
      projectStore.setFiles(files);
      projectStore.setCurrentIndex(0);
      files.forEach(file => mangaApi.uploadRaw(file));
    }
  };

  const handleTranslate = async () => {
    const file = projectStore.fileQueue[projectStore.currentIndex];
    if (!file) return alert("Vui lòng chọn trang!");
    
    setIsProcessing(true);
    // 🚀 Bổ sung dòng này để nháy đèn huy hiệu "Đang dịch"
    projectStore.setPageStatus(projectStore.currentIndex, 'processing'); 

    try {
      const result = await mangaApi.translatePage(file, configStore);
      projectStore.setProcessedUrl(projectStore.currentIndex, result.cleanUrl);
      canvasStore.clearBubbles();
      result.bubbles.forEach((item: any) => {
        canvasStore.addBubble({
          x: item.box_coordinates.x1, y: item.box_coordinates.y1,
          w: item.box_coordinates.x2 - item.box_coordinates.x1, h: item.box_coordinates.y2 - item.box_coordinates.y1,
          text: item.vietnamese, fontSize: toolStore.fontSize,
          fontColor: toolStore.fontColor, fontFamily: toolStore.fontFamily, rotation: 0, sfxClass: ''
        });
      });
    } catch (error: any) {
      alert(`Lỗi: ${error.message || "Không thể kết nối"}. Xem tab Console!`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleErase = async () => {
    const drawCanvas = document.getElementById('draw-layer') as HTMLCanvasElement;
    if (!drawCanvas) return;
    
    const ctx = drawCanvas.getContext('2d');
    const imgData = ctx?.getImageData(0,0, drawCanvas.width, drawCanvas.height);
    const hasDrawn = imgData?.data.some((p, i) => i % 4 === 3 && p > 0);
    if (!hasDrawn) return alert("Bạn chưa khoanh vùng màu đỏ để xóa!");

    setIsProcessing(true);
    try {
      const maskBase64 = drawCanvas.toDataURL("image/png");
      const currentUrl = projectStore.processedUrls[projectStore.currentIndex];
      const filename = currentUrl 
        ? currentUrl.split('/').pop()?.split('?')[0] 
        : "Clean_" + projectStore.fileQueue[projectStore.currentIndex].name;

      if (!filename) throw new Error("Không tìm thấy tên file");

      const newCleanUrl = await mangaApi.eraseMask(filename, maskBase64);
      projectStore.setProcessedUrl(projectStore.currentIndex, newCleanUrl);
      
      ctx?.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      toolStore.setActiveMode('none');
    } catch (error: any) {
      alert(`Lỗi Xóa nền: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const customFontFamilyName = "CustomFont_" + Date.now();
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fontFace = new FontFace(customFontFamilyName, arrayBuffer);
      const loadedFont = await fontFace.load();
      document.fonts.add(loadedFont);

      const fontName = file.name.split('.')[0];
      const fontCssValue = `'${customFontFamilyName}', sans-serif`;

      toolStore.addCustomFont({ name: fontName, value: fontCssValue });
      handleFontFamily(fontCssValue);
    } catch (err) {
      alert("Lỗi tải font!");
    }
    e.target.value = ''; 
  };

  const handleFontSize = (delta: number) => {
    const newSize = Math.max(8, Math.min(toolStore.fontSize + delta, 150));
    toolStore.setFontSize(newSize);
    if (canvasStore.activeBubbleId) canvasStore.updateBubble(canvasStore.activeBubbleId, { fontSize: newSize });
  };

  const handleFontFamily = (font: string) => {
    toolStore.setFontFamily(font);
    if (canvasStore.activeBubbleId) canvasStore.updateBubble(canvasStore.activeBubbleId, { fontFamily: font });
  };

  const handleFontColor = (color: string) => {
    toolStore.setFontColor(color);
    if (canvasStore.activeBubbleId) canvasStore.updateBubble(canvasStore.activeBubbleId, { fontColor: color });
  };

  const applySFX = (sfxClass: string) => {
    if (!canvasStore.activeBubbleId) return alert("Hãy chọn một ô chữ trước!");
    canvasStore.updateBubble(canvasStore.activeBubbleId, { sfxClass, fontColor: sfxClass ? '#ffffff' : '#000000' });
  };

  const handleExport = async () => {
    // Chỉ lấy đúng cái div chứa ảnh gốc và text, bỏ qua các viền UI xung quanh
    const el = document.getElementById('workspace-container');
    const file = projectStore.fileQueue[projectStore.currentIndex];
    
    if (!el || !file) return alert("Chưa có ảnh để xuất!");
    
    // Tạm thời bỏ chọn chữ để viền (border) của ô chữ biến mất trước khi chụp ảnh
    const activeId = canvasStore.activeBubbleId;
    if (activeId) canvasStore.setActiveBubble(null);

    // Lưu lại trạng thái Zoom hiện tại
    const originalTransform = el.style.transform;
    const originalOrigin = el.style.transformOrigin;
    
    // Trả Zoom về 100% để ảnh xuất ra đạt chất lượng cao nhất, không bị mờ
    el.style.transform = 'scale(1)';
    el.style.transformOrigin = 'top left';

    try {
      setIsProcessing(true); // Tận dụng state loading để UI hiện "Đang xuất..."
      
      // Chụp ảnh bằng html-to-image (Chất lượng 95% để tối ưu dung lượng)
      const dataUrl = await toJpeg(el, { 
        quality: 0.95,
        backgroundColor: '#ffffff', // Đảm bảo nền trắng
        pixelRatio: 2 // Render nét gấp đôi chống vỡ font chữ
      });
      
      // Tạo link ảo để tải file về máy
      const link = document.createElement('a');
      link.download = `[MangaAI]_${file.name.replace(/\.[^/.]+$/, "")}.jpg`;
      link.href = dataUrl;
      link.click();
      
    } catch (error) {
      console.error("Lỗi xuất ảnh:", error);
      alert("Lỗi xuất ảnh! Vui lòng thử lại.");
    } finally {
      // Phục hồi lại trạng thái Zoom và chọn chữ như cũ cho người dùng
      el.style.transform = originalTransform;
      el.style.transformOrigin = originalOrigin;
      if (activeId) canvasStore.setActiveBubble(activeId);
      setIsProcessing(false);
    }
  };
  // 🚀 HÀM LƯU FILE .MANGA (Tương tự lưu file PSD)
  const handleSaveManga = () => {
    const bubbles = canvasStore.bubbles;
    if (bubbles.length === 0) return alert("Không có chữ nào để lưu!");
    
    // Đóng gói dữ liệu thành JSON
    const data = { 
      app: "MangaAI_Editor", 
      version: "1.0", 
      bubbles: bubbles 
    };
    
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Lấy tên file gốc để đặt tên cho file .manga
    const currentFile = projectStore.fileQueue[projectStore.currentIndex];
    const filename = currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") : "Project";
    
    link.download = `${filename}.manga`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 🚀 HÀM MỞ FILE .MANGA
  const handleLoadManga = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.app === "MangaAI_Editor" && Array.isArray(data.bubbles)) {
          canvasStore.setBubbles(data.bubbles);
        } else {
          alert("File không đúng định dạng .manga của hệ thống!");
        }
      } catch (error) {
        alert("Lỗi đọc file! File có thể bị hỏng.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input để có thể mở lại cùng 1 file
  };


      return (
    // 🚀 Bỏ flex-wrap, thêm overflow-x-auto và ẩn thanh cuộn để đảm bảo LUÔN LÀ 1 DÒNG
    <div className="bg-panel px-3 py-2 flex items-center gap-3 border-b border-border shrink-0 z-10 text-sm overflow-x-auto [&::-webkit-scrollbar]:hidden">
      
      {/* KHỐI 1: Logo & AI */}
      <div className="flex items-center gap-2 border-r border-border pr-3 shrink-0">
        
        {/* 🚀 Nút Ẩn/Hiện Cột Trái */}
        <button onClick={toggleLeftPanel} className={`p-1.5 rounded-md transition-colors ${!showLeftPanel ? 'text-text-muted hover:bg-border' : 'bg-primary/20 text-primary'}`} title="Ẩn/Hiện Sidebar (Quản lý Dự án)">
          <PanelLeft size={16} />
        </button>

        <div className="flex items-center gap-2 mr-1 select-none">
          <div className="bg-primary/20 p-1.5 rounded-lg border border-primary/30"><Wand2 size={16} className="text-primary" /></div>
          <span className="font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-text-muted hidden sm:block">MangaAI</span>
        </div>
        
        <button onClick={handleTranslate} disabled={isProcessing} className="btn-primary py-1.5 px-3">
          <Wand2 size={16} /> {isProcessing ? 'Đang dịch...' : 'Dịch Trang'}
        </button>
        <button onClick={() => configStore.setModalOpen(true)} className="btn-ghost p-1.5" title="Cài đặt Ngữ cảnh"><Settings size={16} /></button>
      </div>

      {/* KHỐI 2: Text Tools (Chỉ dùng Icon) */}
      <div className="flex items-center gap-1 border-r border-border pr-3 shrink-0">
        <button onClick={() => canvasStore.addBubble({ x: 50, y: 50, w: 150, h: 60, text: "Nhập chữ...", fontSize: toolStore.fontSize, fontColor: toolStore.fontColor, fontFamily: toolStore.fontFamily, rotation: 0, sfxClass: '' })} className="btn-ghost p-1.5" title="Thêm ô chữ mới">
          <Type size={16} />
        </button>
        <label className="btn-ghost p-1.5 cursor-pointer text-xs font-bold" title="Tải font chữ từ máy (.ttf / .otf)">
          F+
          <input type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={handleFontUpload} />
        </label>
      </div>

      {/* KHỐI 3: Canvas Tools (Chỉ dùng Icon) */}
      <div className="flex items-center gap-1 border-r border-border pr-3 shrink-0">
        <button onClick={() => toolStore.setActiveMode('scan')} className={`btn-base p-1.5 ${toolStore.activeMode === 'scan' ? 'bg-primary/20 text-primary border-primary/50' : 'btn-ghost'}`} title="Quét Lens dịch nhanh (Phím S)"><Search size={16} /></button>
        <button onClick={() => toolStore.setActiveMode('erase')} className={`btn-base p-1.5 ${toolStore.activeMode === 'erase' ? 'bg-danger/20 text-danger border-danger/50' : 'btn-ghost'}`} title="Cọ Xóa nền (Phím E)"><Eraser size={16} /></button>
        <button onClick={() => toolStore.setActiveMode('restore')} className={`btn-base p-1.5 ${toolStore.activeMode === 'restore' ? 'bg-accent/20 text-accent border-accent/50' : 'btn-ghost'}`} title="Cọ Phục hồi nét (Phím B)"><Paintbrush size={16} /></button>
        <button onClick={() => toolStore.setActiveMode('redraw')} className={`btn-base p-1.5 ${toolStore.activeMode === 'redraw' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'btn-ghost'}`} title="Tái vẽ bằng AI Diffusion"><Sparkles size={16} /></button>

        {/* Thanh chỉnh cỡ cọ (Sẽ tự trượt ra mượt mà khi bấm vào các công cụ trên) */}
        {(toolStore.activeMode === 'erase' || toolStore.activeMode === 'restore' || toolStore.activeMode === 'redraw') && (
          <div className="flex items-center bg-background rounded-md border border-border ml-1 h-[30px] px-2 gap-2 animate-in fade-in slide-in-from-left-2">
            <input type="range" min="5" max="100" value={toolStore.brushSize} onChange={(e) => toolStore.setBrushSize(Number(e.target.value))} className="w-16 accent-primary" title="Cỡ cọ" />
            {toolStore.activeMode === 'erase' && (<button onClick={handleErase} disabled={isProcessing} className="bg-danger text-white px-2 py-0.5 rounded text-[10px] font-bold hover:bg-red-600 transition-colors">{isProcessing ? '⏳' : 'Xóa'}</button>)}
            {toolStore.activeMode === 'restore' && (<button onClick={toolStore.toggleRestoreType} className="bg-accent text-white px-2 py-0.5 rounded text-[10px] font-bold hover:bg-purple-600 transition-colors">{toolStore.restoreType === 'raw' ? 'RAW' : 'SẠCH'}</button>)}
            {toolStore.activeMode === 'redraw' && (<button className="bg-emerald-500 text-white px-2 py-0.5 rounded text-[10px] font-bold hover:bg-emerald-600 transition-colors">Vẽ</button>)}
          </div>
        )}
      </div>

      {/* KHỐI 4: View, Lịch sử & Export */}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        {/* Lịch sử Undo/Redo */}
        <button onClick={() => undo()} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md transition-colors" title="Hoàn tác (Ctrl+Z)"><Undo2 size={16}/></button>
        <button onClick={() => redo()} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md transition-colors" title="Làm lại (Ctrl+Y)"><Redo2 size={16}/></button>
        
        <div className="w-px h-4 bg-border mx-1"></div>

        {/* Zoom */}
        <button onClick={() => toolStore.setZoom(toolStore.currentZoom - 0.1)} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md transition-colors" title="Thu nhỏ"><ZoomOut size={16}/></button>
        <span className="w-10 text-center font-medium text-[11px] text-text-muted">{Math.round(toolStore.currentZoom * 100)}%</span>
        <button onClick={() => toolStore.setZoom(toolStore.currentZoom + 0.1)} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md transition-colors" title="Phóng to"><ZoomIn size={16}/></button>
        <button onClick={() => toolStore.setShowText(!toolStore.showText)} className={`p-1.5 rounded-md transition-colors ml-1 ${!toolStore.showText ? 'text-text-muted hover:bg-border' : 'bg-primary/20 text-primary'}`} title="Ẩn/Hiện Chữ">{toolStore.showText ? <Eye size={16}/> : <EyeOff size={16}/>}</button>
        
        <div className="w-px h-4 bg-border mx-1"></div>

        {/* Mở / Lưu / Xuất */}
        {/* Mở / Lưu / Xuất */}
        <label className="btn-ghost p-1.5 cursor-pointer" title="Mở File Project (.manga)">
          <FolderOpen size={16} />
          <input type="file" accept=".manga,.json" className="hidden" onChange={handleLoadManga} />
        </label>
        <button onClick={handleSaveManga} className="btn-ghost p-1.5" title="Lưu Project (.manga)"><Save size={16} /></button>
        
        <div className="w-px h-4 bg-border mx-1"></div>

        {/* 🚀 Nút Ẩn/Hiện Cột Phải */}
        <button onClick={toggleRightPanel} className={`p-1.5 rounded-md transition-colors ${!showRightPanel ? 'text-text-muted hover:bg-border' : 'bg-primary/20 text-primary'}`} title="Ẩn/Hiện Layer Panel">
          <PanelRight size={16} />
        </button>

        <button onClick={handleExport} className="btn-subtle py-1.5 px-3 ml-1 hover:text-white hover:bg-primary hover:border-primary">
          <Download size={16} className="mr-1 inline-block" /> Xuất
        </button>
      </div>
    </div>
  );
}