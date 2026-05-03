import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import BubbleNode from './BubbleNode';

export default function TextLayer() {
  const { bubbles } = useCanvasStore();
  const { showText } = useToolStore();

  if (!showText) return null;

  return (
    // 🚀 BÍ QUYẾT 1: Thêm pointer-events-none để chuột xuyên qua lớp này xuống Canvas
    <div className="absolute inset-0 z-40 pointer-events-none">
      {bubbles.map(bubble => (
        <BubbleNode key={bubble.id} bubble={bubble} />
      ))}
    </div>
  );
}