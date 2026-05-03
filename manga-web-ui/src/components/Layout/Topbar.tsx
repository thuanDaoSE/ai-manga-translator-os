import { useState } from 'react';
import { Settings, Image as ImageIcon, Download, Trash2, ZoomIn, ZoomOut, Maximize, Eye, EyeOff } from 'lucide-react';
import { useToolStore } from '../../store/useToolStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useConfigStore } from '../../store/useConfigStore';
import { mangaApi } from '../../services/api';
import html2canvas from 'html2canvas';

export default function Topbar() {
  const toolStore = useToolStore();
  const projectStore = useProjectStore();
  const canvasStore = useCanvasStore();
  const configStore = useConfigStore();
  const [isProcessing, setIsProcessing] = useState(false);

  // 1. Hàm Upload File
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name));
      projectStore.setFiles(files);
      projectStore.setCurrentIndex(0);
      files.forEach(file => mangaApi.uploadRaw(file));
    }
  };

  // 2. Hàm Dịch Trang
  const handleTranslate = async () => {
    const file = projectStore.fileQueue[projectStore.currentIndex];
    if (!file) return alert("Vui lòng chọn trang!");
    setIsProcessing(true);
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

  // 🚀 3. HÀM GỌI API CỌ XÓA NỀN
  const handleErase = async () => {
    const drawCanvas = document.getElementById('draw-layer') as HTMLCanvasElement;
    if (!drawCanvas) return;
    
    // Kiểm tra xem user có vẽ nét nào chưa
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
      
      ctx?.clearRect(0, 0, drawCanvas.width, drawCanvas.height); // Xóa nháp đỏ
      toolStore.setActiveMode('none'); // Thoát cọ
    } catch (error: any) {
      alert(`Lỗi Xóa nền: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 🚀 4. KHÔI PHỤC HÀM TẢI FONT
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

  // 🚀 5. SỬA LỖI TẢI ẢNH (Bỏ Zoom trước khi chụp)
  const handleExport = async () => {
    const el = document.getElementById('workspace-container');
    if (!el) return alert("Chưa có ảnh để xuất!");
    
    // Tạm ẩn viền khung chữ đang chọn
    const activeId = canvasStore.activeBubbleId;
    if (activeId) canvasStore.setActiveBubble(null);

    // XÓA HIỆU ỨNG ZOOM TẠM THỜI ĐỂ HTML2CANVAS KHÔNG BỊ LỖI
    const originalTransform = el.style.transform;
    el.style.transform = 'none';

    try {
      const canvas = await html2canvas(el, { useCORS: true, scale: 2 });
      const link = document.createElement('a');
      link.download = `Translated_${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (error) {
      alert("Lỗi xuất ảnh. Hãy đảm bảo bạn đã chạy: npm install html2canvas");
    }

    // Khôi phục lại Zoom và vùng chọn
    el.style.transform = originalTransform;
    if (activeId) canvasStore.setActiveBubble(activeId);
  };

  return (
    <div className="bg-panel px-4 py-3 flex items-center gap-3 shadow-lg border-b border-gray-800 shrink-0 flex-wrap z-10 text-sm">
      <div className="flex items-center gap-2 border-r border-gray-700 pr-3">
        <label className="btn-secondary bg-gray-600 hover:bg-gray-500">
          <ImageIcon size={16} /> Chọn RAW
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
        <button onClick={handleTranslate} disabled={isProcessing} className={`btn-primary ${isProcessing ? 'opacity-50 cursor-wait' : ''}`}>
          {isProcessing ? '⏳ Đang xử lý...' : '⚡ Dịch Trang Này'}
        </button>
        <button onClick={() => configStore.setModalOpen(true)} className="btn-secondary bg-slate-500 hover:bg-slate-600">
          <Settings size={16} /> Ngữ cảnh
        </button>
      </div>

      <div className="flex items-center gap-2 border-r border-gray-700 pr-3">
        <button onClick={() => canvasStore.addBubble({ x: 50, y: 50, w: 150, h: 60, text: "Nhập chữ...", fontSize: toolStore.fontSize, fontColor: toolStore.fontColor, fontFamily: toolStore.fontFamily, rotation: 0, sfxClass: '' })} className="btn-secondary bg-blue-500 hover:bg-blue-600">
          + Chữ Tự Do
        </button>
        
        <div className="flex items-center bg-[#333] rounded border border-gray-600 overflow-hidden h-[30px]">
          <button className="px-2 hover:bg-gray-600 font-bold" onClick={() => handleFontSize(-2)}>A-</button>
          <input type="number" value={toolStore.fontSize} readOnly className="w-10 text-center bg-transparent border-x border-gray-600 outline-none" />
          <button className="px-2 hover:bg-gray-600 font-bold" onClick={() => handleFontSize(2)}>A+</button>
        </div>

        {/* 🚀 KHÔI PHỤC NÚT UPLOAD FONT */}
        <label className="btn-secondary bg-[#8e44ad] hover:bg-purple-700 px-2 py-1 cursor-pointer text-[11px]" title="Tải font .ttf / .otf của bạn lên">
          ⬆️ Font
          <input type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={handleFontUpload} />
        </label>

        <select value={toolStore.fontFamily} onChange={(e) => handleFontFamily(e.target.value)} className="bg-[#333] border border-gray-600 rounded px-2 h-[30px] outline-none max-w-[120px] text-xs truncate">
          {toolStore.customFonts.length > 0 && (
            <optgroup label="⭐ Font Của Bạn">
              {toolStore.customFonts.map((font, idx) => (
                <option key={idx} value={font.value} style={{ fontFamily: font.value.replace(/'/g, "") }}>{font.name}</option>
              ))}
            </optgroup>
          )}
          <optgroup label="Mặc định">
            <option value="'Comic Neue', cursive">Comic Neue</option>
            <option value="'Anton', sans-serif">Anton</option>
            <option value="'Creepster', cursive">Creepster</option>
          </optgroup>
        </select>

        <div className="flex gap-1 items-center bg-[#2a2a2a] px-2 h-[30px] rounded-full border border-gray-700">
          {['#000000', '#ffffff', '#f44336', '#ffeb3b'].map(c => (
            <button key={c} onClick={() => handleFontColor(c)} className="w-4 h-4 rounded-full border border-gray-500 hover:scale-125 transition-transform" style={{ backgroundColor: c }} />
          ))}
          <input type="color" value={toolStore.fontColor} onChange={(e) => handleFontColor(e.target.value)} className="w-5 h-5 ml-1 p-0 border-0 rounded cursor-pointer bg-transparent" />
        </div>
      </div>

      <div className="flex items-center gap-2 border-r border-gray-700 pr-3">
        <button onClick={() => { if(canvasStore.activeBubbleId) canvasStore.removeBubble(canvasStore.activeBubbleId) }} className="text-red-500 hover:text-red-400 hover:bg-gray-800 p-1.5 rounded"><Trash2 size={18} /></button>
        <span className="text-[10px] text-gray-400 ml-2">SFX:</span>
        <button onClick={() => applySFX('sfx-power')} className="hover:bg-gray-800 p-1 rounded" title="Mạnh mẽ">💥</button>
        <button onClick={() => applySFX('sfx-impact')} className="hover:bg-gray-800 p-1 rounded" title="Va chạm">👊</button>
        <button onClick={() => applySFX('sfx-horror')} className="hover:bg-gray-800 p-1 rounded" title="Kinh dị">👻</button>
        <button onClick={() => applySFX('')} className="hover:bg-gray-800 p-1 rounded text-red-500" title="Bỏ hiệu ứng">✖</button>
      </div>

      <div className="flex items-center gap-2 border-r border-gray-700 pr-3">
        <button onClick={() => toolStore.setActiveMode('scan')} className={`btn ${toolStore.activeMode === 'scan' ? 'bg-yellow-400 text-black shadow-[0_0_10px_#ffeb3b]' : 'bg-accent text-white'}`}>🔍 Lens</button>
        <button onClick={() => toolStore.setActiveMode('erase')} className={`btn ${toolStore.activeMode === 'erase' ? 'bg-yellow-400 text-black shadow-[0_0_10px_#ffeb3b]' : 'bg-danger text-white'}`}>🖌️ Xóa Nền</button>
        <button onClick={() => toolStore.setActiveMode('restore')} className={`btn ${toolStore.activeMode === 'restore' ? 'bg-yellow-400 text-black shadow-[0_0_10px_#ffeb3b]' : 'bg-cyan-500 text-white'}`}>🩹 Phục Hồi</button>
        
        {(toolStore.activeMode === 'erase' || toolStore.activeMode === 'restore') && (
          <div className="flex items-center bg-[#333] rounded border border-gray-600 ml-2 h-[30px] px-2 gap-2">
            <span className="text-[10px] text-gray-400">CỠ:</span>
            <input type="range" min="5" max="100" value={toolStore.brushSize} onChange={(e) => toolStore.setBrushSize(Number(e.target.value))} className="w-20" />
            {toolStore.activeMode === 'erase' && (
               <button onClick={handleErase} disabled={isProcessing} className="bg-orange-500 text-white px-2 py-0.5 rounded text-xs font-bold hover:bg-orange-600">{isProcessing ? '⏳' : '✅ Xóa'}</button>
            )}
            {toolStore.activeMode === 'restore' && (
              <button onClick={toolStore.toggleRestoreType} className={`px-2 py-0.5 rounded text-xs font-bold text-white transition-colors ${toolStore.restoreType === 'raw' ? 'bg-cyan-500' : 'bg-pink-500'}`}>
                {toolStore.restoreType === 'raw' ? 'Mực: Raw' : 'Mực: Clean'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button onClick={() => toolStore.setZoom(toolStore.currentZoom - 0.1)} className="btn-icon bg-gray-700"><ZoomOut size={16}/></button>
        <span className="w-12 text-center font-bold text-xs">{Math.round(toolStore.currentZoom * 100)}%</span>
        <button onClick={() => toolStore.setZoom(toolStore.currentZoom + 0.1)} className="btn-icon bg-gray-700"><ZoomIn size={16}/></button>
        <button onClick={() => toolStore.setZoom(1.0)} className="btn-secondary bg-gray-600 hover:bg-gray-500"><Maximize size={16}/> Vừa MH</button>
        
        <button onClick={() => toolStore.setShowText(!toolStore.showText)} className={`btn-secondary ml-2 ${!toolStore.showText ? 'bg-gray-500' : 'bg-teal-500'}`}>
          {toolStore.showText ? <><Eye size={16}/> Ẩn Chữ</> : <><EyeOff size={16}/> Hiện Chữ</>}
        </button>

        <button onClick={handleExport} className="btn bg-pink-600 text-white hover:bg-pink-700 ml-4">
          <Download size={16} /> Xuất Ảnh
        </button>
      </div>
    </div>
  );
}