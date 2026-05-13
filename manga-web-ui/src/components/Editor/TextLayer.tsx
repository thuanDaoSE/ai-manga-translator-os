// src/components/Editor/TextLayer.tsx
import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import BubbleNode from './BubbleNode';
import FloatingTextToolbar from './FloatingTextToolbar';

export default function TextLayer() {
  const { bubbles } = useCanvasStore();
  const { showText } = useToolStore();

  if (!showText) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      {bubbles.map(bubble => (
        <BubbleNode key={bubble.id} bubble={bubble} />
      ))}
      
      {/* 🚀 BẢN VÁ: Thêm pointer-events-auto ở đây */}
      <div className="pointer-events-auto">
        <FloatingTextToolbar />
      </div>
    </div>
  );
}