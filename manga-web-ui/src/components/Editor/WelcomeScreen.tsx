import { Upload, Wand2, Paintbrush, ScanText } from 'lucide-react';
import { mangaApi } from '../../services/api';
import { useProjectStore } from '../../store/useProjectStore';

export default function WelcomeScreen() {
  const projectStore = useProjectStore();

  // Hàm xử lý upload file được lấy thẳng từ Topbar sang đây cho tiện
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name));
      projectStore.setFiles(files);
      projectStore.setCurrentIndex(0);
      files.forEach(file => mangaApi.uploadRaw(file));
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-8 animate-in fade-in duration-700">
      
      {/* Khung Glassmorphism chính */}
      <div className="max-w-2xl w-full glass-panel rounded-2xl p-10 flex flex-col items-center text-center border border-border shadow-2xl relative overflow-hidden">
        
        {/* Ánh sáng hắt (Glow Effect) ảo diệu ở nền */}
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>

        {/* Icon Logo */}
        <div className="w-20 h-20 bg-background border border-border rounded-2xl flex items-center justify-center mb-6 shadow-inner relative z-10">
          <Wand2 size={40} className="text-primary" />
        </div>

        <h1 className="text-3xl font-bold text-text-main mb-3 relative z-10 tracking-tight">Manga AI Editor Workspace</h1>
        <p className="text-text-muted mb-8 max-w-md relative z-10 leading-relaxed">
          Nền tảng biên dịch và chỉnh sửa truyện tranh chuyên nghiệp. Tự động dịch thuật, xóa nền và phục hồi nét vẽ bằng sức mạnh của trí tuệ nhân tạo.
        </p>

        {/* Nút Call-to-Action to bản */}
        <label className="btn-primary px-8 py-4 text-lg rounded-xl shadow-lg shadow-primary/25 cursor-pointer hover:scale-105 transition-transform relative z-10">
          <Upload className="mr-2" size={24} /> Chọn Ảnh RAW Đang Chờ Dịch
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>

        {/* Thẻ Bento Grid giới thiệu tính năng */}
        <div className="grid grid-cols-3 gap-4 mt-12 w-full relative z-10">
          <div className="bg-background/60 border border-border/50 p-5 rounded-xl flex flex-col items-center hover:bg-panel transition-colors">
            <ScanText size={24} className="text-emerald-400 mb-3" />
            <h3 className="font-semibold text-sm text-text-main">Manga OCR</h3>
            <p className="text-xs text-text-muted mt-1 text-center">Bắt chữ tiếng Nhật cực nhạy dù nét vẽ rối</p>
          </div>
          <div className="bg-background/60 border border-border/50 p-5 rounded-xl flex flex-col items-center hover:bg-panel transition-colors">
            <Wand2 size={24} className="text-indigo-400 mb-3" />
            <h3 className="font-semibold text-sm text-text-main">DeepSeek LLM</h3>
            <p className="text-xs text-text-muted mt-1 text-center">Dịch thuật siêu việt am hiểu ngữ cảnh manga</p>
          </div>
          <div className="bg-background/60 border border-border/50 p-5 rounded-xl flex flex-col items-center hover:bg-panel transition-colors">
            <Paintbrush size={24} className="text-accent mb-3" />
            <h3 className="font-semibold text-sm text-text-main">LaMa Inpainting</h3>
            <p className="text-xs text-text-muted mt-1 text-center">Vẽ bù hậu cảnh thần thánh chuẩn ONNX</p>
          </div>
        </div>
      </div>

    </div>
  );
}