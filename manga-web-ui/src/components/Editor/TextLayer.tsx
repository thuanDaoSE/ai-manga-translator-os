import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import BubbleNode from './BubbleNode';
import FloatingTextToolbar from './FloatingTextToolbar';

interface TextLayerProps {
  imgWidth: number;
  imgHeight: number;
}

export default function TextLayer({ imgWidth, imgHeight }: TextLayerProps) {
  const { bubbles } = useCanvasStore();
  const { showText } = useToolStore();

  if (!showText) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-visible">
      {/* 🚀 FIX: Khóa cứng kích thước 1:1 với ảnh gốc, KHÔNG scale thêm */}
      <div 
        className="absolute top-0 left-0 pointer-events-none"
        style={{
          width: imgWidth > 0 ? `${imgWidth}px` : '100%',
          height: imgHeight > 0 ? `${imgHeight}px` : '100%',
        }}
      >
        {bubbles.map(bubble => (
          <BubbleNode 
            key={bubble.id} 
            bubble={bubble} 
          />
        ))}
      </div>
      
      <div className="pointer-events-auto">
        <FloatingTextToolbar />
      </div>
    </div>
  );
}