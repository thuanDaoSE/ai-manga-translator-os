import { Rnd } from 'react-rnd';
import { useCanvasStore, type TextBubble } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';

interface Props {
  bubble: TextBubble;
}

export default function BubbleNode({ bubble }: Props) {
  const { activeBubbleId, setActiveBubble, updateBubble } = useCanvasStore();
  const { currentZoom } = useToolStore();
  
  const isActive = activeBubbleId === bubble.id;

  return (
    <Rnd
      size={{ width: bubble.w, height: bubble.h }}
      position={{ x: bubble.x, y: bubble.y }}
      onDragStop={(e, d) => updateBubble(bubble.id, { x: d.x, y: d.y })}
      onResizeStop={(e, direction, ref, delta, position) => {
        updateBubble(bubble.id, {
          w: parseInt(ref.style.width, 10),
          h: parseInt(ref.style.height, 10),
          ...position,
        });
      }}
      scale={currentZoom} // Bù trừ chống giật khi đang Zoom
      onClick={(e: any) => {
        e.stopPropagation();
        setActiveBubble(bubble.id);
      }}
      // 🚀 BÍ QUYẾT 2: Thêm pointer-events-auto vào className
      className={`absolute flex items-center justify-center cursor-move border-2 pointer-events-auto ${isActive ? 'border-green-500 bg-green-500/10 z-50 shadow-[0_0_15px_rgba(0,255,0,0.5)]' : 'border-dashed border-white/40 bg-white/5 z-40'}`}
    >
      <textarea
        value={bubble.text}
        onChange={(e) => updateBubble(bubble.id, { text: e.target.value })}
        // 🚀 CẬP NHẬT className ĐỂ NHẬN HIỆU ỨNG SFX
        className={`w-full h-full bg-transparent resize-none outline-none text-center overflow-hidden cursor-text p-1 ${bubble.sfxClass || ''}`}
        style={{
          fontSize: `${bubble.fontSize}px`,
          color: bubble.fontColor,
          fontFamily: bubble.fontFamily,
          lineHeight: '1.2',
          textShadow: '2px 2px 0 #fff, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 0px 0px 4px rgba(255, 255, 255, 0.8)'
        }}
      />
    </Rnd>
  );
}