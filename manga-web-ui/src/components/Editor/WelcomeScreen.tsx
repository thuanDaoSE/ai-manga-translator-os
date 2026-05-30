import { useState } from 'react';
import { Upload, Wand2, Paintbrush, ScanText, FolderArchive } from 'lucide-react'; // 🚀 Thêm icon FolderArchive
import { mangaApi } from '../../services/api';
import { useProjectStore } from '../../store/useProjectStore';
import { useAuthStore } from '../../store/useAuthStore'; 
import PolicyModal from '../Modals/PolicyModal'; 
import toast from 'react-hot-toast'; // 🚀 Thêm thư viện toast

export default function WelcomeScreen() {
  const projectStore = useProjectStore();
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [isAgreed, setIsAgreed] = useState(() => {
    return localStorage.getItem('manga_policy_agreed') === 'true';
  });

  const checkAuth = () => {
    const session = useAuthStore.getState().session;
    if (!session) {
      toast.error("Vui lòng đăng nhập để sử dụng tính năng này!");
      return false;
    }
    return true;
  };

  // HÀM 1: UPLOAD ẢNH RAW MỚI TỪ ĐẦU
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!checkAuth()) { e.target.value = ''; return; }

    if (e.target.files && e.target.files.length > 0) {  
      const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name));

      if (files.length > 20) {
         toast.error("Để đảm bảo tốc độ, chỉ hỗ trợ tải lên tối đa 20 trang mỗi lần!");
         e.target.value = ''; return;
      }
      const badFile = files.find(f => f.size > 10 * 1024 * 1024);
      if (badFile) {
         toast.error(`File ${badFile.name} vượt quá 10MB!`);
         e.target.value = ''; return;
      }
      projectStore.uploadProjectFiles(files);
    }
  };

  // 🚀 HÀM 2: IMPORT FILE .MANGA TỪ MÀN HÌNH CHỜ
  const handleImportManga = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!checkAuth()) { e.target.value = ''; return; }

    const file = e.target.files?.[0];
    if (!file) return;

    const loadId = toast.loading(`Đang khôi phục: ${file.name}...`);
    try {
      // 1. Tạo ngay một dự án mới lấy tên là tên của file luôn
      const projectName = file.name.replace('.manga', '');
      const newProject = await mangaApi.createProject(projectName);
      projectStore.setProjectId(newProject.id);

      // 2. Bắn API import file manga vào cái dự án vừa tạo
      await mangaApi.importManga(newProject.id, file);

      toast.success("Khôi phục thành công! Đang tải...", { id: loadId });
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      toast.error(error.message || "Lỗi khôi phục", { id: loadId });
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-8 animate-in fade-in duration-700">
      <div className="max-w-2xl w-full glass-panel rounded-2xl p-10 flex flex-col items-center text-center border border-border shadow-2xl relative overflow-hidden">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="w-20 h-20 bg-background border border-border rounded-2xl flex items-center justify-center mb-6 shadow-inner relative z-10">
          <Wand2 size={40} className="text-primary" />
        </div>

        <h1 className="text-3xl font-bold text-text-main mb-3 relative z-10 tracking-tight">Manga AI Editor Workspace</h1>
        <p className="text-text-muted mb-8 max-w-md relative z-10 leading-relaxed">
          Nền tảng biên dịch và chỉnh sửa truyện tranh chuyên nghiệp. Tự động dịch thuật, xóa nền và phục hồi nét vẽ bằng sức mạnh của AI.
        </p>

        <div className="flex items-start gap-3 bg-background/50 p-4 rounded-xl border border-border max-w-lg w-full mb-6 relative z-10 text-left shadow-inner">
          <input 
            type="checkbox" 
            id="policy-checkbox"
            checked={isAgreed}
            onChange={(e) => {
              setIsAgreed(e.target.checked);
              localStorage.setItem('manga_policy_agreed', e.target.checked ? 'true' : 'false');
            }}
            className="mt-1 w-4 h-4 cursor-pointer accent-emerald-500 shrink-0"
          />
          <label htmlFor="policy-checkbox" className="text-xs text-text-muted cursor-pointer select-none leading-relaxed">
            Tôi đã đọc, hiểu và đồng ý với các{' '}
            <button onClick={(e) => { e.preventDefault(); setIsPolicyOpen(true); }} className="text-emerald-400 font-bold hover:underline">
              Điều khoản & Chính sách
            </button>
            {' '}của hệ thống. Tôi cam kết tự chịu trách nhiệm về bản quyền của các hình ảnh tải lên.
          </label>
        </div>

        {/* 🚀 ĐÃ CHIA LÀM 2 NÚT RÕ RÀNG */}
        <div className={`flex items-center gap-4 w-full max-w-lg relative z-10 transition-all ${!isAgreed ? 'opacity-50 grayscale' : ''}`}>
          
          {/* Nút Upload RAW */}
          <label className={`flex-1 flex flex-col items-center justify-center py-4 bg-primary hover:bg-primary-hover text-white rounded-xl shadow-lg transition-transform ${isAgreed ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-not-allowed'}`}>
            <Upload size={24} className="mb-2" /> 
            <span className="font-bold">Dự án Mới</span>
            <span className="text-[10px] opacity-80 mt-1">Tải ảnh RAW lên</span>
            <input 
              type="file" multiple accept="image/jpeg, image/png, image/webp" 
              className="hidden" disabled={!isAgreed} onChange={handleFileChange} 
            />
          </label>

          {/* Nút Import .manga */}
          <label className={`flex-1 flex flex-col items-center justify-center py-4 bg-panel hover:bg-background border-2 border-border text-text-main rounded-xl shadow-lg transition-transform ${isAgreed ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-not-allowed'}`}>
            <FolderArchive size={24} className="mb-2 text-indigo-400" /> 
            <span className="font-bold">Khôi phục</span>
            <span className="text-[10px] opacity-60 mt-1">Từ file .manga</span>
            <input 
              type="file" accept=".manga" 
              className="hidden" disabled={!isAgreed} onChange={handleImportManga} 
            />
          </label>
          
        </div>

        <div className="grid grid-cols-3 gap-4 mt-12 w-full relative z-10">
          <div className="bg-background/60 border border-border/50 p-5 rounded-xl flex flex-col items-center hover:bg-panel transition-colors">
            <ScanText size={24} className="text-emerald-400 mb-3" />
            <h3 className="font-semibold text-sm text-text-main">Manga OCR</h3>
          </div>
          <div className="bg-background/60 border border-border/50 p-5 rounded-xl flex flex-col items-center hover:bg-panel transition-colors">
            <Wand2 size={24} className="text-indigo-400 mb-3" />
            <h3 className="font-semibold text-sm text-text-main">DeepSeek LLM</h3>
          </div>
          <div className="bg-background/60 border border-border/50 p-5 rounded-xl flex flex-col items-center hover:bg-panel transition-colors">
            <Paintbrush size={24} className="text-accent mb-3" />
            <h3 className="font-semibold text-sm text-text-main">LaMa Inpaint</h3>
          </div>
        </div>
      </div>

      <PolicyModal isOpen={isPolicyOpen} onClose={() => setIsPolicyOpen(false)} />
    </div>
  );
}