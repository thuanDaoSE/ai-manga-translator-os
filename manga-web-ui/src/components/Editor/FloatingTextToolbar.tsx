import { useEffect, useState, useRef } from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { mangaApi } from '../../services/api';
// 🚀 Thêm icon Upload để làm nút tải Font
import { Trash2, Upload } from 'lucide-react'; 
import toast from 'react-hot-toast';
import { saveFontToBrowser, loadAllSavedFonts } from '../../utils/fontManager';

export default function FloatingTextToolbar() {
  const toolStore = useToolStore();
  const canvasStore = useCanvasStore();
  
  const [serverFonts, setServerFonts] = useState<string[]>([]);
  // 🚀 BẢN VÁ: Thêm State chứa Font cá nhân và Ref cho input file
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const fontInputRef = useRef<HTMLInputElement>(null);
  
  const activeId = canvasStore.activeBubbleId;
  const activeBubble = canvasStore.bubbles.find(b => b.id === activeId);

  useEffect(() => {
    // 1. Tải Font từ Server
    mangaApi.getFonts().then(data => {
      if (data.fonts) {
         const fontNames = data.fonts.map((f: string) => f.replace(/\.[^/.]+$/, ""));
         setServerFonts(fontNames);
      }
    }).catch(err => console.error("Lỗi lấy danh sách font:", err));

    // 2. 🚀 BẢN VÁ: Tải Font cá nhân từ Trình duyệt (IndexedDB)
    loadAllSavedFonts()
      .then(fonts => setCustomFonts(fonts))
      .catch(err => console.error("Lỗi load font cá nhân:", err));
  }, []);

  if (!activeId || !activeBubble) return null;

  const currentSize = activeBubble.fontSize || toolStore.fontSize;

  const handleFontSize = (delta: number) => {
    const newSize = Math.max(8, Math.min(currentSize + delta, 150));
    useToolStore.getState().setFontSize(newSize);
    useCanvasStore.getState().updateBubble(activeId, { fontSize: newSize });
  };

  const handleFontFamily = (font: string) => {
    useToolStore.getState().setFontFamily(font);
    canvasStore.updateBubble(activeId, { fontFamily: font });
  };

  const handleFontColor = (color: string) => {
    useToolStore.getState().setFontColor(color);
    useCanvasStore.getState().updateBubble(activeId, { fontColor: color });
  };

  // 🚀 BẢN VÁ: Hàm xử lý Upload Font Local
  const handleUploadFont = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.ttf') && !file.name.toLowerCase().endsWith('.otf')) {
      toast.error('Chỉ hỗ trợ file Font .TTF hoặc .OTF');
      return;
    }

    const loadId = toast.loading("Đang cài đặt Font...");
    try {
      const fontName = await saveFontToBrowser(file);
      
      // Bổ sung font mới vào danh sách nếu chưa có
      if (!customFonts.includes(fontName)) {
        setCustomFonts(prev => [...prev, fontName]);
      }
      
      // Tự động đổi font của ô chữ hiện tại sang font vừa tải lên luôn cho nóng
      handleFontFamily(fontName);
      toast.success(`Đã cài đặt Font: ${fontName}`, { id: loadId });
    } catch (error) {
      toast.error("Lỗi khi tải font!", { id: loadId });
    }
    e.target.value = ''; // Xóa input để up được file trùng tên nếu muốn
  };

  const isTooCloseToTop = activeBubble.y < 100;
  const topPosition = isTooCloseToTop 
    ? activeBubble.y + activeBubble.h + 80 
    : activeBubble.y - 125;

  return (
    <div 
      className="toolbar-container absolute z-[100] flex items-center gap-3 p-2 rounded-xl glass-panel shadow-2xl animate-in fade-in zoom-in-95 pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()} 
      style={{
         left: activeBubble.x + (activeBubble.w / 2),
         top: topPosition,
         transform: `translateX(-50%) scale(${1 / toolStore.currentZoom})`,
         transformOrigin: isTooCloseToTop ? 'top center' : 'bottom center'
      }}
    >
      
      {/* CỤM 1: CHỈNH CỠ CHỮ */}
      <div className="flex items-center bg-background rounded-md border border-border overflow-hidden h-8">
        <button className="px-3 hover:bg-border text-text-muted hover:text-text-main font-medium cursor-pointer" onClick={() => handleFontSize(-2)}>A-</button>
        <span className="w-10 text-center text-xs font-bold">{currentSize}</span>
        <button className="px-3 hover:bg-border text-text-muted hover:text-text-main font-medium cursor-pointer" onClick={() => handleFontSize(2)}>A+</button>
      </div>

      {/* 🚀 CỤM 2: CHỌN FONT CHỮ VÀ UPLOAD FONT */}
      <div className="flex items-center gap-1">
        <select 
          value={toolStore.fontFamily} 
          onChange={(e) => handleFontFamily(e.target.value)} 
          className="bg-background border border-border text-text-main rounded-md px-2 h-8 outline-none max-w-32 text-xs focus:border-primary cursor-pointer"
        >
          {customFonts.length > 0 && (
            <optgroup label="⭐ Font Cá Nhân">
              {customFonts.map((fontName, idx) => (
                <option key={`custom-${idx}`} value={fontName} style={{ fontFamily: fontName }}>{fontName}</option>
              ))}
            </optgroup>
          )}

          {serverFonts.length > 0 && (
            <optgroup label="☁️ Font Hệ Thống">
              {serverFonts.map((fontName, idx) => (
                <option key={`srv-${idx}`} value={fontName} style={{ fontFamily: fontName }}>{fontName}</option>
              ))}
            </optgroup>
          )}
          
          <optgroup label="Mặc định">
            <option value="'Comic Neue', cursive">Comic Neue</option>
            <option value="'Anton', sans-serif">Anton</option>
            <option value="Arial, sans-serif">Arial</option>
          </optgroup>
        </select>

        {/* Nút Upload Font (Icon) */}
        <input 
          type="file" 
          accept=".ttf,.otf" 
          ref={fontInputRef} 
          onChange={handleUploadFont} 
          className="hidden" 
        />
        <button 
          onClick={() => {
            // 🛡️ BẬT KHIÊN PHÁP LÝ Ở ĐÂY
            const isAgreed = window.confirm(
              "KHIÊN PHÁP LÝ & BẢN QUYỀN 🛡️\n\n" +
              "Bằng việc tải font này lên, bạn xác nhận mình có quyền sử dụng hợp pháp. " +
              "Font sẽ được lưu nội bộ trên máy của bạn. Hệ thống không lưu trữ và không chịu trách nhiệm về các vấn đề bản quyền.\n\n" +
              "Bạn có đồng ý tiếp tục?"
            );
            if (isAgreed) {
              fontInputRef.current?.click();
            }
          }}
          className="h-8 px-2 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-md transition-colors flex items-center justify-center cursor-pointer border border-primary/20"
          title="Tải Font chữ cá nhân từ máy tính (.ttf, .otf)"
        >
          <Upload size={14} />
        </button>
      </div>

      {/* CỤM 3: CHỌN MÀU CHỮ */}
      <div className="flex gap-1.5 items-center bg-background px-2 h-8 rounded-md border border-border">
        {['#000000', '#ffffff', '#ef4444', '#f59e0b'].map(c => (
          <button key={c} onClick={() => handleFontColor(c)} className="w-4 h-4 rounded-full border border-border hover:scale-125 transition-transform cursor-pointer" style={{ backgroundColor: c }} />
        ))}
        <input type="color" value={toolStore.fontColor} onChange={(e) => handleFontColor(e.target.value)} className="w-5 h-5 ml-1 p-0 border-0 rounded cursor-pointer bg-transparent" />
      </div>

      <div className="w-px h-6 bg-border mx-1"></div>

      {/* CỤM 4: NÚT XÓA */}
      <button onClick={() => canvasStore.removeBubble(activeId)} className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/20 rounded-md cursor-pointer" title="Xóa ô chữ">
        <Trash2 size={16} />
      </button>

    </div>
  );
}