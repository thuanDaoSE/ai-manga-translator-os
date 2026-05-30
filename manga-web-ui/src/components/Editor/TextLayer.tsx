import { useEffect, useState } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import BubbleNode from './BubbleNode';
import FloatingTextToolbar from './FloatingTextToolbar';

export default function TextLayer() {
  const { bubbles } = useCanvasStore();
  const { showText } = useToolStore();
  
  // 🚀 BỘ NHỚ LƯU TỶ LỆ THU NHỎ CỦA CANVAS
  const [layout, setLayout] = useState({ w: 0, h: 0, scaleX: 1, scaleY: 1 });

  useEffect(() => {
    // 1. Tìm cái Canvas đang hiển thị ảnh
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    // 2. Hàm đo đạc tỷ lệ giữa Kích thước Thật và Kích thước CSS
    const syncScale = () => {
      const rect = canvas.getBoundingClientRect();
      if (canvas.width > 0 && canvas.height > 0) {
        setLayout({
          w: canvas.width,
          h: canvas.height,
          scaleX: rect.width / canvas.width,
          scaleY: rect.height / canvas.height
        });
      }
    };

    // 3. Theo dõi liên tục nếu sếp kéo dãn cửa sổ
    const observer = new ResizeObserver(syncScale);
    observer.observe(canvas);
    syncScale();

    return () => observer.disconnect();
  }, [bubbles.length]); 

  if (!showText) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-visible">
      {/* 🚀 LỚP BỌC MA THUẬT: Ép toàn bộ chữ thu nhỏ/phóng to khớp 100% với Canvas */}
      <div 
        className="absolute top-0 left-0 origin-top-left pointer-events-none"
        style={{
          width: `${layout.w}px`,
          height: `${layout.h}px`,
          transform: `scale(${layout.scaleX}, ${layout.scaleY})`
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