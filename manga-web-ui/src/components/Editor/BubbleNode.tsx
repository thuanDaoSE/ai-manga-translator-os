import { useState, useRef, useEffect } from 'react';
import { useCanvasStore, type TextBubble } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import { RotateCw } from 'lucide-react';

interface Props {
  bubble: TextBubble;
}

export default function BubbleNode({ bubble: propBubble }: Props) {
  const { activeBubbleId, setActiveBubble, updateBubble, hoveredBubbleId, setHoveredBubble } = useCanvasStore();
  
  // Đọc bubble từ store để đồng bộ hóa ngay lập tức
  const storeBubble = useCanvasStore(state => state.bubbles.find(b => b.id === propBubble.id));
  const bubble = storeBubble || propBubble;
  
  const [isEditing, setIsEditing] = useState(false);
  const isHovered = hoveredBubbleId === bubble.id;
  const isActive = activeBubbleId === bubble.id;

  const textRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null); 
  
  // 🚀 TÍNH TOÁN LOCAL STATE: Giúp kéo thả đạt 60fps mượt mà không bị giật
  const [localPos, setLocalPos] = useState({ x: bubble.x, y: bubble.y });
  const [localSize, setLocalSize] = useState({ w: bubble.w, h: bubble.h });
  
  // Đồng bộ với dữ liệu Server/Database khi ảnh hưởng từ bên ngoài
  useEffect(() => {
    setLocalPos({ x: bubble.x, y: bubble.y });
    setLocalSize({ w: bubble.w, h: bubble.h });
  }, [bubble.x, bubble.y, bubble.w, bubble.h]);

  if (bubble.isHidden) return null;

  // 🚀 Xử lý Focus & Bôi đen khi Edit (Mượt như Word)
  useEffect(() => {
    if (isEditing && textRef.current) {
      textRef.current.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textRef.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing]);

  // Click ra ngoài để chốt sổ lưu Database
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.toolbar-container') || target.closest('.properties-panel') || wrapperRef.current?.contains(target)) return; 
      
      if (isEditing) {
        if (textRef.current) {
          updateBubble(bubble.id, { text: textRef.current.innerText });
        }
        setIsEditing(false);
        window.getSelection()?.removeAllRanges();
        setActiveBubble(null);
      }
    };
    if (isActive || isEditing) document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [isActive, isEditing, bubble.id, setActiveBubble, updateBubble]);


  // ==========================================
  // 🚀 1. THUẬT TOÁN KÉO THẢ (DRAG) BÙ TRỪ ZOOM
  // ==========================================
  const handleDragStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bubble.isLocked) setActiveBubble(bubble.id);
    if (isEditing || bubble.isLocked) return;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX = localPos.x;
    const startY = localPos.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (moveEvent.buttons === 0) {
        document.removeEventListener('mousemove', onMouseMove);
        return;
      }
      // Dùng Delta chia cho Zoom để chuột di chuyển mượt mà 1:1
      const dx = (moveEvent.clientX - startMouseX) / useToolStore.getState().currentZoom;
      const dy = (moveEvent.clientY - startMouseY) / useToolStore.getState().currentZoom;
      setLocalPos({ x: startX + dx, y: startY + dy });
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      const dx = (upEvent.clientX - startMouseX) / useToolStore.getState().currentZoom;
      const dy = (upEvent.clientY - startMouseY) / useToolStore.getState().currentZoom;
      updateBubble(bubble.id, { x: startX + dx, y: startY + dy }); // Lưu ZUSTAND
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };


  // ==========================================
  // 🚀 2. THUẬT TOÁN ĐỔI KÍCH THƯỚC (RESIZE) BÙ TRỪ ZOOM
  // ==========================================
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isEditing || bubble.isLocked) return;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startW = localSize.w;
    const startH = localSize.h;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startMouseX) / useToolStore.getState().currentZoom;
      const dy = (moveEvent.clientY - startMouseY) / useToolStore.getState().currentZoom;
      setLocalSize({ w: Math.max(40, startW + dx), h: Math.max(40, startH + dy) });
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      const dx = (upEvent.clientX - startMouseX) / useToolStore.getState().currentZoom;
      const dy = (upEvent.clientY - startMouseY) / useToolStore.getState().currentZoom;
      const newW = Math.max(40, startW + dx);
      const newH = Math.max(40, startH + dy);

      // Tự động scale cỡ chữ tỷ lệ thuận với khung
      const scaleX = newW / bubble.w;
      const scaleY = newH / bubble.h;
      const scaleFactor = (scaleX + scaleY) / 2;
      const newFontSize = Math.max(8, Math.min(Math.round(bubble.fontSize * scaleFactor), 150));

      updateBubble(bubble.id, { w: newW, h: newH, fontSize: newFontSize }); // Lưu ZUSTAND
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };


  // ==========================================
  // 🚀 3. THUẬT TOÁN XOAY GÓC (ROTATE)
  // ==========================================
  const handleRotateStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!wrapperRef.current || bubble.isLocked) return;

    const rect = wrapperRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startX = e.clientX;
    const startY = e.clientY;

    const startAngle = Math.atan2(startY - centerY, startX - centerX);
    const initialRotation = bubble.rotation || 0;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      let angleDiff = currentAngle - startAngle;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      
      let newRotation = initialRotation + angleDiff * (180 / Math.PI);
      const snapThreshold = 5; 
      const nearest45 = Math.round(newRotation / 45) * 45;
      if (Math.abs(newRotation - nearest45) < snapThreshold) newRotation = nearest45;

      updateBubble(bubble.id, { rotation: newRotation });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };


  return (
    <div
      ref={wrapperRef}
      onMouseDown={handleDragStart}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!bubble.isLocked) setIsEditing(true);
      }}
      onMouseEnter={() => setHoveredBubble(bubble.id)}
      onMouseLeave={() => setHoveredBubble(null)}
      className={`absolute pointer-events-auto group ${isActive ? 'z-50' : 'z-40'}`}
      style={{
        // 🚀 CỐT LÕI NẰM Ở ĐÂY: DÙNG LEFT / TOP ĐỂ ĐỊNH VỊ CHUẨN XÁC 1:1 VỚI BACKEND
        left: `${localPos.x}px`,
        top: `${localPos.y}px`,
        width: `${localSize.w}px`,
        height: `${localSize.h}px`,
        transform: `rotate(${bubble.rotation || 0}deg)`,
        transformOrigin: 'center center'
      }}
    >
      {/* 1. KHUNG FOCUS BẢO VỆ */}
      <div 
        data-html2canvas-ignore="true" 
        className={`absolute inset-0 pointer-events-none transition-all duration-200 rounded-sm
          ${isActive && !isEditing ? 'border-2 border-indigo-500 bg-indigo-500/10' : ''}
          ${!isActive && !bubble.isLocked && isHovered ? 'border-2 border-indigo-400 border-dashed bg-indigo-400/10 shadow-lg' : ''}
          ${isEditing ? 'border-2 border-rose-500 bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : ''}
          ${!isActive && !isEditing && !isHovered && !bubble.isLocked ? 'border border-dashed border-gray-400/50' : ''} 
        `}
      />

      {/* 2. CẦN GẠT XOAY (TOP CENTER) */}
      {isActive && !isEditing && !bubble.isLocked && (
        <div data-html2canvas-ignore="true" className="absolute -top-10 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div 
            className="w-6 h-6 bg-white border border-indigo-500 rounded-full cursor-grab active:cursor-grabbing text-indigo-500 flex items-center justify-center shadow-md hover:scale-110 transition-transform"
            onMouseDown={handleRotateStart}
          >
            <RotateCw size={12} />
          </div>
          <div className="w-[1.5px] h-4 bg-indigo-500"></div>
        </div>
      )}

      {/* 3. NÚM KÉO KÍCH THƯỚC (BOTTOM RIGHT) */}
      {isActive && !isEditing && !bubble.isLocked && (
        <div 
          data-html2canvas-ignore="true"
          onMouseDown={handleResizeStart}
          className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-indigo-500 rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
        />
      )}

      {/* 4. TEXT ĐƯỢC ÉP GIỮA BẰNG CƠ CHẾ CỦA HTML CŨ */}
      <div className="w-full h-full flex items-center justify-center">
        <div
          ref={textRef}
          contentEditable={isEditing ? "plaintext-only" : false}
          suppressContentEditableWarning={true}
          onMouseDown={(e) => {
            if (isEditing) e.stopPropagation(); // Khóa kéo thả để cho phép bôi đen text
          }} 
          className={`w-full outline-none text-center break-words whitespace-pre-wrap
            ${bubble.isLocked ? 'cursor-not-allowed' : (isEditing ? 'cursor-text' : 'cursor-move')}
          `}
          style={{
            fontSize: `${bubble.fontSize}px`,
            lineHeight: 1.15, 
            color: bubble.fontColor,
            fontFamily: bubble.fontFamily,
            fontWeight: bubble.isBold ? 900 : 400,
            fontStyle: bubble.isItalic ? 'italic' : 'normal',
            textTransform: bubble.isUppercase ? 'uppercase' : 'none',
            WebkitTextStroke: `${bubble.outlineWidth ?? 0}px ${bubble.outlineColor || (bubble.fontColor === '#000000' ? '#ffffff' : '#000000')}`,
            textShadow: bubble.hasShadow ? '2px 4px 6px rgba(0,0,0,0.5)' : 'none',
            userSelect: isEditing ? 'text' : 'none',
            pointerEvents: isEditing ? 'auto' : 'none',
            paintOrder: 'stroke fill',
          }}
        >
          {bubble.text}
        </div>
      </div>
    </div>
  );
}