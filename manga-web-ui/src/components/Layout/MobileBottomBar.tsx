import React, { useState } from 'react';
import { 
  Layers, 
  Sparkles, 
  Eye, 
  EyeOff, 
  MessageSquareText, 
  SlidersHorizontal, 
  Loader2, 
  Undo2, 
  Redo2, 
  MousePointer2, 
  Type, 
  Eraser, 
  Brush, 
  RotateCcw, 
  ScanSearch, 
  ScanLine, 
  X 
} from 'lucide-react';
import { useToolStore } from '../../store/useToolStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useCanvasStore } from '../../store/useCanvasStore';

interface MobileBottomBarProps {
  onTranslate: () => void;
  isProcessing: boolean;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  onTranslate,
  isProcessing
}) => {
  const [showToolsSheet, setShowToolsSheet] = useState(false);

  const { 
    activeMode, 
    setActiveMode, 
    isComparing, 
    setIsComparing, 
    showLeftPanel, 
    setShowLeftPanel, 
    showRightPanel, 
    setShowRightPanel,
    showText,
    setShowText,
    showAiGuides,
    toggleAiGuides
  } = useToolStore();

  const { currentIndex, fileQueue, pageStatuses } = useProjectStore();
  const bubbles = useCanvasStore((state) => state.bubbles);
  const isCurrentPageProcessing = pageStatuses[currentIndex] === 'processing' || pageStatuses[currentIndex] === 'waiting';
  const isBusy = isProcessing || isCurrentPageProcessing;

  const totalPages = fileQueue.length;

  const handleUndo = () => {
    useProjectStore.getState().undoUrl();
    useCanvasStore.getState().undo();
  };

  const handleRedo = () => {
    useProjectStore.getState().redoUrl();
    useCanvasStore.getState().redo();
  };

  const handleAddText = () => {
    const toolState = useToolStore.getState();
    const safeColor = toolState.fontColor || '#000000';
    useCanvasStore.getState().addBubble({
      x: 100,
      y: 100,
      w: 180,
      h: 70,
      text: "Gõ chữ vào đây...",
      fontSize: toolState.fontSize || 20,
      fontColor: safeColor,
      fontFamily: toolState.fontFamily || "'Comic Neue', cursive",
      rotation: 0,
      outlineWidth: toolState.outlineWidth,
      outlineColor: safeColor.toLowerCase() === '#000000' ? '#ffffff' : '#000000'
    });
    setActiveMode('none');
    setShowToolsSheet(false);
  };

  return (
    <>
      {/* 🛠️ QUICK TOOLS SHEET (BOTTOM POPUP FOR MOBILE) */}
      {showToolsSheet && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setShowToolsSheet(false)}
          />

          {/* Tools Panel */}
          <div className="relative bg-[#16161a]/95 backdrop-blur-xl border-t border-white/10 rounded-t-3xl p-4 shadow-2xl z-10 animate-in slide-in-from-bottom-6 duration-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-primary" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Công cụ chỉnh sửa</span>
              </div>
              <button 
                onClick={() => setShowToolsSheet(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Undo / Redo Shortcuts */}
            <div className="flex items-center gap-2 mb-3">
              <button 
                onClick={handleUndo}
                disabled={isBusy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 text-xs font-medium text-white border border-white/5 disabled:opacity-40"
              >
                <Undo2 size={15} />
                <span>Hoàn tác</span>
              </button>
              <button 
                onClick={handleRedo}
                disabled={isBusy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 text-xs font-medium text-white border border-white/5 disabled:opacity-40"
              >
                <Redo2 size={15} />
                <span>Làm lại</span>
              </button>
            </div>

            {/* Grid of Tools */}
            <div className="grid grid-cols-4 gap-2">
              {/* Con trỏ */}
              <button
                onClick={() => { setActiveMode('none'); setShowToolsSheet(false); }}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all ${
                  activeMode === 'none' 
                    ? 'bg-primary/20 border-primary text-primary shadow-sm' 
                    : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
                }`}
              >
                <MousePointer2 size={18} />
                <span className="text-[10px] font-bold">Con trỏ</span>
              </button>

              {/* Thêm chữ */}
              <button
                onClick={handleAddText}
                disabled={isBusy}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl bg-white/5 border border-white/5 text-neutral-300 hover:bg-white/10 transition-all disabled:opacity-40"
              >
                <Type size={18} />
                <span className="text-[10px] font-bold">+ Chữ</span>
              </button>

              {/* Tẩy nền */}
              <button
                onClick={() => { setActiveMode('erase'); setShowToolsSheet(false); }}
                disabled={isBusy}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all ${
                  activeMode === 'erase' 
                    ? 'bg-primary/20 border-primary text-primary shadow-sm' 
                    : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
                } disabled:opacity-40`}
              >
                <Eraser size={18} />
                <span className="text-[10px] font-bold">Tẩy nền</span>
              </button>

              {/* Cọ vẽ */}
              <button
                onClick={() => { setActiveMode('speedline'); setShowToolsSheet(false); }}
                disabled={isBusy}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all ${
                  activeMode === 'speedline' 
                    ? 'bg-primary/20 border-primary text-primary shadow-sm' 
                    : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
                } disabled:opacity-40`}
              >
                <Brush size={18} />
                <span className="text-[10px] font-bold">Cọ vẽ</span>
              </button>

              {/* Khôi phục */}
              <button
                onClick={() => { setActiveMode('restore'); setShowToolsSheet(false); }}
                disabled={isBusy}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all ${
                  activeMode === 'restore' 
                    ? 'bg-primary/20 border-primary text-primary shadow-sm' 
                    : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
                } disabled:opacity-40`}
              >
                <RotateCcw size={18} />
                <span className="text-[10px] font-bold">Phục hồi</span>
              </button>

              {/* Dịch Lens */}
              <button
                onClick={() => { setActiveMode('scan'); setShowToolsSheet(false); }}
                disabled={isBusy}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all ${
                  activeMode === 'scan' 
                    ? 'bg-primary/20 border-primary text-primary shadow-sm' 
                    : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
                } disabled:opacity-40`}
              >
                <ScanSearch size={18} />
                <span className="text-[10px] font-bold">Dịch Lens</span>
              </button>

              {/* Ẩn/Hiện chữ */}
              <button
                onClick={() => setShowText(!showText)}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all ${
                  !showText 
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' 
                    : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
                }`}
              >
                {showText ? <Eye size={18} /> : <EyeOff size={18} />}
                <span className="text-[10px] font-bold">{showText ? 'Ẩn chữ' : 'Hiện chữ'}</span>
              </button>

              {/* Vùng thay đổi */}
              <button
                onClick={toggleAiGuides}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all ${
                  showAiGuides 
                    ? 'bg-red-500/20 border-red-500/40 text-red-400' 
                    : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
                }`}
              >
                <ScanLine size={18} />
                <span className="text-[10px] font-bold">Vùng đổi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📱 MOBILE BOTTOM BAR */}
      <nav className="fixed bottom-0 inset-x-0 h-[64px] z-30 bg-[#121215]/95 backdrop-blur-xl border-t border-white/10 px-2 flex items-center justify-around md:hidden select-none">
        
        {/* 1. Trang (Pages Drawer Toggle) */}
        <button
          onClick={() => {
            setShowLeftPanel(!showLeftPanel);
            if (!showLeftPanel) setShowRightPanel(false);
          }}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
            showLeftPanel ? 'text-primary' : 'text-neutral-400 hover:text-white active:scale-95'
          }`}
        >
          <Layers size={18} strokeWidth={showLeftPanel ? 2.5 : 2} />
          <span className="text-[10px] font-bold tabular-nums">
            {totalPages > 0 ? `${currentIndex + 1}/${totalPages}` : 'Trang'}
          </span>
        </button>

        {/* 2. So sánh (Compare Raw/Clean) */}
        <button
          onClick={() => setIsComparing(!isComparing)}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
            isComparing ? 'text-amber-400' : 'text-neutral-400 hover:text-white active:scale-95'
          }`}
        >
          {isComparing ? <EyeOff size={18} strokeWidth={2.5} /> : <Eye size={18} strokeWidth={2} />}
          <span className="text-[10px] font-bold">
            {isComparing ? 'Bản gốc' : 'Bản dịch'}
          </span>
        </button>

        {/* 3. Dịch AI (Central Highlighted Action) */}
        <button
          onClick={onTranslate}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl shadow-lg shadow-indigo-600/30 active:scale-95 disabled:opacity-50 transition-all cursor-pointer border border-white/15"
        >
          {isBusy ? (
            <Loader2 size={16} className="animate-spin text-white" />
          ) : (
            <Sparkles size={16} className="text-amber-300 animate-pulse" />
          )}
          <span className="text-xs font-black tracking-wide uppercase">
            {isBusy ? 'Đang dịch' : 'Dịch AI'}
          </span>
        </button>

        {/* 4. Bong bóng / Thoại (Inspector Drawer Toggle) */}
        <button
          onClick={() => {
            setShowRightPanel(!showRightPanel);
            if (!showRightPanel) setShowLeftPanel(false);
          }}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer relative ${
            showRightPanel ? 'text-primary' : 'text-neutral-400 hover:text-white active:scale-95'
          }`}
        >
          <div className="relative">
            <MessageSquareText size={18} strokeWidth={showRightPanel ? 2.5 : 2} />
            {bubbles.length > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-primary text-[8px] font-black text-white flex items-center justify-center tabular-nums">
                {bubbles.length > 99 ? '99+' : bubbles.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold">Thoại</span>
        </button>

        {/* 5. Công cụ (Tools Sheet Toggle) */}
        <button
          onClick={() => setShowToolsSheet(!showToolsSheet)}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
            showToolsSheet ? 'text-primary' : 'text-neutral-400 hover:text-white active:scale-95'
          }`}
        >
          <SlidersHorizontal size={18} strokeWidth={showToolsSheet ? 2.5 : 2} />
          <span className="text-[10px] font-bold">Công cụ</span>
        </button>

      </nav>
    </>
  );
};
