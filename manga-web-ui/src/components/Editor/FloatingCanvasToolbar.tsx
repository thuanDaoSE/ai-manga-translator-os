import React from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useAuthStore } from '../../store/useAuthStore';
// 🚀 Thêm icon ScanLine vào đây
import { MousePointer2, Eraser, Paintbrush, ScanSearch, Undo2, Redo2, Type, ScanLine, Eye, EyeOff, Sparkles, Loader2 } from 'lucide-react';

const BoltIcon = ({ className = "w-3 h-3 text-amber-500 fill-current" }: { className?: string }) => (
  <svg className={`${className} inline-block align-middle`} viewBox="-11 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.84 26.24c-0.080 0-0.16 0-0.24-0.040-0.4-0.12-0.64-0.52-0.56-0.92l1.32-9.16h-1.52c-0.24 0-0.52-0.12-0.68-0.32s-0.2-0.48-0.16-0.72l2.32-8.68c0.080-0.36 0.44-0.64 0.8-0.64h5.56c0.28 0 0.56 0.16 0.72 0.4s0.16 0.56 0.040 0.8l-2.6 5.12h1.24c0.28 0 0.56 0.16 0.72 0.4s0.16 0.56 0.040 0.8l-6.24 12.48c-0.12 0.28-0.44 0.48-0.76 0.48zM1.92 14.44h1.4c0.24 0 0.48 0.12 0.64 0.28 0.16 0.2 0.24 0.44 0.2 0.68l-0.72 4.92 3.28-6.56h-1.24c-0.28 0-0.56-0.16-0.72-0.4s-0.16-0.56-0.040-0.8l2.6-5.12h-3.56l-1.84 7z"></path>
  </svg>
);

export const FloatingCanvasToolbar: React.FC = () => {
  // 🚀 Lấy thêm showAiGuides, toggleAiGuides, isProcessing từ store
  const { 
    activeMode, 
    setActiveMode, 
    brushSize, 
    setBrushSize, 
    restoreType, 
    toggleRestoreType, 
    showAiGuides, 
    toggleAiGuides, 
    showText, 
    setShowText,
    isProcessing,
    isRedrawSessionActive
  } = useToolStore();

  const pageStatuses = useProjectStore((state) => state.pageStatuses);
  const currentIndex = useProjectStore((state) => state.currentIndex);
  const isCurrentPageProcessing = pageStatuses[currentIndex] === 'processing' || pageStatuses[currentIndex] === 'waiting';
  
  const isBrushMode = activeMode === 'erase' || activeMode === 'restore' || activeMode === 'redraw';
  
  const user = useAuthStore((state) => state.user);
  const lensFreeRemaining = user?.lensFreeRemaining !== undefined ? user.lensFreeRemaining : 20;


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
      fontSize: toolState.fontSize || 20, //[cite: 12]
      fontColor: toolState.fontColor || '#000000', //[cite: 12]
      fontFamily: toolState.fontFamily || "'Comic Neue', cursive", //[cite: 12]
      rotation: 0 //[cite: 12]
    });
    // Tự động chuyển về con trỏ chuột để sếp có thể kéo chữ luôn[cite: 12]
    setActiveMode('none');  //[cite: 12]
  };

  const ToolButton = ({ mode, icon: Icon, label, shortLabel }: { mode: any, icon: any, label: string, shortLabel: string }) => {
    const isActive = activeMode === mode;
    const isButtonLoading = mode === activeMode && isCurrentPageProcessing;
    const CurrentIcon = isButtonLoading ? Loader2 : Icon;

    return (
      <div className="relative flex flex-col items-center group">
        <div className="absolute -top-10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 px-2.5 py-1.5 bg-panel text-white text-[11px] font-bold rounded-lg shadow-xl whitespace-nowrap pointer-events-none border border-border z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-1.5">
            <span>
              {isButtonLoading 
                ? (mode === 'redraw' ? "Đang vẽ lại bằng AI..." : mode === 'erase' ? "Đang xóa nền bằng AI..." : "Đang xử lý...") 
                : shortLabel}
            </span>
            {mode === 'redraw' && (
              <span className="bg-blue-500/20 text-blue-400 text-[9px] px-1 py-0.5 rounded uppercase font-bold ml-1">BETA</span>
            )}
          </div>
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border"></div>
        </div>

        <button
          onClick={() => !isCurrentPageProcessing && setActiveMode(mode)}
          disabled={isCurrentPageProcessing}
          className={`w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center relative
            ${isActive 
              ? 'bg-primary text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' 
              : 'text-text-muted hover:bg-border hover:text-text-main'}
            ${isCurrentPageProcessing && !isButtonLoading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
            ${isButtonLoading ? 'bg-amber-500 text-amber-950 animate-pulse border border-amber-400/30' : ''}
          `}
        >
          <CurrentIcon size={20} strokeWidth={isActive ? 2.5 : 2} className={isButtonLoading ? "animate-spin" : ""} />
          
          {['erase', 'redraw', 'scan'].includes(mode) && (
            <span className="absolute -bottom-1.5 -right-1.5 inline-flex items-center text-amber-400 text-[9.5px] font-black whitespace-nowrap pointer-events-none select-none z-30 drop-shadow-[0_1.5px_2px_rgba(0,0,0,1)]">
              {mode === 'redraw' ? (isRedrawSessionActive ? '1' : '4') : mode === 'scan' ? (
                lensFreeRemaining > 0 ? (
                  <span className="text-emerald-400">{lensFreeRemaining} Free</span>
                ) : (
                  <>
                    <span>1</span>
                    <BoltIcon className="w-2.5 h-2.5 -ml-[1px] text-amber-400 fill-amber-400 shrink-0" />
                  </>
                )
              ) : (
                <>
                  <span>1</span>
                  <BoltIcon className="w-2.5 h-2.5 -ml-[1px] text-amber-400 fill-amber-400 shrink-0" />
                </>
              )}
            </span>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-[100] pointer-events-none transition-all duration-300
      ${isCurrentPageProcessing ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
      
      {/* TẦNG 1: THANH SIZE CỌ VÀ CHẾ ĐỘ PHỤC HỒI */}
      <div className={`transition-all duration-300 transform pointer-events-auto flex flex-col gap-2.5 px-4 py-3 bg-panel/95 backdrop-blur-xl border border-border shadow-lg rounded-full
          ${isBrushMode ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        
        <div className="flex items-center gap-3">
          {activeMode === 'restore' && (
            <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg border border-border mr-1 shadow-inner">
              <button
                disabled={isCurrentPageProcessing}
                onClick={() => restoreType !== 'raw' && toggleRestoreType()}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  restoreType === 'raw' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main hover:bg-border'
                } ${isCurrentPageProcessing ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                Bản Gốc
              </button>
              <button
                disabled={isCurrentPageProcessing}
                onClick={() => restoreType !== 'clean' && toggleRestoreType()}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  restoreType === 'clean' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main hover:bg-border'
                } ${isCurrentPageProcessing ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                Bản Sạch
              </button>
            </div>
          )}

          <div className="w-1.5 h-1.5 bg-text-muted rounded-full"></div>
          <input 
            type="range" min="1" max="150" value={brushSize} disabled={isCurrentPageProcessing} onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-32 h-1.5 bg-background rounded-lg appearance-none cursor-pointer accent-primary border border-border disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <div className="w-3 h-3 bg-text-muted rounded-full"></div>
          <span className="text-xs text-text-main w-8 text-right font-bold tabular-nums">{brushSize} px</span>
        </div>
      </div>

      {/* TẦNG 2: THANH CÔNG CỤ CHÍNH */}
      <div className="flex items-center px-2 py-2 bg-panel/95 backdrop-blur-xl border border-border rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)] pointer-events-auto">
        
        <div className="flex items-center gap-1 mr-2 pr-2 border-r border-border">
          <button 
            onClick={handleUndo} 
            disabled={isCurrentPageProcessing} 
            className={`w-10 h-10 rounded-full flex items-center justify-center text-text-muted transition-colors ${
              isCurrentPageProcessing ? 'opacity-40 cursor-not-allowed' : 'hover:bg-border hover:text-text-main cursor-pointer'
            }`} 
            title="Hoàn tác (Ctrl+Z)"
          >
            <Undo2 size={18} />
          </button>
          <button 
            onClick={handleRedo} 
            disabled={isCurrentPageProcessing} 
            className={`w-10 h-10 rounded-full flex items-center justify-center text-text-muted transition-colors ${
              isCurrentPageProcessing ? 'opacity-40 cursor-not-allowed' : 'hover:bg-border hover:text-text-main cursor-pointer'
            }`} 
            title="Làm lại (Ctrl+Y)"
          >
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
              onClick={handleAddText}
              disabled={isCurrentPageProcessing}
              className={`w-10 h-10 rounded-full text-text-muted transition-colors duration-200 flex items-center justify-center relative ${
                isCurrentPageProcessing ? 'opacity-40 cursor-not-allowed' : 'hover:bg-border hover:text-text-main cursor-pointer'
              }`}
            >
              <Type size={20} strokeWidth={2} />
            </button>
          </div>

          <div className="w-px h-6 bg-border mx-1"></div>

          <ToolButton mode="erase" icon={Eraser} label="Tẩy nền (E)" shortLabel="Tẩy nền (E)" />
          <ToolButton mode="redraw" icon={Sparkles} label="Vẽ lại AI (R)" shortLabel="Vẽ lại AI (R)" />
          <ToolButton mode="restore" icon={Paintbrush} label="Khôi phục gốc (B)" shortLabel="Khôi phục gốc (B)" />
          <ToolButton mode="scan" icon={ScanSearch} label="Dịch Lens (S)" shortLabel="Dịch Lens (S)" />

          <div className="w-px h-6 bg-border mx-1"></div>

          {/* 🚀 NÚT MỚI: BẬT TẮT VÙNG BÁO AI XỬ LÝ */}
          <div className="relative flex flex-col items-center group">
            <div className="absolute -top-10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 px-2.5 py-1.5 bg-panel text-white text-[11px] font-bold rounded-lg shadow-xl whitespace-nowrap pointer-events-none border border-border z-50">
              {showAiGuides ? "Tắt vùng thay đổi" : "Hiện vùng thay đổi"}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border"></div>
            </div>
            <button
              onClick={toggleAiGuides}
              disabled={isCurrentPageProcessing}
              className={`w-10 h-10 rounded-full transition-colors duration-200 flex items-center justify-center relative
                ${showAiGuides 
                  ? 'bg-red-500/10 text-red-500 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                  : 'text-text-muted hover:bg-border hover:text-text-main'}
                ${isCurrentPageProcessing ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
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