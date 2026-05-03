import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useToolStore } from '../../store/useToolStore';
import TextLayer from '../Editor/TextLayer';
import MangaCanvas from '../Editor/MangaCanvas'; // 🚀 Import Canvas

export default function Workspace() {
  const { fileQueue, currentIndex, processedUrls } = useProjectStore(); // Lấy thêm processedUrls
  const { currentZoom } = useToolStore();
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (currentIndex >= 0 && fileQueue[currentIndex]) {
      // 🚀 Ưu tiên lấy ảnh đã xử lý (Clean), nếu chưa dịch thì lấy ảnh gốc (Raw)
      if (processedUrls[currentIndex]) {
        setImgUrl(processedUrls[currentIndex]);
      } else {
        const url = URL.createObjectURL(fileQueue[currentIndex]);
        setImgUrl(url);
        return () => URL.revokeObjectURL(url); 
      }
    } else {
      setImgUrl(null);
    }
  }, [currentIndex, fileQueue, processedUrls]);

  return (
    <div className="flex-1 bg-[#0a0a0a] overflow-auto flex justify-center items-start p-6">
      {imgUrl ? (
        <div 
          id="workspace-container" // 🚀 THÊM ID NÀY ĐỂ NÚT EXPORT TÌM THẤY ẢNH
          className="relative shadow-[0_10px_30px_rgba(0,0,0,0.8)] border-2 border-gray-800 bg-black transition-transform duration-100"
          style={{ 
            transform: `scale(${currentZoom})`, 
            transformOrigin: 'top center'
          }}
        >
          {/* Ảnh nền hiển thị */}
          <img src={imgUrl} alt="Manga Page" className="block h-auto pointer-events-none select-none" />
          
          {/* Lớp vẽ Cọ */}
          <MangaCanvas imgUrl={imgUrl} />
          
          {/* Lớp bong bóng chữ */}
          <TextLayer />
        </div>
      ) : (
        <div className="text-gray-600 mt-20 flex flex-col items-center gap-4">
          <div className="text-6xl">🖼️</div>
          <h2 className="text-xl font-bold">Chưa có ảnh nào được chọn</h2>
          <p className="text-sm">Vui lòng bấm "Chọn RAW" trên thanh công cụ để bắt đầu.</p>
        </div>
      )}
    </div>
  );
}