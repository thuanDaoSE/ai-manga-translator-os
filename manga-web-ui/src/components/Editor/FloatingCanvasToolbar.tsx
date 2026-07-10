import React, { useState, useEffect, useRef } from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useConfigStore } from '../../store/useConfigStore';
import { MousePointer2, Eraser, RotateCcw, ScanSearch, Undo2, Redo2, Type, ScanLine, Eye, EyeOff, Sparkles, Loader, Copy, Target, Slash, Brush, Stamp, Pipette, Wand2, Bot } from 'lucide-react';

const GrokIcon = ({ className = "w-5 h-5 text-slate-200" }: { className?: string }) => (
  <svg className={className} fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <title>Grok</title>
    <path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"></path>
  </svg>
);

const OpenaiIcon = ({ className = "w-5.5 h-5.5 text-slate-200" }: { className?: string }) => (
  <svg className={className} fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <title>OpenAI</title>
    <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"></path>
  </svg>
);

const BoltIcon = () => (
  <svg className="w-3 h-3 text-amber-500 fill-current inline-block align-middle" viewBox="-11 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.84 26.24c-0.080 0-0.16 0-0.24-0.040-0.4-0.12-0.64-0.52-0.56-0.92l1.32-9.16h-1.52c-0.24 0-0.52-0.12-0.68-0.32s-0.2-0.48-0.16-0.72l2.32-8.68c0.080-0.36 0.44-0.64 0.8-0.64h5.56c0.28 0 0.56 0.16 0.72 0.4s0.16 0.56 0.040 0.8l-2.6 5.12h1.24c0.28 0 0.56 0.16 0.72 0.4s0.16 0.56 0.040 0.8l-6.24 12.48c-0.12 0.28-0.44 0.48-0.76 0.48zM1.92 14.44h1.4c0.24 0 0.48 0.12 0.64 0.28 0.16 0.2 0.24 0.44 0.2 0.68l-0.72 4.92 3.28-6.56h-1.24c-0.28 0-0.56-0.16-0.72-0.4s-0.16-0.56-0.040-0.8l2.6-5.12h-3.56l-1.84 7z"></path>
  </svg>
);

const GpuIcon = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    fill="currentColor" 
    className={`inline-block align-middle ${className}`} 
    viewBox="0 0 16 16"
  >
    <path d="M4 8a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0m7.5-1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"/>
    <path d="M0 1.5A.5.5 0 0 1 .5 1h1a.5.5 0 0 1 .5.5V4h13.5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H2v2.5a.5.5 0 0 1-1 0V2H.5a.5.5 0 0 1-.5-.5m5.5 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M9 8a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0"/>
    <path d="M3 12.5h3.5v1a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5zm4 1v-1h4v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5"/>
  </svg>
);

interface Props {
  actionPosition?: { x: number; y: number } | null;
}

export const FloatingCanvasToolbar: React.FC<Props> = ({
  actionPosition = null,
}) => {
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
    isRedrawSessionActive,
    cloneSource,
    isSelectingSource,
    setIsSelectingSource,
    speedlineColor,
    setSpeedlineColor,
    speedlineType,
    setSpeedlineType,
    isDrawingState
  } = useToolStore();

  const pageStatuses = useProjectStore((state) => state.pageStatuses);
  const currentIndex = useProjectStore((state) => state.currentIndex);
  const isCurrentPageProcessing = pageStatuses[currentIndex] === 'processing' || pageStatuses[currentIndex] === 'waiting';
  
  const isBrushMode = activeMode === 'erase' || activeMode === 'restore' || activeMode === 'redraw' || activeMode === 'clone' || activeMode === 'speedline';
  
  const user = useAuthStore((state) => state.user);
  const lensFreeRemaining = user?.lensFreeRemaining !== undefined ? user.lensFreeRemaining : 20;


  const handleUndo = () => {
    useProjectStore.getState().undoUrl();
    useCanvasStore.getState().undo();
  };
  const handleRedo = () => {
    useProjectStore.getState().redoUrl();
    useCanvasStore.getState().redo();
  };
  // 🚀 TÍNH NĂNG MỚI: HÀM THÊM CHỮ THỦ CÔNG[cite: 12]
  const handleAddText = () => {
    const toolState = useToolStore.getState(); 
    const safeColor = toolState.fontColor || '#000000';
    useCanvasStore.getState().addBubble({
      x: 200, 
      y: 200, 
      w: 200, 
      h: 80, 
      text: "Gõ chữ vào đây...", 
      fontSize: toolState.fontSize || 20, 
      fontColor: safeColor, 
      fontFamily: toolState.fontFamily || "'Comic Neue', cursive", 
      rotation: 0,
      outlineWidth: toolState.outlineWidth,
      outlineColor: safeColor.toLowerCase() === '#000000' ? '#ffffff' : '#000000'
    });
    // Tự động chuyển về con trỏ chuột để sếp có thể kéo chữ luôn
    setActiveMode('none');  
  };

  const ToolButton = ({ 
    mode, 
    icon: Icon, 
    label, 
    shortLabel,
    disabled = false,
    lockMessage
  }: { 
    mode: any, 
    icon: any, 
    label: string, 
    shortLabel: string,
    disabled?: boolean,
    lockMessage?: string 
  }) => {
    const isActive = activeMode === mode;
    const isButtonLoading = mode === activeMode && (isCurrentPageProcessing || isProcessing);
    const CurrentIcon = isButtonLoading ? Loader : Icon;
    const isDisabled = disabled || isCurrentPageProcessing || isProcessing;

    return (
      <div className="relative flex flex-col items-center group">
        <div className="absolute -top-10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 px-2.5 py-1.5 bg-panel text-white text-[11px] font-bold rounded-lg shadow-xl whitespace-nowrap pointer-events-none border border-border z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-1.5">
            <span>
              {isButtonLoading 
                ? (mode === 'redraw' ? "Đang vẽ lại bằng AI..." : mode === 'erase' ? "Đang xóa nền bằng AI..." : "Đang xử lý...") 
                : (lockMessage || shortLabel)}
            </span>
            {mode === 'redraw' && (
              <span className="bg-blue-500/20 text-blue-400 text-[9px] px-1 py-0.5 rounded uppercase font-bold ml-1">BETA</span>
            )}
          </div>
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border"></div>
        </div>

        <button
          onClick={() => !isDisabled && setActiveMode(mode)}
          disabled={isDisabled}
          className={`w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center relative
            ${isActive 
              ? 'bg-primary text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' 
              : 'text-text-muted hover:bg-border hover:text-text-main'}
            ${isDisabled && !isButtonLoading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
            ${isButtonLoading ? 'bg-amber-500 text-amber-950 animate-pulse border border-amber-400/30' : ''}
          `}
        >
          <CurrentIcon size={20} strokeWidth={isActive ? 2.5 : 2} className={isButtonLoading ? "animate-spin" : ""} />
          
          {['erase', 'redraw', 'scan'].includes(mode) && (
            <span className="absolute -bottom-1.5 -right-1.5 inline-flex items-center text-amber-400 text-[9.5px] font-black whitespace-nowrap pointer-events-none select-none z-30 drop-shadow-[0_1.5px_2px_rgba(0,0,0,1)]">
              {mode === 'redraw' ? (
                <>
                  <span>3</span>
                  <GpuIcon className="w-2.5 h-2.5 -ml-[1px] text-amber-400 shrink-0" />
                </>
              ) : mode === 'scan' ? (
                lensFreeRemaining > 0 ? (
                  <span className="text-emerald-400">{lensFreeRemaining} Free</span>
                ) : (
                  <>
                    <span>1</span>
                    <GpuIcon className="w-2.5 h-2.5 -ml-[1px] text-amber-400 shrink-0" />
                  </>
                )
              ) : (
                <>
                  <span>1</span>
                  <GpuIcon className="w-2.5 h-2.5 -ml-[1px] text-amber-400 shrink-0" />
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
      ${(isCurrentPageProcessing || isDrawingState) ? 'opacity-0 translate-y-10 scale-90 pointer-events-none' : 'opacity-100 translate-y-0 scale-100'}`}>
      
      {/* TẦNG 1: DÒNG THIẾT LẬP CỌ (Đã tối ưu hóa gộp chung các dòng để tiết kiệm diện tích) */}
      <div className={`transition-all duration-300 transform pointer-events-auto flex items-center px-4 py-2 bg-panel/95 backdrop-blur-xl border border-border shadow-lg rounded-full
          ${isBrushMode ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 pointer-events-none scale-95 absolute'}`}>
        
        <div className="flex items-center gap-2">
          {/* Xóa nền thông minh (integrated inline!) */}

          {/* Speedline controls (integrated inline!) */}
          {activeMode === 'speedline' && (
            <>
              {/* Chế độ vẽ */}
              <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg border border-border shadow-inner font-sans text-text-muted">
                <button
                  onClick={() => setSpeedlineType('brush')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                    speedlineType === 'brush' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main'
                  }`}
                  title="Cọ vẽ tự do"
                >
                  <Brush size={11} />
                  <span>Cọ</span>
                </button>
                <button
                  onClick={() => setSpeedlineType('line')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                    speedlineType === 'line' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main'
                  }`}
                  title="Đường thẳng (Nhấn Shift để đi thẳng)"
                >
                  <Slash size={11} className="rotate-45" />
                  <span>Thẳng</span>
                </button>
                <button
                  onClick={() => setSpeedlineType('eraser')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                    speedlineType === 'eraser' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main'
                  }`}
                  title="Tẩy nét vẽ tay"
                >
                  <Eraser size={11} />
                  <span>Tẩy</span>
                </button>
                <button
                  onClick={() => setSpeedlineType('eyedropper')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                    speedlineType === 'eyedropper' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main'
                  }`}
                  title="Chọn màu từ canvas (I)"
                >
                  <Pipette size={11} />
                  <span>Chọn màu</span>
                </button>
              </div>

              {/* Màu sắc vẽ (chỉ hiện khi không ở chế độ Tẩy) */}
              {speedlineType !== 'eraser' && (
                <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg border border-border shadow-inner font-sans text-text-muted">
                  {['#000000', '#ffffff', '#ff0000'].map((color) => (
                    <button
                      key={color}
                      onClick={() => setSpeedlineColor(color)}
                      style={{ backgroundColor: color }}
                      className={`w-3.5 h-3.5 rounded-sm border border-white/10 cursor-pointer transition-transform hover:scale-110 ${
                        speedlineColor.toLowerCase() === color.toLowerCase() ? 'ring-1.5 ring-primary scale-105' : ''
                      }`}
                      title={color === '#000000' ? 'Đen' : color === '#ffffff' ? 'Trắng' : 'Đỏ'}
                    />
                  ))}
                  <div className="w-px h-3.5 bg-border mx-0.5"></div>
                  <label className="w-3.5 h-3.5 rounded-sm border border-white/10 cursor-pointer relative flex items-center justify-center hover:scale-105 transition-transform" style={{ backgroundColor: speedlineColor }} title="Chọn màu tự do">
                    <input
                      type="color"
                      value={speedlineColor}
                      onChange={(e) => setSpeedlineColor(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                  </label>
                </div>
              )}
            </>
          )}

          {activeMode === 'restore' && (
            <div className="flex items-center gap-1 bg-background/50 p-1 rounded-lg border border-border shadow-inner">
              <button
                disabled={isCurrentPageProcessing || isProcessing}
                onClick={() => restoreType !== 'raw' && toggleRestoreType()}
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  restoreType === 'raw' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main hover:bg-border'
                } ${(isCurrentPageProcessing || isProcessing) ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                Bản Gốc
              </button>
              <button
                disabled={isCurrentPageProcessing || isProcessing}
                onClick={() => restoreType !== 'clean' && toggleRestoreType()}
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  restoreType === 'clean' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-text-main hover:bg-border'
                } ${(isCurrentPageProcessing || isProcessing) ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                Bản Sạch
              </button>
            </div>
          )}

          {(activeMode === 'restore' || activeMode === 'clone' || activeMode === 'speedline') && (
            <div className="w-px h-4 bg-border mx-1"></div>
          )}

          {/* Cỡ cọ vẽ */}
          <div className="flex items-center gap-2">
            <input 
              type="range" min="1" max="150" value={brushSize} disabled={isCurrentPageProcessing || isProcessing} onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-24 h-1 bg-background rounded appearance-none cursor-pointer accent-primary border border-border disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-[10px] text-text-main font-bold font-mono min-w-[32px] text-right">{brushSize}px</span>
          </div>

          {activeMode === 'clone' && (
            <div className="flex items-center gap-2 border-l border-border pl-2 ml-1 shrink-0">
              <button
                disabled={isCurrentPageProcessing || isProcessing}
                onClick={() => setIsSelectingSource(!isSelectingSource)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
                  isSelectingSource 
                    ? 'bg-cyan-500 text-white shadow-md' 
                    : 'bg-background hover:bg-border text-text-muted hover:text-text-main border border-border'
                }`}
                title="Alt + Click lên canvas để thiết lập nhanh điểm nguồn"
              >
                <Target size={11} />
                <span>Nguồn</span>
              </button>
              {cloneSource && (
                <span className="text-[10px] text-text-muted font-mono bg-background/50 px-1 py-0.5 rounded border border-border">
                  ({cloneSource.x.toFixed(0)}, {cloneSource.y.toFixed(0)})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TẦNG 2: THANH CÔNG CỤ CHÍNH */}
      <div className="flex items-center px-2 py-2 bg-panel/95 backdrop-blur-xl border border-border rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)] pointer-events-auto">
        
        <div className="flex items-center gap-1 mr-2 pr-2 border-r border-border">
          <button 
            onClick={handleUndo} 
            disabled={isCurrentPageProcessing || isProcessing} 
            className={`w-10 h-10 rounded-full flex items-center justify-center text-text-muted transition-colors ${
              (isCurrentPageProcessing || isProcessing) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-border hover:text-text-main cursor-pointer'
            }`} 
            title="Hoàn tác (Ctrl+Z)"
          >
            <Undo2 size={18} />
          </button>
          <button 
            onClick={handleRedo} 
            disabled={isCurrentPageProcessing || isProcessing} 
            className={`w-10 h-10 rounded-full flex items-center justify-center text-text-muted transition-colors ${
              (isCurrentPageProcessing || isProcessing) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-border hover:text-text-main cursor-pointer'
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
              disabled={isCurrentPageProcessing || isProcessing}
              className={`w-10 h-10 rounded-full text-text-muted transition-colors duration-200 flex items-center justify-center relative ${
                (isCurrentPageProcessing || isProcessing) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-border hover:text-text-main cursor-pointer'
              }`}
            >
              <Type size={20} strokeWidth={2} />
            </button>
          </div>

          <div className="w-px h-6 bg-border mx-1"></div>

          <ToolButton mode="erase" icon={Eraser} label="Tẩy nền (E)" shortLabel="Tẩy nền (E)" />
          {user?.email === 'td2005dataeg@gmail.com' && (
            <ToolButton mode="redraw" icon={Sparkles} label="Vẽ lại AI (R)" shortLabel="Vẽ lại AI (R)" />
          )}
          <ToolButton mode="clone" icon={Copy} label="Clone Stamp (S)" shortLabel="Clone Stamp" />
          <ToolButton mode="speedline" icon={Brush} label="Cọ vẽ tay (B)" shortLabel="Cọ vẽ tay" />
          <ToolButton mode="restore" icon={RotateCcw} label="Khôi phục gốc (Y)" shortLabel="Khôi phục gốc (Y)" />
          <ToolButton 
            mode="scan" 
            icon={ScanSearch} 
            label="Dịch Lens (W)" 
            shortLabel="Dịch Lens (W)" 
          />

          <div className="w-px h-6 bg-border mx-1"></div>

          {/* 🚀 NÚT MỚI: BẬT TẮT VÙNG BÁO AI XỬ LÝ */}
          <div className="relative flex flex-col items-center group">
            <div className="absolute -top-10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 px-2.5 py-1.5 bg-panel text-white text-[11px] font-bold rounded-lg shadow-xl whitespace-nowrap pointer-events-none border border-border z-50">
              {showAiGuides ? "Tắt vùng thay đổi" : "Hiện vùng thay đổi"}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border"></div>
            </div>
            <button
              onClick={toggleAiGuides}
              disabled={isCurrentPageProcessing || isProcessing}
              className={`w-10 h-10 rounded-full transition-colors duration-200 flex items-center justify-center relative
                ${showAiGuides 
                  ? 'bg-red-500/10 text-red-500 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                  : 'text-text-muted hover:bg-border hover:text-text-main'}
                ${(isCurrentPageProcessing || isProcessing) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
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