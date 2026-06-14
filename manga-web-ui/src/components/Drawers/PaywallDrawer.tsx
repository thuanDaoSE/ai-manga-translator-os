import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Copy, AlertCircle, Sparkles, CreditCard, ArrowLeft, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/useAuthStore';
import { mangaApi } from '../../services/api';

interface PaywallDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PaywallDrawer: React.FC<PaywallDrawerProps> = ({ isOpen, onClose }) => {
  const user = useAuthStore((state) => state.user);
  const fetchProfile = useAuthStore((state) => state.fetchProfile);
  const [selectedAmount, setSelectedAmount] = useState<number>(50000); // 50,000 VNĐ default
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isDisclaimerChecked, setIsDisclaimerChecked] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [orderCode, setOrderCode] = useState<number | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const predefinedAmounts = [
    { value: 20000, label: '20.000đ', xu: 200 },
    { value: 50000, label: '50.000đ', xu: 500 },
    { value: 100000, label: '100.000đ', xu: 1000 },
    { value: 200000, label: '200.000đ', xu: 2000 },
  ];

  const finalAmount = customAmount ? parseInt(customAmount) || 0 : selectedAmount;
  const equivalentXu = Math.floor(finalAmount / 100);

  // Clear polling on unmount or close
  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setCheckoutUrl(null);
      setOrderCode(null);
      setCustomAmount('');
      setSelectedAmount(50000);
      setIsDisclaimerChecked(false);
    }
  }, [isOpen]);

  const handleGeneratePayment = async () => {
    if (finalAmount < 20000) {
      return toast.error("Số tiền nạp tối thiểu là 20.000 VNĐ!");
    }
    if (!isDisclaimerChecked) {
      return toast.error("Vui lòng đồng ý với cam kết sử dụng dịch vụ!");
    }

    setIsLoading(true);
    const toastId = toast.loading("Đang khởi tạo liên kết thanh toán PayOS...");
    try {
      const data = await mangaApi.createPaymentLink(finalAmount);
      if (data.checkoutUrl && data.orderCode) {
        setCheckoutUrl(data.checkoutUrl);
        setOrderCode(data.orderCode);
        toast.success("Khởi tạo mã QR thành công!", { id: toastId });
        
        // Bắt đầu Polling trạng thái thanh toán mỗi 2 giây
        stopPolling();
        pollIntervalRef.current = setInterval(async () => {
          try {
            const statusData = await mangaApi.getPaymentStatus(data.orderCode);
            if (statusData.status === "PAID") {
              stopPolling();
              toast.success("🎉 Nạp Xu thành công! Cảm ơn sếp đã ủng hộ.");
              await fetchProfile();
              onClose();
            }
          } catch (pollErr) {
            console.error("Lỗi polling trạng thái thanh toán:", pollErr);
          }
        }, 2000);
      } else {
        throw new Error("Không nhận được thông tin checkout!");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Tạo liên kết thanh toán thất bại!", { id: toastId });
    } finally {
      setIsLoading(false);
    }
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
            <h2 className="text-lg font-bold tracking-tight">Nạp Xu dịch truyện Manga</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Thân content cuộn */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {!checkoutUrl ? (
            // BƯỚC 1: CHỌN SỐ TIỀN
            <>
              {/* Pricing Cards */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  Chọn gói nạp nhanh:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {predefinedAmounts.map((pkg) => (
                    <button
                      key={pkg.value}
                      type="button"
                      onClick={() => {
                        setSelectedAmount(pkg.value);
                        setCustomAmount('');
                      }}
                      className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        selectedAmount === pkg.value && !customAmount
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                          : 'border-gray-800 bg-neutral-900/50 hover:bg-neutral-800/80 hover:border-gray-700'
                      }`}
                    >
                      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Nhận {pkg.xu} Xu</span>
                      <span className="text-lg font-black text-white mt-1">{pkg.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nhập số tiền tùy chỉnh */}
              <div className="space-y-2">
                <label htmlFor="custom-amount-input" className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  Số tiền nạp tùy chỉnh (VNĐ):
                </label>
                <div className="relative">
                  <input
                    id="custom-amount-input"
                    type="number"
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setSelectedAmount(0);
                    }}
                    placeholder="Ví dụ: 30000"
                    min="20000"
                    className="w-full px-4 py-3.5 bg-neutral-900 border border-gray-800 rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold text-white placeholder-gray-600 transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">
                    VNĐ
                  </span>
                </div>
                {finalAmount > 0 && (
                  <div className="text-[11px] text-yellow-500 font-bold flex items-center gap-1.5 px-1">
                    👉 Sẽ nhận được: <span className="text-sm font-black">{equivalentXu} Xu</span> (Tỷ lệ: 100 VNĐ = 1 Xu)
                  </div>
                )}
                {finalAmount < 20000 && finalAmount > 0 && (
                  <div className="text-[11px] text-red-400 font-bold flex items-center gap-1.5 px-1">
                    ⚠️ Số tiền nạp tối thiểu là 20.000 VNĐ!
                  </div>
                )}
              </div>

              {/* Điều khoản pháp lý và tuyên bố miễn trừ trách nhiệm */}
              <div className="flex gap-2.5 bg-red-500/5 border border-red-500/10 p-3.5 rounded-xl text-[11px] leading-relaxed text-gray-300">
                <input 
                  type="checkbox" 
                  id="legal-disclaimer-checkbox" 
                  checked={isDisclaimerChecked}
                  onChange={(e) => setIsDisclaimerChecked(e.target.checked)}
                  className="mt-1 shrink-0 cursor-pointer accent-indigo-500 rounded border-gray-700 bg-neutral-900 w-4 h-4" 
                />
                <label htmlFor="legal-disclaimer-checkbox" className="leading-relaxed cursor-pointer select-none">
                  Tôi cam kết và đồng ý rằng: 
                  <strong> (1)</strong> Mọi hình ảnh/nội dung tôi tải lên hoặc dịch thuật đều thuộc quyền sở hữu/sử dụng hợp pháp của tôi; 
                  <strong> (2)</strong> Tôi hoàn toàn tự chịu 100% trách nhiệm trước pháp luật Việt Nam (bao gồm các quy định về truyền bá văn hóa phẩm đồi trụy - <strong>Điều 326 Bộ luật Hình sự</strong>, nội dung kích động, phản động); 
                  <strong> (3)</strong> Nghiêm cấm sử dụng công cụ để xử lý tranh ảnh, truyện đồi trụy (18+/Hentai/Doujinshi), vi phạm thuần phong mỹ tục. Hệ thống tự động xóa bỏ hoàn toàn dữ liệu sau 6 giờ để bảo vệ quyền riêng tư.
                </label>
              </div>
            </>
          ) : (
            // BƯỚC 2: HIỂN THỊ VIETQR VÀ MÃ THANH TOÁN
            <div className="flex flex-col items-center justify-center space-y-5 py-2">
              <div className="text-center space-y-1">
                <h3 className="text-sm text-gray-400 font-semibold uppercase tracking-wider">Tổng số tiền cần thanh toán</h3>
                <p className="text-2xl font-black text-white">{finalAmount.toLocaleString('vi-VN')} VNĐ</p>
                <div className="inline-block px-3 py-1 bg-yellow-400/10 border border-yellow-400/20 rounded-full text-yellow-400 text-[11px] font-black mt-1">
                  Nhận ngay: {equivalentXu} Xu
                </div>
              </div>

              {/* Render QR code */}
              <div className="relative p-4 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-gray-100">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkoutUrl)}`} 
                  alt="VietQR Code" 
                  className="w-[200px] h-[200px] block"
                />
              </div>

              <div className="flex flex-col gap-2.5 w-full">
                <a 
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-md shadow-indigo-600/10"
                >
                  <ExternalLink size={14} /> Mở trang thanh toán trực tiếp
                </a>
                
                <button
                  type="button"
                  onClick={() => {
                    stopPolling();
                    setCheckoutUrl(null);
                    setOrderCode(null);
                  }}
                  className="w-full py-3.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl border border-gray-800 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft size={14} /> Quay lại chọn số tiền khác
                </button>
              </div>

              {/* Status Polling indicator */}
              <div className="flex items-center justify-center gap-2 bg-indigo-500/5 border border-indigo-500/10 px-4 py-2.5 rounded-xl w-full text-[11px] text-indigo-400 font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                <span>Hệ thống đang chờ thanh toán tự động...</span>
              </div>

              {/* Lời khuyên an tâm */}
              <div className="flex gap-2 bg-neutral-900/50 border border-gray-800/80 p-3.5 rounded-xl text-[10px] leading-relaxed text-gray-400">
                <AlertCircle size={14} className="shrink-0 text-gray-500 mt-0.5" />
                <p>Xu sẽ được cộng tự động ngay lập tức sau khi giao dịch chuyển khoản thành công. Không cần đóng khung này thủ công.</p>
              </div>
            </div>
          )}

        </div>

        {/* Nút Hành động ở chân (chỉ hiện ở Bước 1) */}
        {!checkoutUrl && (
          <div className="p-5 border-t border-gray-800/60 bg-black/10">
            <button
              onClick={handleGeneratePayment}
              disabled={isLoading || finalAmount < 20000 || !isDisclaimerChecked}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold text-xs uppercase tracking-wider py-4 rounded-xl transition-all duration-200 cursor-pointer active:scale-[0.98] shadow-[0_4px_15px_rgba(79,70,229,0.3)]"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin">⏳</span> Đang tạo mã QR...
                </>
              ) : (
                <>
                  <CreditCard size={14} /> Tạo mã thanh toán QR
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
