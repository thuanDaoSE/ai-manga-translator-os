import { useState, useRef, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useCanvasStore, type TextBubble } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import { RotateCw } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { mangaApi } from '../../services/api';
// 🚀 IMPORT ENGINE VẼ CANVAS CỦA KONVA
import { Stage, Layer, Text as KonvaText } from 'react-konva';

interface Props {
  bubble: TextBubble;
}

export default function BubbleNode({ bubble: propBubble }: Props) {
  const { activeBubbleId, setActiveBubble, updateBubble, hoveredBubbleId, setHoveredBubble } = useCanvasStore();
  const { currentZoom } = useToolStore();
  
  const storeBubble = useCanvasStore(state => state.bubbles.find(b => b.id === propBubble.id));
  const bubble = storeBubble || propBubble;
  
  const [isEditing, setIsEditing] = useState(false);
  const isHovered = hoveredBubbleId === bubble.id;
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null); 
  
  // 🚀 STATE ĐỂ CANVAS CO GIÃN MƯỢT MÀ KHI KÉO RND
  const [localSize, setLocalSize] = useState({ w: bubble.w, h: bubble.h });
  
  useEffect(() => {
    setLocalSize({ w: bubble.w, h: bubble.h });
  }, [bubble.w, bubble.h]);

  if (bubble.isHidden) return null;
  const isActive = activeBubbleId === bubble.id;

  // Tự động focus khi gõ
  // 🚀 1. TỰ ĐỘNG FOCUS VÀ BÔI ĐEN CHỮ KHI VÀO CHẾ ĐỘ SỬA
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Dùng .select() thay vì .selectionStart để bôi đen toàn bộ chữ
      // Người dùng gõ phím là nó tự động đè lên chữ cũ, cực kỳ mượt!
      textareaRef.current.select(); 
    }
  }, [isEditing]);

  // 🚀 TỰ ĐỘNG BẬT CHẾ ĐỘ GÕ KHI VỪA BẤM "THÊM CHỮ" HOẶC CHỌN Ô CHỮ MỚI
  useEffect(() => {
    // Lưu ý: Sếp tự thay cái chữ 'Nhập chữ...' thành đúng cái chữ mặc định trong source của sếp nhé
    if (isActive && (bubble.text === 'Nhập chữ...' || bubble.text === 'Nhập văn bản...' || bubble.text === '')) {
      setIsEditing(true);
    }
  }, [isActive, bubble.text]); // 🚀 BẢN VÁ UX: Dạy cho nó biết phải theo dõi sự kiện Active!

  // Click ra ngoài để tắt Edit
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('.toolbar-container') || 
        target.closest('.properties-panel') || 
        wrapperRef.current?.contains(target) 
      ) {
        return; 
      }
      
      if (isEditing) {
        const projectStore = useProjectStore.getState();
        const currentPageId = projectStore.pageIds[projectStore.currentIndex];
        
        if (currentPageId) {
           mangaApi.savePageBubbles(currentPageId, useCanvasStore.getState().bubbles)
             .catch(err => console.error("Lỗi tự động lưu chữ:", err));
        }
        setIsEditing(false);
        setActiveBubble(null);
      }
    };

    if (isActive || isEditing) {
      document.addEventListener('mousedown', handleGlobalClick);
    }
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [isActive, isEditing, bubble.id, setActiveBubble]);

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

  // 🚀 TÍNH TOÁN STROKE VÀ BOLD CHO ENGINE CANVAS
  const baseStroke = bubble.outlineWidth !== undefined ? bubble.outlineWidth : 0;
  // Bơm nét béo (stroke) để làm giả Bold nếu font bị lỗi
  const extraBold = bubble.isBold ? 1 : 0; 
  const finalStroke = baseStroke + extraBold;
  const strokeColor = bubble.outlineColor || (bubble.fontColor === '#000000' ? '#ffffff' : '#000000');

  // Xác định Font Style cho Canvas
  const fontStyleStr = `${bubble.isItalic ? 'italic ' : ''}${bubble.isBold ? 'bold' : 'normal'}`.trim();
  const displayText = bubble.isUppercase ? bubble.text.toUpperCase() : bubble.text;

  return (
    <Rnd
      size={{ width: localSize.w, height: localSize.h }}
      position={{ x: bubble.x, y: bubble.y }}
      scale={currentZoom}
      disableDragging={isEditing || bubble.isLocked}
      enableResizing={!isEditing && !bubble.isLocked}
      onMouseEnter={() => setHoveredBubble(bubble.id)}
      onMouseLeave={() => setHoveredBubble(null)}
      // 🚀 CẬP NHẬT GIAO DIỆN MƯỢT MÀ KHI KÉO RESIZE
      onResize={(e, direction, ref) => {
        setLocalSize({
          w: parseInt(ref.style.width, 10),
          h: parseInt(ref.style.height, 10)
        });
      }}
      onDragStop={(_e, d) => updateBubble(bubble.id, { x: d.x, y: d.y })}
      onResizeStop={(_e, _direction, ref, _delta, position) => {
        const newWidth = parseInt(ref.style.width, 10);
        const newHeight = parseInt(ref.style.height, 10);

        // 🚀 THUẬT TOÁN ĐỒ HỌA: Tính toán cỡ chữ mới tỷ lệ thuận với độ tăng/giảm của khung kéo
        // Lấy tỷ lệ thay đổi trung bình giữa chiều rộng và chiều cao mới so với cũ
        const scaleX = newWidth / bubble.w;
        const scaleY = newHeight / bubble.h;
        const scaleFactor = (scaleX + scaleY) / 2;
        
        // Cỡ chữ mới = Cỡ chữ cũ nhân với tỷ lệ co giãn khung
        const newFontSize = Math.max(8, Math.min(Math.round(bubble.fontSize * scaleFactor), 150));

        // Cập nhật đồng thời khung vỏ VÀ cỡ chữ lõi vào kho dữ liệu để kích hoạt Auto-Save
        updateBubble(bubble.id, {
          w: newWidth,
          h: newHeight,
          fontSize: newFontSize, // 🚀 BẢN VÁ: Ép lưu kích cỡ chữ mới vào DB!
          ...position,
        });
      }}
      onClick={(e: any) => {
        e.stopPropagation();
        if (!bubble.isLocked) setActiveBubble(bubble.id);
      }}
      onDoubleClick={(e: any) => {
        e.stopPropagation();
        if (!bubble.isLocked) {
          setIsEditing(true);
        }
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
        {/* LỚP PHỦ GIAO DIỆN KHUNG BONG BÓNG */}
        <div 
          data-html2canvas-ignore="true" 
          className={`absolute inset-0 pointer-events-none transition-all duration-200 rounded-sm
            ${isActive && !isEditing ? 'border-2 border-indigo-500 border-dashed bg-indigo-500/10' : ''}
            ${!isActive && !bubble.isLocked && isHovered ? 'border-2 border-indigo-400 bg-indigo-400/20 shadow-lg' : ''}
            ${isEditing ? 'border-2 border-rose-500 bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : ''}
            
            {/* 🚀 BẢN VÁ UX: Thêm viền nét đứt mờ ảo khi ô chữ đang nằm im (Không hover, không active) */}
            ${!isActive && !isEditing && !isHovered && !bubble.isLocked ? 'border border-dashed border-gray-400/50' : ''} 
          `}
        />

        {isActive && !isEditing && !bubble.isLocked && (
          <div data-html2canvas-ignore="true" className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center">
            <div className="w-[1.5px] h-4 bg-indigo-500"></div>
            <div 
              className="w-7 h-7 bg-white border border-indigo-500 rounded-full cursor-grab active:cursor-grabbing text-indigo-500 flex items-center justify-center"
              onMouseDown={handleRotateMouseDown}
            >
              <RotateCw size={14} />
            </div>
          </div>
        )}

        <div 
          className={`relative z-10 w-full h-full flex items-center justify-center overflow-hidden
            ${bubble.isLocked ? 'cursor-not-allowed' : (isEditing ? 'cursor-text' : 'cursor-move')}
          `}
          onMouseDown={(e: any) => {
            if (isEditing) {
              e.preventDefault();
              textRef.current?.focus();
            }
          }}
        >
          <div
            ref={textRef}
            contentEditable={isEditing}
            suppressContentEditableWarning={true}
            onMouseDown={(e: any) => isEditing && e.stopPropagation()} 
            onPaste={handlePaste} 
            onKeyDown={handleKeyDown}
            
            // 🚀 BẢN VÁ CĂN GIỮA: Ép thành block, bỏ leading-tight để fix trục Y
            className="w-full outline-none text-center break-words whitespace-pre-wrap pointer-events-auto block"
            
            style={{
              fontSize: `${bubble.fontSize}px`,
              lineHeight: 1.15, // 🚀 Chuẩn khoảng cách dòng Manga, không bị lẹm trên/dưới
              
              color: bubble.fontColor,
              fontFamily: bubble.fontFamily,
              fontWeight: bubble.isBold ? 900 : 400,
              fontStyle: bubble.isItalic ? 'italic' : 'normal',
              textTransform: bubble.isUppercase ? 'uppercase' : 'none',
              WebkitTextStroke: `${bubble.outlineWidth ?? 0}px ${bubble.outlineColor || (bubble.fontColor === '#000000' ? '#ffffff' : '#000000')}`,
              textShadow: bubble.hasShadow ? '2px 4px 6px rgba(0,0,0,0.5)' : 'none',
              
              userSelect: isEditing ? 'text' : 'none',
              paintOrder: 'stroke fill',
            }}
          >
            {bubble.text}
          </div>
        </div>
      </div> 
    </Rnd>
  );
}