import { Rnd } from 'react-rnd';
import { useCanvasStore, type TextBubble } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';

interface Props {
  bubble: TextBubble;
}

export default function BubbleNode({ bubble }: Props) {
  const { activeBubbleId, setActiveBubble, updateBubble } = useCanvasStore();
  const { currentZoom } = useToolStore();
  
  if (bubble.isHidden) return null;

  const isActive = activeBubbleId === bubble.id;
  
  // 🚀 THUẬT TOÁN ELIP TỪ DEEP RESEARCH: 
  // Tính toán bán trục A và B dựa trên công thức nhân với căn bậc 2 (khoảng 1.414)
  // Để Elip bao trọn hộp chữ, chiều rộng/cao của SVG phải gấp 1.414 lần hộp chữ
  const SQRT_2 = 1.4142;
  const svgWidth = bubble.w * SQRT_2;
  const svgHeight = bubble.h * SQRT_2;
  
  // Tính độ lệch (Offset) để căn giữa SVG phía sau hộp chữ
  const offsetX = (svgWidth - bubble.w) / 2;
  const offsetY = (svgHeight - bubble.h) / 2;

  // Lấy màu viền tương ứng với trạng thái
  const strokeColor = bubble.isLocked 
    ? "rgba(239, 68, 68, 0.5)" // Đỏ nếu bị khóa
    : isActive 
      ? "#6366f1" // Indigo nếu đang chọn
      : "rgba(255, 255, 255, 0.4)"; // Trắng mờ nếu bình thường

  return (
    <Rnd
      size={{ width: bubble.w, height: bubble.h }}
      position={{ x: bubble.x, y: bubble.y }}
      disableDragging={bubble.isLocked}
      enableResizing={!bubble.isLocked}
      onDragStop={(e: any, d: any) => updateBubble(bubble.id, { x: d.x, y: d.y })}
      onResizeStop={(e: any, direction: any, ref: any, delta: any, position: any) => {
        updateBubble(bubble.id, {
          w: parseInt(ref.style.width, 10),
          h: parseInt(ref.style.height, 10),
          ...position,
        });
      }}
      scale={currentZoom}
      onClick={(e: any) => {
        e.stopPropagation();
        if (!bubble.isLocked) setActiveBubble(bubble.id);
      }}
      className={`absolute flex items-center justify-center pointer-events-auto group ${isActive ? 'z-50' : 'z-40'}`}
    >
      
      {/* 🚀 LỚP NỀN: BONG BÓNG THOẠI HÌNH ELIP (SVG) CÓ ĐUÔI */}
      <svg 
        className="absolute pointer-events-none transition-all duration-200"
        style={{
          width: svgWidth,
          height: svgHeight,
          left: -offsetX,
          top: -offsetY,
          overflow: 'visible', // 🚀 Bắt buộc để cái đuôi được thò ra ngoài khung
          filter: isActive ? 'drop-shadow(0px 0px 8px rgba(99, 102, 241, 0.6))' : 'none'
        }}
      >
        {(() => {
          // Tính toán tọa độ trung tâm và bán kính
          const cx = svgWidth / 2;
          const cy = svgHeight / 2;
          const rx = (svgWidth / 2) - 2;
          const ry = (svgHeight / 2) - 2;

          // Thuật toán đường cong Bezier cho cái đuôi
          const tailLeft = `M ${cx - rx*0.2} ${cy + ry*0.85} Q ${cx - rx*0.6} ${cy + ry*1.3} ${cx - rx*1.1} ${cy + ry*1.4} Q ${cx - rx*0.7} ${cy + ry*1.1} ${cx - rx*0.6} ${cy + ry*0.65} Z`;
          const tailRight = `M ${cx + rx*0.2} ${cy + ry*0.85} Q ${cx + rx*0.6} ${cy + ry*1.3} ${cx + rx*1.1} ${cy + ry*1.4} Q ${cx + rx*0.7} ${cy + ry*1.1} ${cx + rx*0.6} ${cy + ry*0.65} Z`;

          return (
            <>
              {/* LỚP 1: VIỀN NGOÀI ĐEN (Đậm hơn nếu đang chọn) */}
              <g 
                stroke={strokeColor} 
                strokeWidth={isActive ? 5 : 3} 
                strokeDasharray={(!isActive && !bubble.isLocked) ? "5,5" : "none"} 
                strokeLinejoin="round" 
                strokeLinecap="round"
              >
                <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" />
                {bubble.tailDirection === 'left' && <path d={tailLeft} fill="none" />}
                {bubble.tailDirection === 'right' && <path d={tailRight} fill="none" />}
              </g>

              {/* LỚP 2: LÕI TRẮNG CHE ĐI ĐƯỜNG GIAO NHAU BÊN TRONG */}
              <g fill="rgba(255, 255, 255, 0.95)">
                <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
                {bubble.tailDirection === 'left' && <path d={tailLeft} />}
                {bubble.tailDirection === 'right' && <path d={tailRight} />}
              </g>
            </>
          );
        })()}
      </svg>

      {/* LỚP TRÊN CÙNG: Ô NHẬP CHỮ */}
      {/* LỚP TRÊN CÙNG: Ô NHẬP CHỮ */}
      <textarea
        value={bubble.text}
        onChange={(e) => updateBubble(bubble.id, { text: e.target.value })}
        disabled={bubble.isLocked}
        className={`relative z-10 w-full h-full bg-transparent resize-none outline-none text-center p-1 
          ${bubble.sfxClass || ''} 
          ${bubble.isLocked ? 'cursor-not-allowed' : 'cursor-text'}
          ${!bubble.isLocked && !isActive ? 'hover:bg-black/5 hover:border hover:border-dashed hover:border-gray-400/50' : ''}
        `}
        style={{
          fontSize: `${bubble.fontSize}px`,
          color: bubble.fontColor,
          fontFamily: bubble.fontFamily,
          lineHeight: '1.2',
          
          // 🚀 HIỆU ỨNG VIỀN CHỮ (STROKE) THẾ HỆ MỚI
          // Tự động nhận diện: Chữ đen thì viền trắng, chữ trắng thì viền đen
          WebkitTextStroke: `4px ${bubble.fontColor === '#000000' ? '#ffffff' : '#000000'}`,
          paintOrder: 'stroke fill',
          // Bỏ hẳn cái textShadow lởm chởm cũ đi
          textShadow: 'none' 
        }}
      />
      
    </Rnd>
  );
}