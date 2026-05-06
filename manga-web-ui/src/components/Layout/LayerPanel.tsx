import { Eye, EyeOff, Lock, Unlock, Layers, Type, Ghost } from 'lucide-react';
import { useCanvasStore } from '../../store/useCanvasStore';

export default function LayerPanel() {
  const { bubbles, activeBubbleId, setActiveBubble, updateBubble } = useCanvasStore();

  // 🚀 XÓA DÒNG: if (bubbles.length === 0) return null; 
  // Để Panel luôn hiện diện, giữ vững cấu trúc 3 cột của ứng dụng.

  const reversedBubbles = [...bubbles].reverse();

  return (
    <div className="w-64 bg-sidebar border-l border-border flex flex-col h-full shadow-2xl z-20 shrink-0">
      
      {/* Header - Luôn hiển thị để người dùng biết đây là khu vực quản lý Layer */}
      <div className="p-4 border-b border-border bg-panel/50 backdrop-blur-md flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-main flex items-center gap-2 uppercase tracking-tight">
          <Layers size={18} className="text-primary" />
          Layers
        </h2>
        {bubbles.length > 0 && (
          <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
            {bubbles.length} Text
          </span>
        )}
      </div>

      {/* Nội dung danh sách */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {bubbles.length === 0 ? (
          // 🚀 HIỂN THỊ EMPTY STATE KHI CHƯA CÓ CHỮ
          <div className="h-full flex flex-col items-center justify-center opacity-20 select-none p-6 text-center">
            <div className="p-4 rounded-full bg-border/30 mb-4">
              <Ghost size={40} />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest">Trống rỗng</p>
            <p className="text-[10px] mt-2 leading-relaxed">
              Các lớp chữ sẽ xuất hiện tại đây sau khi bạn dịch trang hoặc thêm chữ thủ công
            </p>
          </div>
        ) : (
          reversedBubbles.map((bubble) => {
            const isActive = activeBubbleId === bubble.id;
            const layerName = bubble.text.trim() 
              ? bubble.text.substring(0, 15) + (bubble.text.length > 15 ? '...' : '') 
              : 'Chữ trống...';

            return (
              <div 
                key={bubble.id}
                onClick={() => { if (!bubble.isLocked) setActiveBubble(bubble.id) }}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors border ${
                  isActive ? 'bg-primary/20 border-primary/50' : 'bg-transparent border-transparent hover:bg-border/50'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <Type size={14} className={isActive ? "text-primary" : "text-text-muted"} />
                  <span className={`text-xs truncate ${bubble.isHidden ? 'text-text-muted line-through' : 'text-text-main font-medium'}`}>
                    {layerName}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button 
                    onClick={(e) => { e.stopPropagation(); updateBubble(bubble.id, { isLocked: !bubble.isLocked }) }}
                    className={`p-1 rounded-md transition-colors ${bubble.isLocked ? 'text-red-400 bg-red-400/10' : 'text-text-muted hover:text-text-main hover:bg-border'}`}
                  >
                    {bubble.isLocked ? <Lock size={14}/> : <Unlock size={14}/>}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); updateBubble(bubble.id, { isHidden: !bubble.isHidden }) }}
                    className={`p-1 rounded-md transition-colors ${bubble.isHidden ? 'text-gray-500 bg-gray-800' : 'text-text-muted hover:text-text-main hover:bg-border'}`}
                  >
                    {bubble.isHidden ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}