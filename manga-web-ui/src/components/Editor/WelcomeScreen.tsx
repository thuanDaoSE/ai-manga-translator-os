import { useState } from 'react';
import { Upload, Wand2, Paintbrush, ScanText } from 'lucide-react';
import { mangaApi } from '../../services/api';
import { useProjectStore } from '../../store/useProjectStore';
import { useAuthStore } from '../../store/useAuthStore'; 
import PolicyModal from '../Modals/PolicyModal'; // 🚀 1. Import Modal Chính sách vào đây

export default function WelcomeScreen() {
  const projectStore = useProjectStore();
  
  // 🚀 2. KHAI BÁO STATE QUẢN LÝ ĐỒNG Ý CHÍNH SÁCH
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [isAgreed, setIsAgreed] = useState(() => {
  return localStorage.getItem('manga_policy_agreed') === 'true';
});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // CHỐT CHẶN BẢO MẬT: Kiểm tra đăng nhập ngay tại cửa
    const session = useAuthStore.getState().session;
    if (!session) {
      import('react-hot-toast').then(module => module.default.error("Vui lòng đăng nhập để tạo không gian làm việc và tải ảnh lên!"));
      e.target.value = ''; // Reset input
      return;
    }

    if (e.target.files && e.target.files.length > 0) {  
      const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name));

      if (files.length > 20) {
         import('react-hot-toast').then(module => module.default.error("Để đảm bảo tốc độ, chỉ hỗ trợ tải lên tối đa 20 trang mỗi lần!"));
         e.target.value = '';
         return;
      }
      
      // Kiểm tra dung lượng 10MB ngay tại cửa
      const badFile = files.find(f => f.size > 10 * 1024 * 1024);
      if (badFile) {
         import('react-hot-toast').then(module => module.default.error(`File ${badFile.name} vượt quá 10MB!`));
         e.target.value = '';
         return;
      }
      
      projectStore.uploadProjectFiles(files);
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

        {/* 🚀 3. CHÈN CHECKBOX VÀO ĐÂY (Ngay trên nút Upload) */}
        <div className="flex items-start gap-3 bg-background/50 p-4 rounded-xl border border-border max-w-lg w-full mb-6 relative z-10 text-left shadow-inner">
          <input 
  type="checkbox" 
  id="policy-checkbox"
  checked={isAgreed}
  onChange={(e) => {
    // 🚀 BẢN VÁ TỰ GHI NHỚ VÀO Ổ CỨNG TRÌNH DUYỆT
    setIsAgreed(e.target.checked);
    localStorage.setItem('manga_policy_agreed', e.target.checked ? 'true' : 'false');
  }}
  className="mt-1 w-4 h-4 cursor-pointer accent-emerald-500 shrink-0"
/>
          <label htmlFor="policy-checkbox" className="text-xs text-text-muted cursor-pointer select-none leading-relaxed">
            Tôi đã đọc, hiểu và đồng ý với các{' '}
            <button 
              onClick={(e) => { e.preventDefault(); setIsPolicyOpen(true); }} 
              className="text-emerald-400 font-bold hover:underline"
            >
              Điều khoản & Chính sách
            </button>
            {' '}của hệ thống. Tôi cam kết tự chịu trách nhiệm về bản quyền của các hình ảnh tải lên.
          </label>
        </div>

        {/* 🚀 4. Nút Call-to-Action (Sẽ BỊ KHÓA nếu chưa tích Checkbox) */}
        <label className={`btn-primary px-8 py-4 text-lg rounded-xl shadow-lg transition-transform relative z-10 
          ${!isAgreed 
            ? 'opacity-50 cursor-not-allowed grayscale' 
            : 'shadow-primary/25 cursor-pointer hover:scale-105'
          }`}
        >
          <Upload className="mr-2" size={24} /> Chọn Ảnh RAW Đang Chờ Dịch
          {/* Chặn upload nếu chưa đồng ý */}
          <input 
            type="file" 
            multiple 
            accept="image/jpeg, image/png, image/webp" 
            className="hidden" 
            disabled={!isAgreed} 
            onChange={handleFileChange} 
          />
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

      {/* 🚀 5. GẮN CỬA SỔ POLICY VÀO ĐÂY */}
      <PolicyModal 
        isOpen={isPolicyOpen} 
        onClose={() => setIsPolicyOpen(false)} 
      />
    </div>
  );
}