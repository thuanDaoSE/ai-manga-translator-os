import React from 'react';
import { useToolStore } from '../../store/useToolStore'; 
import { useCanvasStore } from '../../store/useCanvasStore';

const VisualGuideOverlay: React.FC = () => {
  const activeMode = useToolStore((state) => state.activeMode);
  // 🚀 LẤY BIẾN SHOW BẬT/TẮT TỪ STORE
  const showAiGuides = useToolStore((state) => state.showAiGuides);
  const bubbles = useCanvasStore((state) => state.bubbles);

  // 🚀 LOGIC MỚI: Chỉ hiện khi bật nút "Hiện vùng thay đổi"
  if (!showAiGuides) {
    return null; 
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
      {bubbles.map((bubble, index) => {
         const boxKey = bubble.id ?? `guide-marker-${index}-${bubble.x}-${bubble.y}`;
         
         // Ưu tiên dùng tọa độ rawBox (tọa độ gốc) nếu có, không thì lấy tọa độ bubble
         const x = bubble.rawBox?.x1 ?? bubble.x;
         const y = bubble.rawBox?.y1 ?? bubble.y;
         const w = bubble.rawBox ? (bubble.rawBox.x2 - bubble.rawBox.x1) : bubble.w;
         const h = bubble.rawBox ? (bubble.rawBox.y2 - bubble.rawBox.y1) : bubble.h;
         
         // Mở rộng viền ra 1 chút vì AI thường xóa rộng hơn chữ
         const pad = 4; 

         return (
           <div
             key={boxKey}
             style={{
               position: 'absolute', 
               left: `${x - pad}px`, 
               top: `${y - pad}px`,
               width: `${w + (pad * 2)}px`, 
               height: `${h + (pad * 2)}px`,
             }}
             // 🚀 BẢN VÁ: Tăng độ dày viền 2px, đỏ tươi hơn và thêm bóng mờ (drop-shadow) để nổi bật trên mọi nền
             className="border-2 border-dashed border-red-500/80 drop-shadow-md rounded-sm pointer-events-none"
           />
         );
      })}
    </div>
  );
};

export default React.memo(VisualGuideOverlay);