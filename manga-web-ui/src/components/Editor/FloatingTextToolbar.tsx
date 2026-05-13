import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Trash2 } from 'lucide-react';

export default function FloatingTextToolbar() {
  const toolStore = useToolStore();
  const canvasStore = useCanvasStore();
  
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

  // 🚀 Cơ chế Absolute cũ nhưng có "Né trần nhà"
  const isTooCloseToTop = activeBubble.y < 60;
  const topPosition = isTooCloseToTop 
    ? activeBubble.y + activeBubble.h + 20 
    : activeBubble.y - 65;

  return (
    <div 
      className="toolbar-container absolute z-[100] flex items-center gap-3 p-2 rounded-xl glass-panel shadow-2xl animate-in fade-in zoom-in-95 pointer-events-auto"
      // 🚀 BẢN VÁ: Ngăn chặn sự kiện click lan ra ngoài làm mất focus chữ
      onMouseDown={(e) => e.stopPropagation()} 
      style={{
         left: activeBubble.x + (activeBubble.w / 2),
         top: topPosition,
         transform: `translateX(-50%) scale(${1 / toolStore.currentZoom})`,
         transformOrigin: isTooCloseToTop ? 'top center' : 'bottom center'
      }}
    >
      
      {/* 1. Nút tăng giảm Size chữ */}
      <div className="flex items-center bg-background rounded-md border border-border overflow-hidden h-8">
        <button className="px-3 hover:bg-border text-text-muted hover:text-text-main font-medium cursor-pointer" onClick={() => handleFontSize(-2)}>A-</button>
        <span className="w-10 text-center text-xs font-bold">{toolStore.fontSize}</span>
        <button className="px-3 hover:bg-border text-text-muted hover:text-text-main font-medium cursor-pointer" onClick={() => handleFontSize(2)}>A+</button>
      </div>

      {/* 2. Nút chọn Font chữ */}
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

      {/* 3. Nút chọn Màu sắc */}
      <div className="flex gap-1.5 items-center bg-background px-2 h-8 rounded-md border border-border">
        {['#000000', '#ffffff', '#ef4444', '#f59e0b'].map(c => (
          <button key={c} onClick={() => handleFontColor(c)} className="w-4 h-4 rounded-full border border-border hover:scale-125 transition-transform cursor-pointer" style={{ backgroundColor: c }} />
        ))}
        <input type="color" value={toolStore.fontColor} onChange={(e) => handleFontColor(e.target.value)} className="w-5 h-5 ml-1 p-0 border-0 rounded cursor-pointer bg-transparent" />
      </div>

      <div className="w-px h-6 bg-border mx-1"></div>

      {/* 4. Nút Xóa (Đã dọn dẹp sạch sẽ SFX và Đuôi bong bóng) */}
      <button onClick={() => canvasStore.removeBubble(activeId)} className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/20 rounded-md cursor-pointer" title="Xóa ô chữ">
        <Trash2 size={16} />
      </button>

    </div>
  );
}