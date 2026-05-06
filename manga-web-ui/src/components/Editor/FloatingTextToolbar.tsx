import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Trash2 , MessageCircle} from 'lucide-react';

export default function FloatingTextToolbar() {
  const toolStore = useToolStore();
  const canvasStore = useCanvasStore();
  
  // 1. Lấy thông tin chi tiết của bong bóng đang được chọn
  const activeId = canvasStore.activeBubbleId;
  const activeBubble = canvasStore.bubbles.find(b => b.id === activeId);

  if (!activeId || !activeBubble) return null;

  const handleFontSize = (delta: number) => {
    const newSize = Math.max(8, Math.min(toolStore.fontSize + delta, 150));
    toolStore.setFontSize(newSize);
    canvasStore.updateBubble(activeId, { fontSize: newSize });
  };

  const handleFontFamily = (font: string) => {
    toolStore.setFontFamily(font);
    canvasStore.updateBubble(activeId, { fontFamily: font });
  };

  const handleFontColor = (color: string) => {
    toolStore.setFontColor(color);
    canvasStore.updateBubble(activeId, { fontColor: color });
  };

  const applySFX = (sfxClass: string) => {
    canvasStore.updateBubble(activeId, { sfxClass, fontColor: sfxClass ? '#ffffff' : '#000000' });
  };

  const toggleTail = () => {
    const current = activeBubble.tailDirection || 'none';
    const next = current === 'none' ? 'left' : current === 'left' ? 'right' : 'none';
    canvasStore.updateBubble(activeId, { tailDirection: next });
  };

  // 🚀 2. TÍNH TOÁN VỊ TRÍ THÔNG MINH
  // Nếu ô chữ nằm quá sát mép trên (< 60px), đẩy toolbar xuống dưới ô chữ. Nếu không, cho nổi lên trên.
  const isTooCloseToTop = activeBubble.y < 60;
  const topPosition = isTooCloseToTop 
    ? activeBubble.y + activeBubble.h + 20 
    : activeBubble.y - 65;

  return (
    <div 
      className="absolute z-[100] flex items-center gap-3 p-2 rounded-xl glass-panel shadow-2xl animate-in fade-in zoom-in-95"
      style={{
         // Căn giữa theo chiều ngang của ô chữ
         left: activeBubble.x + (activeBubble.w / 2),
         top: topPosition,
         // 🚀 Đảo ngược tỷ lệ Zoom để thanh Toolbar luôn giữ nguyên kích cỡ trên màn hình
         transform: `translateX(-50%) scale(${1 / toolStore.currentZoom})`,
         transformOrigin: isTooCloseToTop ? 'top center' : 'bottom center'
      }}
    >
      
      {/* 1. Size chữ */}
      <div className="flex items-center bg-background rounded-md border border-border overflow-hidden h-8">
        <button className="px-3 hover:bg-border text-text-muted hover:text-text-main font-medium cursor-pointer" onClick={() => handleFontSize(-2)}>A-</button>
        <span className="w-10 text-center text-xs font-bold">{toolStore.fontSize}</span>
        <button className="px-3 hover:bg-border text-text-muted hover:text-text-main font-medium cursor-pointer" onClick={() => handleFontSize(2)}>A+</button>
      </div>

      {/* 2. Font chữ */}
      <select value={toolStore.fontFamily} onChange={(e) => handleFontFamily(e.target.value)} className="bg-background border border-border text-text-main rounded-md px-2 h-8 outline-none max-w-32 text-xs focus:border-primary cursor-pointer">
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

      {/* 3. Màu sắc */}
      <div className="flex gap-1.5 items-center bg-background px-2 h-8 rounded-md border border-border">
        {['#000000', '#ffffff', '#ef4444', '#f59e0b'].map(c => (
          <button key={c} onClick={() => handleFontColor(c)} className="w-4 h-4 rounded-full border border-border hover:scale-125 transition-transform cursor-pointer" style={{ backgroundColor: c }} />
        ))}
        <input type="color" value={toolStore.fontColor} onChange={(e) => handleFontColor(e.target.value)} className="w-5 h-5 ml-1 p-0 border-0 rounded cursor-pointer bg-transparent" />
      </div>

      <div className="w-px h-6 bg-border mx-1"></div>
      <div className="w-px h-6 bg-border mx-1"></div>

      {/* 🚀 Nút Bật/Tắt Cái Đuôi */}
      <button onClick={toggleTail} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md cursor-pointer flex items-center gap-1 text-xs font-bold" title="Đổi hướng đuôi">
        <MessageCircle size={16} /> 
        {activeBubble.tailDirection === 'left' ? 'Trái' : activeBubble.tailDirection === 'right' ? 'Phải' : 'Tắt'}
      </button>

      {/* 4. SFX & Xóa */}
      <div className="flex items-center gap-1">
        <button onClick={() => applySFX('sfx-power')} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md cursor-pointer" title="SFX Mạnh">💥</button>
        <button onClick={() => applySFX('sfx-impact')} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md cursor-pointer" title="Va chạm">👊</button>
        <button onClick={() => applySFX('sfx-horror')} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md cursor-pointer" title="Kinh dị">👻</button>
        <button onClick={() => applySFX('')} className="p-1.5 text-text-muted hover:text-danger hover:bg-border rounded-md cursor-pointer" title="Bỏ hiệu ứng">✖</button>
        <button onClick={() => canvasStore.removeBubble(activeId)} className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/20 rounded-md ml-1 cursor-pointer" title="Xóa ô chữ"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}