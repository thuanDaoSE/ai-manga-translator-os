import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, Unlock, Layers, Type, Ghost, PanelRightClose, Languages, X, Sparkles, Check } from 'lucide-react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';

export default function LayerPanel() {
  const { bubbles, activeBubbleId, setActiveBubble, updateBubble, addBubble } = useCanvasStore();
  const { scanModal, setScanModal, setActiveMode } = useToolStore();

  // State cục bộ cho khung Dịch
  const [editedVie, setEditedVie] = useState("");

  // Tự động nạp text tiếng Việt khi quét xong
  useEffect(() => {
    if (scanModal?.isOpen) {
      setEditedVie(scanModal.vie);
    }
  }, [scanModal]);

  // Xử lý chèn chữ vào Canvas
  const handleApplyScan = () => {
    if (!scanModal?.coords) return;
    const { x1, y1, x2, y2 } = scanModal.coords;
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const centerX = Math.min(x1, x2) + width / 2;
    const centerY = Math.min(y1, y2) + height / 2;

    addBubble({
      x: centerX - width / 2,
      y: centerY - height / 2,
      w: Math.max(100, width),
      h: Math.max(40, height),
      text: editedVie,
      fontSize: useToolStore.getState().fontSize,
      fontColor: useToolStore.getState().fontColor,
      fontFamily: useToolStore.getState().fontFamily,
      rotation: 0
    });
    setScanModal(null);
    setActiveMode('none');
  };

  const reversedBubbles = [...bubbles].reverse();

  return (
    <div className="w-full bg-sidebar border-l border-border flex flex-col h-full shadow-2xl z-20 shrink-0">
      
      {/* 1. HEADER (Bất di bất dịch) */}
      <div className="p-4 border-b border-border bg-panel/50 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => useToolStore.getState().toggleRightPanel()} 
            className="p-1.5 bg-border/40 hover:bg-border text-text-muted hover:text-danger rounded-md cursor-pointer transition-colors"
            title="Đóng cột phải"
          >
            <PanelRightClose size={16} />
          </button>
          <h2 className="text-sm font-bold text-text-main flex items-center gap-1 uppercase tracking-tight">
            <Layers size={18} className="text-primary" />
            Layers
          </h2>
        </div>
        {bubbles.length > 0 && (
          <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
            {bubbles.length} Text
          </span>
        )}
      </div>

      {/* 🚀 2. TRẠM DỊCH THUẬT NGỮ CẢNH (Chỉ hiện khi dùng Lens) */}
      {scanModal?.isOpen && (
        <div className="flex flex-col shrink-0 border-b-2 border-primary/30 bg-primary/5 animate-in slide-in-from-top-4 duration-300 shadow-md">
          
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-background/50">
            <div className="flex items-center gap-1.5 text-primary font-bold text-xs uppercase tracking-wider">
              <Languages size={14} /> Trích xuất & Dịch
            </div>
            <button
              onClick={() => { setScanModal(null); setActiveMode('none'); }}
              className="p-1 text-text-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-3 space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-text-muted uppercase flex items-center gap-1">
                <Type size={10} /> Tiếng Nhật
              </label>
              <textarea
                readOnly
                value={scanModal.jap}
                className="w-full h-14 px-2 py-1.5 bg-background/50 border border-border rounded-lg text-text-muted text-xs resize-none focus:outline-none custom-scrollbar"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-primary uppercase flex items-center gap-1">
                <Sparkles size={10} /> Tiếng Việt
              </label>
              <textarea
                value={editedVie}
                onChange={(e) => setEditedVie(e.target.value)}
                className="w-full h-20 px-2 py-1.5 bg-background border border-primary/30 rounded-lg text-text-main text-xs font-medium resize-none focus:outline-none focus:border-primary transition-all custom-scrollbar"
              />
            </div>

            <button
              onClick={handleApplyScan}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary-hover shadow-md transition-all cursor-pointer"
            >
              <Check size={14} strokeWidth={2.5} /> Chèn vào ảnh
            </button>
          </div>
        </div>
      )}

      {/* 3. DANH SÁCH LAYERS (Bị đẩy xuống dưới khi có Trạm Dịch) */}
      {/* 3. DANH SÁCH LAYERS */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar bg-sidebar">
        {bubbles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 select-none p-6 text-center">
            <div className="p-4 rounded-full bg-border/30 mb-4"><Ghost size={40} /></div>
            <p className="text-xs font-bold uppercase tracking-widest">Trống rỗng</p>
          </div>
        ) : (
          reversedBubbles.map((bubble) => {
            const isActive = activeBubbleId === bubble.id;
            const isHovered = useCanvasStore.getState().hoveredBubbleId === bubble.id;
            const cleanText = bubble.text.replace(/\n/g, ' ').trim();
            const layerName = cleanText ? cleanText.substring(0, 18) + (cleanText.length > 18 ? '...' : '') : 'Chữ trống...';

            return (
              <div 
                key={bubble.id}
                onClick={() => setActiveBubble(bubble.id)}
                onMouseEnter={() => useCanvasStore.getState().setHoveredBubble(bubble.id)}
                onMouseLeave={() => useCanvasStore.getState().setHoveredBubble(null)}
                className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors border ${
                  isActive ? 'bg-primary/20 border-primary/50 shadow-sm' : 
                  isHovered ? 'bg-white/5 border-white/20' : 
                  'bg-panel/30 border-transparent hover:bg-border/50'
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <Type size={14} className={isActive ? "text-primary" : "text-text-muted"} />
                  <span className={`text-xs truncate font-medium ${isActive ? 'text-text-main' : 'text-text-muted'}`}>
                    {layerName}
                  </span>
                </div>
                
                {/* Đã xóa sạch nhóm nút Khóa và Mắt ở đây, trả lại sự trong sạch cho UI! */}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}