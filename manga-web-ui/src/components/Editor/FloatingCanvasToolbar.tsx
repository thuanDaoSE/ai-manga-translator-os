import React from 'react';
import { useToolStore } from '../../store/useToolStore'; //[cite: 12]
import { useCanvasStore } from '../../store/useCanvasStore'; //[cite: 12]
// 🚀 Thêm icon ScanLine vào đây
import { MousePointer2, Eraser, Paintbrush, ScanSearch, Undo2, Redo2, Type, ScanLine, Eye, EyeOff, Sparkles } from 'lucide-react';
export const FloatingCanvasToolbar: React.FC = () => {
  // 🚀 Lấy thêm showAiGuides và toggleAiGuides từ store
const { activeMode, setActiveMode, brushSize, setBrushSize, restoreType, toggleRestoreType, showAiGuides, toggleAiGuides, showText, setShowText } = useToolStore();
  
  const isBrushMode = activeMode === 'erase' || activeMode === 'restore' || activeMode === 'redraw'; //[cite: 12]


  const handleUndo = () => useCanvasStore.getState().undo();
  const handleRedo = () => useCanvasStore.getState().redo();
  // 🚀 TÍNH NĂNG MỚI: HÀM THÊM CHỮ THỦ CÔNG[cite: 12]
  const handleAddText = () => {
    const toolState = useToolStore.getState(); //[cite: 12]
    useCanvasStore.getState().addBubble({
      x: 200, //[cite: 12]
      y: 200, //[cite: 12]
      w: 200, //[cite: 12]
      h: 80, //[cite: 12]
      text: "Gõ chữ vào đây...", //[cite: 12]
      fontSize: toolState.fontSize || 40, //[cite: 12]
      fontColor: toolState.fontColor || '#000000', //[cite: 12]
      fontFamily: toolState.fontFamily || "'Comic Neue', cursive", //[cite: 12]
      rotation: 0 //[cite: 12]
    });
    // Tự động chuyển về con trỏ chuột để sếp có thể kéo chữ luôn[cite: 12]
    setActiveMode('none');  //[cite: 12]
  };

  const ToolButton = ({ mode, icon: Icon, label, shortLabel }: { mode: any, icon: any, label: string, shortLabel: string }) => { //[cite: 12]
    const isActive = activeMode === mode; //[cite: 12]
    return (
      <div className="relative flex flex-col items-center group">
        <div className="absolute -top-10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 px-2.5 py-1.5 bg-panel text-white text-[11px] font-bold rounded-lg shadow-xl whitespace-nowrap pointer-events-none border border-border z-50">
          {shortLabel}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border"></div>
        </div>

        <button
          onClick={() => setActiveMode(mode)}
          className={`w-10 h-10 rounded-full transition-colors duration-200 flex items-center justify-center relative
            ${isActive 
              ? 'bg-primary text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' //[cite: 12]
              : 'text-text-muted hover:bg-border hover:text-text-main'}`} //[cite: 12]
        >
          <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
        </button>
      </div>
    );
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-[100] pointer-events-none">
      
      {/* TẦNG 1: THANH SIZE CỌ VÀ CHẾ ĐỘ PHỤC HỒI */}
      <div className={`transition-all duration-300 transform pointer-events-auto flex items-center gap-3 px-4 py-2 bg-panel/95 backdrop-blur-xl border border-border rounded-full shadow-lg
          ${isBrushMode ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        
        {activeMode === 'restore' && (
          <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg border border-border mr-1 shadow-inner">
            <button
              onClick={() => restoreType !== 'raw' && toggleRestoreType()} //[cite: 12]
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${ //[cite: 12]
                restoreType === 'raw' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main hover:bg-border' //[cite: 12]
              }`} //[cite: 12]
            >
              Bản Gốc
            </button>
            <button
              onClick={() => restoreType !== 'clean' && toggleRestoreType()} //[cite: 12]
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${ //[cite: 12]
                restoreType === 'clean' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main hover:bg-border' //[cite: 12]
              }`} //[cite: 12]
            >
              Bản Sạch
            </button>
          </div>
        )}

        <div className="w-1.5 h-1.5 bg-text-muted rounded-full"></div>
        <input 
          type="range" min="5" max="150" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} //[cite: 12]
          className="w-32 h-1.5 bg-background rounded-lg appearance-none cursor-pointer accent-primary border border-border" //[cite: 12]
        />
        <div className="w-3 h-3 bg-text-muted rounded-full"></div>
        <span className="text-xs text-text-main w-8 text-right font-bold tabular-nums">{brushSize} px</span>
      </div>

      {/* TẦNG 2: THANH CÔNG CỤ CHÍNH */}
      <div className="flex items-center px-2 py-2 bg-panel/95 backdrop-blur-xl border border-border rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)] pointer-events-auto">
        
        <div className="flex items-center gap-1 mr-2 pr-2 border-r border-border">
          <button onClick={handleUndo} className="w-10 h-10 rounded-full flex items-center justify-center text-text-muted hover:bg-border hover:text-text-main transition-colors cursor-pointer" title="Hoàn tác (Ctrl+Z)">
            <Undo2 size={18} />
          </button>
          <button onClick={handleRedo} className="w-10 h-10 rounded-full flex items-center justify-center text-text-muted hover:bg-border hover:text-text-main transition-colors cursor-pointer" title="Làm lại (Ctrl+Y)">
            <Redo2 size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <ToolButton mode="none" icon={MousePointer2} label="Con trỏ (V)" shortLabel="Con trỏ (V)" />
          
          {/* 🚀 NÚT THÊM CHỮ THỦ CÔNG */}
          <div className="relative flex flex-col items-center group">
            <div className="absolute -top-10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 px-2.5 py-1.5 bg-panel text-white text-[11px] font-bold rounded-lg shadow-xl whitespace-nowrap pointer-events-none border border-border z-50">
              Thêm Text (T)
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border"></div>
            </div>
            <button
              onClick={handleAddText} //[cite: 12]
              className="w-10 h-10 rounded-full text-text-muted hover:bg-border hover:text-text-main transition-colors duration-200 flex items-center justify-center relative cursor-pointer" //[cite: 12]
            >
              <Type size={20} strokeWidth={2} />
            </button>
          </div>

          <div className="w-px h-6 bg-border mx-1"></div>

          <ToolButton mode="erase" icon={Eraser} label="Tẩy nền (E)" shortLabel="Tẩy nền (E)" />
          <ToolButton mode="redraw" icon={Sparkles} label="Vẽ lại AI (R)" shortLabel="Vẽ lại AI (R)" />
          <ToolButton mode="restore" icon={Paintbrush} label="Phục hồi (B)" shortLabel="Phục hồi (B)" />
          <ToolButton mode="scan" icon={ScanSearch} label="Dịch Lens (S)" shortLabel="Dịch Lens (S)" />

          <div className="w-px h-6 bg-border mx-1"></div>

          {/* 🚀 NÚT MỚI: BẬT TẮT VÙNG BÁO AI XỬ LÝ */}
          <div className="relative flex flex-col items-center group">
            <div className="absolute -top-10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 px-2.5 py-1.5 bg-panel text-white text-[11px] font-bold rounded-lg shadow-xl whitespace-nowrap pointer-events-none border border-border z-50">
              {showAiGuides ? "Tắt vùng báo AI" : "Hiện vùng AI xử lý"}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border"></div>
            </div>
            <button
              onClick={toggleAiGuides}
              className={`w-10 h-10 rounded-full transition-colors duration-200 flex items-center justify-center relative cursor-pointer
                ${showAiGuides 
                  ? 'bg-red-500/10 text-red-500 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                  : 'text-text-muted hover:bg-border hover:text-text-main'}`}
            >
              <ScanLine size={20} strokeWidth={showAiGuides ? 2.5 : 2} className={showAiGuides ? "animate-pulse" : ""} />
            </button>
          </div>

          <div className="w-px h-6 bg-border mx-1"></div>

          {/* 🚀 NÚT MỚI: ẨN / HIỆN CHỮ (TÀNG HÌNH) */}
          <div className="relative flex flex-col items-center group">
            <div className="absolute -top-10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 px-2.5 py-1.5 bg-panel text-white text-[11px] font-bold rounded-lg shadow-xl whitespace-nowrap pointer-events-none border border-border z-50">
              {showText ? "Ẩn toàn bộ chữ" : "Hiện toàn bộ chữ"}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border"></div>
            </div>
            <button
              onClick={() => setShowText(!showText)}
              className={`w-10 h-10 rounded-full transition-colors duration-200 flex items-center justify-center relative cursor-pointer
                ${!showText 
                  ? 'bg-primary/10 text-primary border border-primary/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                  : 'text-text-muted hover:bg-border hover:text-text-main'}`}
            >
              {showText ? <Eye size={20} strokeWidth={2} /> : <EyeOff size={20} strokeWidth={2.5} />}
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};