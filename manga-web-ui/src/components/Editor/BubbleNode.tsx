import { useState, useRef, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useCanvasStore, type TextBubble } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import { RotateCw } from 'lucide-react';

interface Props {
  bubble: TextBubble;
}

export default function BubbleNode({ bubble }: Props) {
  const { activeBubbleId, setActiveBubble, updateBubble, hoveredBubbleId, setHoveredBubble } = useCanvasStore();
  const { currentZoom } = useToolStore();
  
  const [isEditing, setIsEditing] = useState(false);
  const isHovered = hoveredBubbleId === bubble.id;
  
  // 🚀 LƯU TỌA ĐỘ CHUỘT LÚC CLICK ĐÚP ĐỂ ĐẶT CON TRỎ
  const [editClickPos, setEditClickPos] = useState<{x: number, y: number} | null>(null);
  
  const textRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null); 
  
  if (bubble.isHidden) return null;
  const isActive = activeBubbleId === bubble.id;

  // 🚀 ĐỊNH VỊ CON TRỎ VÀO ĐÚNG TỌA ĐỘ CHUỘT THAY VÌ BÔI ĐEN
  useEffect(() => {
    if (isEditing && textRef.current) {
      setTimeout(() => {
        if (!textRef.current) return;
        textRef.current.focus();

        if (editClickPos) {
          let range = null;
          // Dùng API trình duyệt để dò tìm vị trí văn bản từ tọa độ X/Y
          if (document.caretRangeFromPoint) {
            // Dành cho Chrome, Safari, Edge
            range = document.caretRangeFromPoint(editClickPos.x, editClickPos.y);
          } else if ((document as any).caretPositionFromPoint) {
            // Dành cho Firefox
            const pos = (document as any).caretPositionFromPoint(editClickPos.x, editClickPos.y);
            if (pos) {
              range = document.createRange();
              range.setStart(pos.offsetNode, pos.offset);
              range.collapse(true);
            }
          }

          // Áp dụng con trỏ vào đúng vị trí tìm được
          if (range) {
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
      }, 0);
    }
  }, [isEditing, editClickPos]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      if (target.closest('.toolbar-container')) {
    return;
  }
      // 🚀 BẢN VÁ: Cho phép click vào bảng thuộc tính và sidebar mà không mất focus chữ
      if (
        target.closest('.toolbar-container') || 
        target.closest('.properties-panel') || 
        target.closest('.sidebar') || 
        target.closest('.bg-sidebar') || // Thêm Sidebar trái
        target.closest('.bg-panel') ||    // Thêm Topbar
        wrapperRef.current?.contains(target) 
      ) {
        return; 
      }
      
      if (textRef.current) {
        updateBubble(bubble.id, { text: textRef.current.innerText });
      }
      setIsEditing(false);
      window.getSelection()?.removeAllRanges();
      setActiveBubble(null);
    };

    if (isActive || isEditing) {
      document.addEventListener('mousedown', handleGlobalClick);
    }
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [isActive, isEditing, bubble.id, updateBubble, setActiveBubble]);

  const handleRotateMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!wrapperRef.current) return;

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
      if (Math.abs(newRotation - nearest45) < snapThreshold) {
        newRotation = nearest45;
      }

      updateBubble(bubble.id, { rotation: newRotation });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };
  
  const ResizeHandle = () => (
    <div data-html2canvas-ignore="true" className="w-full h-full flex items-center justify-center">
      <div className="w-2.5 h-2.5 bg-white border border-indigo-500 rounded-full shadow-sm" />
    </div>
  );

  return (
    <Rnd
      size={{ width: bubble.w, height: bubble.h }}
      position={{ x: bubble.x, y: bubble.y }}
      scale={currentZoom}
      disableDragging={isEditing || bubble.isLocked}
      enableResizing={!isEditing && !bubble.isLocked}
      onMouseEnter={() => setHoveredBubble(bubble.id)}
      onMouseLeave={() => setHoveredBubble(null)}
      onDragStop={(_e, d) => updateBubble(bubble.id, { x: d.x, y: d.y })}
      onResizeStop={(_e, _direction, ref, _delta, position) => {
        updateBubble(bubble.id, {
          w: parseInt(ref.style.width, 10),
          h: parseInt(ref.style.height, 10),
          ...position,
        });
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!bubble.isLocked) setActiveBubble(bubble.id);
      }}
      // 🚀 BẮT TỌA ĐỘ X,Y CỦA CHUỘT LÚC CLICK ĐÚP
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!bubble.isLocked) {
          setEditClickPos({ x: e.clientX, y: e.clientY });
          setIsEditing(true);
        }
      }}
      resizeHandleStyles={{
        top: { height: '24px', top: '-12px' },
        bottom: { height: '24px', bottom: '-12px' },
        left: { width: '24px', left: '-12px' },
        right: { width: '24px', right: '-12px' },
        bottomRight: { width: '24px', height: '24px', right: '-12px', bottom: '-12px' },
        bottomLeft: { width: '24px', height: '24px', left: '-12px', bottom: '-12px' },
        topRight: { width: '24px', height: '24px', right: '-12px', top: '-12px' },
        topLeft: { width: '24px', height: '24px', left: '-12px', top: '-12px' }
      }}
      resizeHandleComponent={
        isActive && !isEditing && !bubble.isLocked ? {
          bottomRight: <ResizeHandle />, bottomLeft: <ResizeHandle />,
          topRight: <ResizeHandle />, topLeft: <ResizeHandle />
        } : undefined
      }
      className={`absolute flex items-center justify-center pointer-events-auto group ${isActive ? 'z-50' : 'z-40'}`}
    >
      <div 
        ref={wrapperRef}
        className="relative w-full h-full flex items-center justify-center"
        style={{ transform: `rotate(${bubble.rotation || 0}deg)` }}
      >
        
        <div 
          data-html2canvas-ignore="true" 
          className={`absolute inset-0 pointer-events-none transition-all duration-200 rounded-sm
            ${isActive && !isEditing ? 'border-2 border-indigo-500 border-dashed bg-indigo-500/10' : ''}
            ${!isActive && !bubble.isLocked && isHovered ? 'border-2 border-indigo-400 bg-indigo-400/20 shadow-lg' : ''} /* 🚀 Thêm dòng này để phát sáng */
            ${!isActive && !bubble.isLocked && !isHovered ? 'border border-dashed border-gray-400/60 bg-white/5' : ''}
            ${isEditing ? 'border-2 border-rose-500 bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : ''}
          `}
        />

        {isActive && !isEditing && !bubble.isLocked && (
          <div data-html2canvas-ignore="true" className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center">
            <div className="w-[1.5px] h-4 bg-indigo-500"></div>
            <div 
              className="w-7 h-7 bg-white border border-indigo-500 rounded-full cursor-grab active:cursor-grabbing hover:scale-110 transition-transform shadow-md pointer-events-auto flex items-center justify-center text-indigo-500"
              onMouseDown={handleRotateMouseDown}
              title="Kéo để xoay"
            >
              <RotateCw size={14} />
            </div>
          </div>
        )}

        <div
          ref={textRef}
          contentEditable={isEditing ? "plaintext-only" : false}
          onMouseDown={(e) => isEditing && e.stopPropagation()} 
          suppressContentEditableWarning
          className={`relative z-10 w-full h-full outline-none text-center break-words leading-tight flex items-center justify-center
            ${bubble.isLocked ? 'cursor-not-allowed' : (isEditing ? 'cursor-text' : 'cursor-move')}
          `}
          style={{
            fontSize: `${bubble.fontSize}px`,
            color: bubble.fontColor,
            fontFamily: bubble.fontFamily,
            pointerEvents: isEditing ? 'auto' : 'none',
            userSelect: isEditing ? 'text' : 'none',
            // @ts-ignore
            textBoxTrim: 'both',
            // @ts-ignore
            textBoxEdge: 'cap alphabetic',
            WebkitTextStroke: `4px ${bubble.fontColor === '#000000' ? '#ffffff' : '#000000'}`,
            paintOrder: 'stroke fill',
            textShadow: 'none' 
          }}
        >
          {bubble.text}
        </div>
      </div>
    </Rnd>
  );
}