import { useProjectStore } from '../../store/useProjectStore';

export default function Sidebar() {
  // Lấy thêm hàm setCurrentIndex từ Store
  const { fileQueue, currentIndex, setCurrentIndex } = useProjectStore();

  return (
    <div className="w-64 bg-sidebar border-r border-gray-800 flex flex-col h-full shrink-0">
      <div className="p-4 font-bold border-b border-gray-800 text-white">
        📁 Danh Sách Trang ({fileQueue.length})
      </div>
      <div className="flex-1 overflow-y-auto">
        {fileQueue.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">Hãy chọn các ảnh Raw để bắt đầu...</div>
        ) : (
          fileQueue.map((file, idx) => (
             <div 
                key={idx} 
                onClick={() => setCurrentIndex(idx)} // 🚀 GẮN SỰ KIỆN CLICK VÀO ĐÂY
                className={`p-3 border-b border-gray-800 cursor-pointer flex items-center gap-2 transition-colors ${currentIndex === idx ? 'bg-secondary text-white border-l-4 border-l-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
             >
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-600 text-white">RAW</span>
                <span className="truncate">{file.name}</span>
             </div>
          ))
        )}
      </div>
    </div>
  );
}