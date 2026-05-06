import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useToolStore } from '../../store/useToolStore';
import TextLayer from '../Editor/TextLayer';
import MangaCanvas from '../Editor/MangaCanvas';
import FloatingTextToolbar from '../Editor/FloatingTextToolbar';
import WelcomeScreen from '../Editor/WelcomeScreen';

export default function Workspace() {
  // 🚀 Bổ sung thêm fileQueue để lấy ảnh gốc
  const { currentIndex, processedUrls, fileQueue } = useProjectStore();
  const { currentZoom, activeMode, brushSize, setBrushSize } = useToolStore(); 
  
  // 🚀 Tạo state để lưu URL ảnh xem trước
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 🚀 Logic tự động tạo ảnh hiển thị tạm thời khi chưa dịch
  useEffect(() => {
    const file = fileQueue[currentIndex];
    if (file && !processedUrls[currentIndex]) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url); // Dọn dẹp RAM khi đổi ảnh
    } else {
      setPreviewUrl(null);
    }
  }, [currentIndex, fileQueue, processedUrls]);

  // Nếu có ảnh đã dịch thì dùng, chưa có thì dùng ảnh Preview
  const imgUrl = processedUrls[currentIndex] || previewUrl;

  return (
    <div className="flex-1 bg-background overflow-auto flex justify-center items-start p-6 relative"> 
      
      {(activeMode === 'erase' || activeMode === 'restore' || activeMode === 'redraw') && (
        <div className="hidden [@media(pointer:coarse)]:flex fixed left-6 top-1/2 -translate-y-1/2 z-50 bg-panel/80 backdrop-blur-md p-3 rounded-full flex-col items-center gap-3 shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-border animate-in slide-in-from-left-8">
           <span className="text-[9px] font-black tracking-widest text-text-muted">SIZE</span>
           <span className="text-sm font-black text-primary">{brushSize}</span>
           <input
             type="range"
             min="5" max="150"
             value={brushSize}
             onChange={(e) => setBrushSize(Number(e.target.value))}
             className="h-48 w-1.5 accent-primary cursor-ns-resize"
             style={{ WebkitAppearance: 'slider-vertical', writingMode: 'vertical-lr', direction: 'rtl' }}
           />
        </div>
      )}

      {imgUrl ? (
        <div 
          id="workspace-container"
          className="relative shadow-2xl transition-transform duration-100"
          style={{ 
            transform: `scale(${currentZoom})`, 
            transformOrigin: 'top center'
          }}
        >
          <img src={imgUrl} alt="Manga Page" className="block h-auto pointer-events-none select-none" />
          <MangaCanvas imgUrl={imgUrl} />
          <TextLayer />
          <FloatingTextToolbar />
        </div>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  );
}