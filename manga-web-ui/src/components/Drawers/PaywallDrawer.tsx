import React, { useState } from 'react';
import { X, Diamond, Check, Copy, AlertCircle, Sparkles, Building, User, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/useAuthStore';

interface PaywallDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PaywallDrawer: React.FC<PaywallDrawerProps> = ({ isOpen, onClose }) => {
  const user = useAuthStore((state) => state.user);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const email = user?.email || 'Email_Cua_Ban';
  const syntaxCode = `DEEPKOMA ${email}`;

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Đã sao chép ${label}!`);
  };

  const handleConfirmPayment = () => {
    setIsSubmitting(true);
    // Tạm thời disable nút 3 giây chống spam click liên tục
    setTimeout(() => {
      toast.success("Hệ thống đã ghi nhận! Credit sẽ được cộng vào tài khoản trong 5-10 phút sau khi đối soát.");
      setIsSubmitting(false);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      {/* Backdrop mờ nền */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Cấu trúc Drawer/Modal Glassmorphism phong cách Dark Theme */}
      <div className="relative w-full max-w-md bg-[#1a1a1a] border border-gray-800 text-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col z-10 max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800/60 bg-black/20">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold tracking-tight">Nâng cấp gói DeepKoma Studio</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Thân content cuộc cuộn */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Pricing Card */}
          <div className="relative p-5 rounded-2xl border border-gray-800 bg-neutral-900/50 flex flex-col justify-between overflow-hidden">
            
            {/* Early Bird Badge với hiệu ứng nhấp nháy/pulse rực rỡ */}
            <div className="absolute -top-1 left-0 right-0 flex justify-center">
              <span className="bg-gradient-to-r from-red-600 to-orange-500 text-white text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse border border-red-400/30 text-center">
                🎁 EARLY BIRD: TẶNG THÊM 30% CREDIT (Chỉ áp dụng cho 100 user đầu tiên)
              </span>
            </div>

            {/* Chi tiết giá tiền và Credit */}
            <div className="mt-5 space-y-4 text-center">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-widest font-semibold">Giá trọn gói</p>
                <h3 className="text-3xl font-extrabold text-white mt-1">199.000 VNĐ</h3>
              </div>

              <div className="h-px bg-gray-800 w-2/3 mx-auto" />

              <div className="space-y-2">
                <div className="flex justify-center items-center gap-2 text-gray-300 text-sm">
                  <Check size={16} className="text-emerald-500" />
                  <span>Gói gốc: <strong>400 Trang truyện (Credits)</strong></span>
                </div>
                
                {/* Highlight Tổng nhận màu xanh/vàng bắt mắt */}
                <div className="inline-block px-3 py-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-xl text-yellow-400 text-sm font-black animate-bounce mt-1">
                  👉 Nhận tổng cộng: 520 Credits
                </div>
              </div>
            </div>
          </div>

          {/* Hướng dẫn chuyển khoản thủ công */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold">1</span>
              <span>Thông tin chuyển khoản thủ công</span>
            </div>

            {/* Khung chứa viền chi tiết thông tin thanh toán */}
            <div className="bg-neutral-900/40 border border-gray-800 rounded-2xl p-4 space-y-3.5">
              
              {/* Ngân hàng */}
              <div className="flex items-center justify-between text-xs py-0.5">
                <span className="text-gray-400 flex items-center gap-2">
                  <Building size={14} className="text-gray-500" />
                  Ngân hàng:
                </span>
                <span className="font-bold text-white">[ĐIỀN_TÊN_NGÂN_HÀNG_CỦA_BẠN]</span>
              </div>

              {/* Số tài khoản */}
              <div className="flex items-center justify-between text-xs py-0.5">
                <span className="text-gray-400 flex items-center gap-2">
                  <CreditCard size={14} className="text-gray-500" />
                  Số tài khoản:
                </span>
                <div className="flex items-center gap-1.5 font-bold text-white">
                  <span>[ĐIỀN_SỐ_TÀI_KHOẢN]</span>
                  <button 
                    onClick={() => handleCopyText("[ĐIỀN_SỐ_TÀI_KHOẢN]", "Số tài khoản")}
                    className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors cursor-pointer border border-white/5"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>

              {/* Chủ tài khoản */}
              <div className="flex items-center justify-between text-xs py-0.5">
                <span className="text-gray-400 flex items-center gap-2">
                  <User size={14} className="text-gray-500" />
                  Chủ tài khoản:
                </span>
                <span className="font-bold text-white">[ĐIỀN_TÊN_CHỦ_TÀI_KHOẢN]</span>
              </div>

              <div className="h-px bg-gray-800/60" />

              {/* Nội dung chuyển khoản có thể Copy */}
              <div className="space-y-1.5">
                <span className="text-xs text-gray-400 block font-medium">Nội dung chuyển khoản (chính xác):</span>
                <div className="flex items-center justify-between gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-2.5 rounded-xl">
                  <code className="text-xs font-mono font-bold text-indigo-400 select-all tracking-wide">
                    {syntaxCode}
                  </code>
                  <button
                    onClick={() => handleCopyText(syntaxCode, "Nội dung chuyển khoản")}
                    className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-500/20 cursor-pointer"
                    title="Sao chép nội dung"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Cảnh báo quan trọng */}
          <div className="flex gap-2.5 bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl text-[11px] leading-relaxed text-amber-200">
            <AlertCircle size={15} className="shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">Lưu ý đối soát:</p>
              <p>Hệ thống duyệt thủ công qua nội dung chuyển khoản. Hãy đảm bảo nhập đúng mã nội dung ở trên để nhận Credit nhanh nhất.</p>
            </div>
          </div>

        </div>

        {/* Nút Hành động xác nhận chuyển khoản xong ở chân */}
        <div className="p-5 border-t border-gray-800/60 bg-black/10">
          <button
            onClick={handleConfirmPayment}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold text-xs uppercase tracking-wider py-4 rounded-xl transition-all duration-200 cursor-pointer active:scale-[0.98] shadow-[0_4px_15px_rgba(79,70,229,0.3)]"
          >
            {isSubmitting ? "Đang ghi nhận giao dịch..." : "Tôi đã chuyển khoản xong"}
          </button>
        </div>

      </div>
    </div>
  );
};
