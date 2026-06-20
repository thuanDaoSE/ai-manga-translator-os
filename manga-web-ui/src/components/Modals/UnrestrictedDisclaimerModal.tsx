import React, { useState } from 'react';
import { ShieldAlert, X, Zap } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function UnrestrictedDisclaimerModal({ isOpen, onClose, onConfirm }: Props) {
  const [isChecked, setIsChecked] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-[#141417] border border-red-500/20 shadow-[0_20px_50px_rgba(239,68,68,0.15)] rounded-2xl w-[600px] max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-white/5 overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-red-500/10 pointer-events-none animate-pulse"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-500/20 text-red-500 rounded-xl border border-red-500/30">
                <ShieldAlert size={20} className="animate-bounce" />
              </div>
              <div>
                <h2 className="text-base font-black text-white tracking-tight uppercase">⚠️ CẢNH BÁO: CHẾ ĐỘ KHÔNG GIỚI HẠN (UNRESTRICTED MODE)</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">Xác nhận điều khoản sử dụng và trách nhiệm pháp lý</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all cursor-pointer">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content (Scrollable) */}
        <div className="p-6 overflow-y-auto custom-scrollbar text-xs text-slate-300 space-y-4 leading-relaxed">
          <p className="font-semibold text-slate-200 text-sm border-l-2 border-red-500 pl-3">
            Chế độ này sử dụng mô hình AI chuyên sâu không qua kiểm duyệt bộ lọc ngôn ngữ tiêu chuẩn, nhằm giữ nguyên 100% sắc thái, từ lóng và ngữ cảnh của nguyên tác. Bằng việc kích hoạt, bạn ký kết thỏa thuận pháp lý với Deepkoma và cam kết tuân thủ các điều khoản sau:
          </p>

          <div className="space-y-3.5 mt-2">
            <div>
              <h3 className="text-white font-black uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> 1. Trách nhiệm pháp lý duy nhất:
              </h3>
              <p className="pl-3">
                Bạn là người kiểm soát và chịu 100% trách nhiệm trước pháp luật về nguồn dữ liệu tải lên cũng như mục đích sử dụng bản dịch cuối cùng. Deepkoma chỉ cung cấp công cụ tự động, không can thiệp hay kiểm duyệt thủ công nội dung của bạn.
              </p>
            </div>

            <div>
              <h3 className="text-red-400 font-black uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> 2. Lằn ranh đỏ (Tuyệt đối cấm):
              </h3>
              <p className="pl-3 text-red-200/90 font-medium">
                Nghiêm cấm sử dụng hệ thống để xử lý, dịch thuật các nội dung liên quan đến lạm dụng trẻ vị thành niên (Loli/Shota/CSAM), bạo lực cực đoan (Gore) hoặc các nội dung vi phạm luật pháp quốc tế. Hệ thống có bộ lọc ngầm; mọi vi phạm sẽ bị khóa IP, xóa tài khoản vĩnh viễn không hoàn Xu và dữ liệu vi phạm sẽ được báo cáo cho cơ quan thực thi pháp luật.
              </p>
            </div>

            <div>
              <h3 className="text-white font-black uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> 3. Chính sách Không lưu vết (Zero-Log):
              </h3>
              <p className="pl-3">
                Để bảo vệ quyền riêng tư, hệ thống sẽ tự động xóa vĩnh viễn (Hard Delete) hình ảnh và nội dung dịch khỏi máy chủ ngay sau khi bạn xóa trang truyện hoặc xóa/đóng dự án. Chúng tôi không lưu trữ bất kỳ bản sao lưu (backup) nào trên hệ thống.
              </p>
            </div>

            <div>
              <h3 className="text-white font-black uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> 4. Không hỗ trợ hoàn Xu:
              </h3>
              <p className="pl-3">
                Do chi phí vận hành API chuyên sâu rất cao, mọi giao dịch trừ Xu trong chế độ này là giao dịch một chiều. Chúng tôi không hỗ trợ hoàn Xu đối với các trường hợp AI nhận diện sai chữ do ảnh mờ, hoặc văn phong dịch chưa đạt kỳ vọng cá nhân.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#1b1b1f] border-t border-white/5 flex flex-col gap-3 shrink-0">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input 
              type="checkbox"
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
              className="mt-0.5 rounded border-white/10 bg-black/40 text-red-500 focus:ring-red-500 focus:ring-offset-[#1b1b1f] w-4 h-4 cursor-pointer transition-colors"
            />
            <span className="text-xs font-bold text-slate-300 group-hover:text-white select-none transition-colors">
              Tôi xác nhận nội dung tải lên hợp pháp và chịu mọi trách nhiệm pháp lý.
            </span>
          </label>

          <div className="flex justify-end gap-3 mt-1">
            <button 
              onClick={onClose} 
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button 
              onClick={() => {
                if (isChecked) {
                  onConfirm();
                }
              }} 
              disabled={!isChecked}
              className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md active:scale-95
                ${isChecked 
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20 cursor-pointer' 
                  : 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5 font-medium'}`}
            >
              <Zap size={13} className={isChecked ? 'fill-current animate-pulse' : ''} />
              <span>TÔI ĐỒNG Ý & KÍCH HOẠT (Giá: 2 Xu/lượt)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
