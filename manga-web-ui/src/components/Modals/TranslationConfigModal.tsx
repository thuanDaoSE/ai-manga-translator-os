import React, { useEffect } from 'react';
import { useConfigStore } from '../../store/useConfigStore';
import { Settings2, X, BookOpen, Mic2, Users, Save, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TranslationConfigModal() {
  const config = useConfigStore();

  useEffect(() => {
    config.loadFromLocal();
  }, []);

  if (!config.isModalOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 🛡️ CHỐT CHẶN 1: Giới hạn dung lượng (Tối đa 2MB cho file văn bản)
    if (file.size > 2 * 1024 * 1024) {
      toast.error(`File từ điển quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa chỉ cho phép 2MB!`);
      e.target.value = '';
      return;
    }

    // 🛡️ CHỐT CHẶN 2: Bắt buộc phải là txt hoặc json
    const isJson = file.name.toLowerCase().endsWith('.json');
    const isTxt = file.name.toLowerCase().endsWith('.txt');
    if (!isJson && !isTxt) {
      toast.error("Chỉ chấp nhận nạp file từ điển định dạng .txt hoặc .json!");
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        
        // 🛡️ CHỐT CHẶN 3: Rà soát cú pháp JSON trước khi đưa vào hệ thống
        if (isJson) {
          JSON.parse(content); // Test thử xem có lỗi cú pháp không
        }
        
        config.importFromFile(content, isJson);
        toast.success("Đã nạp file từ điển thành công!");
      } catch (err) {
        toast.error("File JSON bị lỗi cấu trúc (thiếu dấu phẩy, sai ngoặc kép...)! Vui lòng kiểm tra lại.");
      }
    };
    
    reader.onerror = () => toast.error("Không thể đọc dữ liệu từ file này!");
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const handleSave = () => {
    config.saveToLocal();
    toast.success("Đã lưu cấu hình AI!");
  };

  return (
    <div className="fixed inset-0 z-2000 flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-panel border border-border shadow-2xl rounded-2xl w-125 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* Header Emerald */}
        <div className="relative px-6 py-5 border-b border-border overflow-hidden">
          <div className="absolute inset-0 bg-emerald-500/10 pointer-events-none"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <Settings2 size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-white tracking-tight">Cấu hình Dịch thuật AI</h2>
                <p className="text-xs text-text-muted mt-0.5">Huấn luyện văn phong và ngữ cảnh cho DeepSeek</p>
              </div>
            </div>
            <button onClick={() => config.setModalOpen(false)} className="p-1.5 text-text-muted hover:text-white hover:bg-border rounded-xl transition-all cursor-pointer">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body Form */}
        {/* Body Form */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-text-main flex items-center gap-1.5 uppercase tracking-wider">
                <BookOpen size={14} className="text-text-muted" /> Thể loại
              </label>
              <select value={config.genre} onChange={(e) => config.setConfig('genre', e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:border-emerald-500 outline-none cursor-pointer">
                <option value="Shounen (Hành động, nhiệt huyết)">Shounen (Hành động)</option>
                <option value="Shoujo (Lãng mạn, tình cảm)">Shoujo (Lãng mạn)</option>
                <option value="Isekai (Xuyên không, phép thuật)">Isekai (Xuyên không)</option>
                <option value="custom">✍️ Tự nhập...</option>
              </select>
              {config.genre === 'custom' && (
                <input type="text" maxLength={100} value={config.customGenre} onChange={(e) => config.setConfig('customGenre', e.target.value)} placeholder="Nhập thể loại... (Tối đa 100 ký tự)" className="w-full bg-background border border-emerald-500/50 rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none" />
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-text-main flex items-center gap-1.5 uppercase tracking-wider">
                <Mic2 size={14} className="text-text-muted" /> Văn phong
              </label>
              <select value={config.tone} onChange={(e) => config.setConfig('tone', e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:border-emerald-500 outline-none cursor-pointer">
                <option value="Tự nhiên, đời thường, ngôn ngữ mạng">Đời thường / Mạng</option>
                <option value="Trang trọng, cổ trang, kiếm hiệp">Cổ trang / Nghiêm túc</option>
                <option value="Hài hước, lầy lội">Hài hước / Lầy lội</option>
                <option value="custom">✍️ Tự nhập...</option>
              </select>
              {config.tone === 'custom' && (
                <input type="text" maxLength={100} value={config.customTone} onChange={(e) => config.setConfig('customTone', e.target.value)} placeholder="Nhập văn phong... (Tối đa 100 ký tự)" className="w-full bg-background border border-emerald-500/50 rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none" />
              )}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-xs font-bold text-text-main flex items-center gap-1.5 uppercase tracking-wider">
              <Users size={14} className="text-text-muted" /> Quy tắc xưng hô
            </label>
            <select value={config.pronoun} onChange={(e) => config.setConfig('pronoun', e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:border-emerald-500 outline-none cursor-pointer">
              <option value="Tôi - Cậu (Bạn bè ngang hàng)">Tôi - Cậu (Bạn bè)</option>
              <option value="Anh - Em (Nam lớn tuổi hơn nữ)">Anh - Em</option>
              <option value="Ta - Ngươi (Kẻ thù, cổ trang)">Ta - Ngươi</option>
              <option value="Mày - Tao (Kẻ thù, giang hồ)">Mày - Tao (Gắt)</option>
              <option value="custom">✍️ Tự nhập...</option>
            </select>
            {config.pronoun === 'custom' && (
              <input type="text" maxLength={100} value={config.customPronoun} onChange={(e) => config.setConfig('customPronoun', e.target.value)} placeholder="VD: Lão phu - Tiểu tử... (Tối đa 100 ký tự)" className="w-full bg-background border border-emerald-500/50 rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none" />
            )}
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-text-main uppercase tracking-wider">📚 Từ điển Nhân vật (Glossary)</label>
              <label className="flex items-center gap-1 px-3 py-1.5 bg-border/40 hover:bg-border text-xs text-text-main rounded-lg cursor-pointer transition-colors">
                <FolderOpen size={14} /> Nạp File (.txt)
                <input type="file" accept=".txt,.json" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            
            {/* 🚀 CHỐT CHẶN FRONTEND: TextArea có đếm ký tự */}
            <div className="relative">
              <textarea 
                maxLength={1000}
                value={config.glossary} onChange={(e) => config.setConfig('glossary', e.target.value)}
                className="w-full h-28 bg-background border border-border rounded-xl px-4 py-3 text-sm text-text-main resize-none focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all custom-scrollbar placeholder-text-muted/40" 
                placeholder="Nhập theo mẫu:&#10;Naruto = Naruto (Xưng: Tớ - Cậu)&#10;Sasuke = Sasuke (Xưng: Tôi - Cậu)"
              />
              <div className={`absolute bottom-3 right-4 text-xs font-medium ${config.glossary.length >= 1000 ? 'text-red-500' : 'text-text-muted/60'}`}>
                {config.glossary.length} / 1000
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-background/50 border-t border-border flex justify-end gap-3">
          <button onClick={() => config.setModalOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-text-main hover:bg-border transition-colors cursor-pointer">
            Đóng
          </button>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all transform hover:scale-[1.02] cursor-pointer">
            <Save size={16} strokeWidth={2.5} /> Lưu Cấu Hình
          </button>
        </div>

      </div>
    </div>
  );
}