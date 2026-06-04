import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Trash2, AlignLeft, AlignCenter, AlignRight, RefreshCw, Contrast, AlignJustify } from 'lucide-react';
import toast from 'react-hot-toast';

export default function FloatingTextToolbar() {
  const toolStore = useToolStore();
  const canvasStore = useCanvasStore();

  const activeId = canvasStore.activeBubbleId;
  const activeBubble = canvasStore.bubbles.find(b => b.id === activeId);

  if (!activeId || !activeBubble) return null;

  // HÀM 1: Đổi màu nhanh (Chữ Trắng/Viền Đen <-> Chữ Đen/Viền Trắng)
  const handleToggleColor = () => {
    const isBlack = activeBubble.fontColor === '#000000';
    const newColor = isBlack ? '#ffffff' : '#000000';
    canvasStore.updateBubble(activeId, { fontColor: newColor });
    useToolStore.getState().setFontColor(newColor);
  };

  // HÀM 2: Căn lề (Alignment) - Sẽ gắn logic Canvas sau
  const handleAlignment = (align: 'left' | 'center' | 'right') => {
    // Tạm thời update vào store (sẽ có tác dụng nếu sếp cập nhật BubbleNode đọc thuộc tính này)
    canvasStore.updateBubble(activeId, { textAlign: align });
    toast.success(`Đã căn lề: ${align}`, { duration: 1000 });
  };

  // HÀM 3: Gọi AI dịch lại (Thao tác nhanh)
  const handleRetryTranslation = () => {
    toast.loading("Đang gọi AI dịch lại câu này...", { duration: 2000 });
    // Sẽ nối dây gọi API Backend sau
  };

  // TÍNH TOÁN VỊ TRÍ (NÉ CẠNH TRÊN ĐỂ KHÔNG BỊ KHUẤT)
  const isTooCloseToTop = activeBubble.y < 100;
  const topPosition = isTooCloseToTop
    ? activeBubble.y + activeBubble.h + 80
    : activeBubble.y - 70; // Thu hẹp khoảng cách vì thanh này giờ đã nhỏ gọn hơn

  return (
    <div
      className="toolbar-container absolute z-[100] flex items-center gap-1.5 p-1.5 rounded-lg bg-[#222222]/95 backdrop-blur-md border border-[#3E3E3E] shadow-2xl animate-in fade-in zoom-in-95 pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        left: activeBubble.x + (activeBubble.w / 2),
        top: topPosition,
        transform: `translateX(-50%) scale(${1 / toolStore.currentZoom})`,
        transformOrigin: isTooCloseToTop ? 'top center' : 'bottom center'
      }}
    >

      {/* NHÓM 1: THAO TÁC AI (Thường dùng nhất) */}
      <div className="flex gap-1">
        <button
          onClick={handleRetryTranslation}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A84FF]/10 text-[#0A84FF] hover:bg-[#0A84FF] hover:text-white rounded-md transition-colors font-semibold text-xs cursor-pointer"
          title="Yêu cầu AI dịch lại câu này"
        >
          <RefreshCw size={14} /> Dịch Lại
        </button>
      </div>

      <div className="w-px h-5 bg-[#444] mx-1"></div>

      {/* NHÓM 2: CĂN LỀ TEXT (Định dạng khung) */}
      {/* 🚀 BỘ NÚT CĂN LỀ ĐÃ ĐƯỢC LẮP ĐÈN TRẠNG THÁI */}
      <div className="flex items-center gap-0.5 bg-background p-1 rounded-lg border border-border shadow-inner">
        <button
          onClick={() => canvasStore.updateBubble(activeBubble.id, { textAlign: 'left' })}
          className={`p-1.5 rounded-md transition-all duration-200 ${activeBubble.textAlign === 'left' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border/60'}`}
          title="Căn trái"
        >
          <AlignLeft size={14} />
        </button>
        <button
          onClick={() => canvasStore.updateBubble(activeBubble.id, { textAlign: 'center' })}
          className={`p-1.5 rounded-md transition-all duration-200 ${(!activeBubble.textAlign || activeBubble.textAlign === 'center') ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border/60'}`}
          title="Căn giữa"
        >
          <AlignCenter size={14} />
        </button>
        <button
          onClick={() => canvasStore.updateBubble(activeBubble.id, { textAlign: 'right' })}
          className={`p-1.5 rounded-md transition-all duration-200 ${activeBubble.textAlign === 'right' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border/60'}`}
          title="Căn phải"
        >
          <AlignRight size={14} />
        </button>
        <button
          onClick={() => canvasStore.updateBubble(activeBubble.id, { textAlign: 'justify' })}
          className={`p-1.5 rounded-md transition-all duration-200 ${activeBubble.textAlign === 'justify' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border/60'}`}
          title="Căn đều"
        >
          <AlignJustify size={14} />
        </button>
      </div>

      <div className="w-px h-5 bg-[#444] mx-1"></div>

      {/* NHÓM 3: ĐẢO MÀU & XÓA */}
      <div className="flex gap-1">
        <button
          onClick={handleToggleColor}
          className="p-1.5 text-[#A0A0A0] hover:text-white hover:bg-[#333] rounded-md transition-colors cursor-pointer"
          title="Đảo màu Nhanh (Đen/Trắng)"
        >
          <Contrast size={15} />
        </button>

        <button
          onClick={() => {
            canvasStore.removeBubble(activeId);
          }}
          className="p-1.5 text-red-400 hover:text-white hover:bg-red-500 rounded-md transition-colors cursor-pointer"
          title="Xóa ô chữ này"
        >
          <Trash2 size={15} />
        </button>
      </div>

    </div>
  );
}