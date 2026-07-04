import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Copy, AlertCircle, Sparkles, CreditCard, ArrowLeft, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/useAuthStore';
import { mangaApi } from '../../services/api';
import { useTranslation, Trans } from 'react-i18next';
import PolicyModal from '../Modals/PolicyModal';

interface PaywallDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const calculateSeconds = (vnd: number) => {
  const baseSeconds = (vnd / 10000) * 900;
  return {
    base: baseSeconds,
    bonus: 0,
    total: baseSeconds,
    percent: 0
  };
};

export const PaywallDrawer: React.FC<PaywallDrawerProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const fetchProfile = useAuthStore((state) => state.fetchProfile);
  const [selectedAmount, setSelectedAmount] = useState<number>(50000);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [orderCode, setOrderCode] = useState<number | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const predefinedAmounts = [
    { value: 25000, label: '25.000đ', name: 'Trà Đá' },
    { value: 50000, label: '50.000đ', name: 'Cày Cuốc' },
    { value: 100000, label: '100.000đ', name: 'Dân Pro' },
    { value: 150000, label: '150.000đ', name: 'Studio' },
  ];

  const finalAmount = selectedAmount;
  const { total: equivalentSeconds } = calculateSeconds(finalAmount);
  
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
      setQrCode(null);
      setOrderCode(null);
      setSelectedAmount(50000);
    }
  }, [isOpen]);

  const handleGeneratePayment = async () => {
    if (finalAmount < 25000) {
      return toast.error(t('paywall.minAmountError'));
    }

    setIsLoading(true);
    const toastId = toast.loading(t('paywall.initializingLink'));
    try {
      const data = await mangaApi.createPaymentLink(finalAmount);
      if (data.checkoutUrl && data.orderCode) {
        setCheckoutUrl(data.checkoutUrl);
        setQrCode(data.qrCode || '');
        setOrderCode(data.orderCode);
        toast.success(t('paywall.qrSuccess'), { id: toastId });
        
        // Bắt đầu Polling trạng thái thanh toán mỗi 2 giây
        stopPolling();
        pollIntervalRef.current = setInterval(async () => {
          try {
            const statusData = await mangaApi.getPaymentStatus(data.orderCode);
            if (statusData.status === "PAID") {
              stopPolling();
              toast.success(t('paywall.topupSuccess'));
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
      toast.error(err.message || t('paywall.topupFailed'), { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

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
            <h2 className="text-lg font-bold tracking-tight">{t('paywall.title')}</h2>
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
                  {t('paywall.quickSelect')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {predefinedAmounts.map((pkg) => {
                  const { total, bonus, percent } = calculateSeconds(pkg.value);
                  const isSelected = selectedAmount === pkg.value;
                    return (
                      <button
                        key={pkg.value}
                        type="button"
                        onClick={() => {
                          setSelectedAmount(pkg.value);
                        }}
                        className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all relative overflow-hidden cursor-pointer ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                            : 'border-gray-800 bg-neutral-900/50 hover:bg-neutral-800/80 hover:border-gray-700'
                        }`}
                      >
                        {percent > 0 && (
                          <span className="absolute top-2 right-2 bg-emerald-500/10 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                            +{percent}% Bonus
                          </span>
                        )}
                        <div className="flex flex-col gap-0.5 mt-1">
                          <span className="text-xs font-bold text-indigo-400 block mb-1">
                            {pkg.name}
                          </span>
                          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                            {t('paywall.receiveCreditsShort', { count: total })}
                          </span>
                          {bonus > 0 && (
                            <span className="text-[10px] text-emerald-400 font-bold block">
                              {t('paywall.bonusShort', { count: bonus })}
                            </span>
                          )}
                        </div>
                        <span className="text-lg font-black text-white mt-3">{pkg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            // BƯỚC 2: HIỂN THỊ VIETQR VÀ MÃ THANH TOÁN
            <div className="flex flex-col items-center justify-center space-y-5 py-2">
              <div className="text-center space-y-1">
                <h3 className="text-sm text-gray-400 font-semibold uppercase tracking-wider">{t('paywall.totalAmountToPay')}</h3>
                <p className="text-2xl font-black text-white">{finalAmount.toLocaleString('vi-VN')} VNĐ</p>
                <div className="inline-block px-3 py-1 bg-yellow-400/10 border border-yellow-400/20 rounded-full text-yellow-400 text-[11px] font-black mt-1">
                  {t('paywall.receiveCredits', { count: equivalentSeconds, minutes: Math.round(equivalentSeconds / 60) })}
                </div>
              </div>

              {/* Render QR code */}
              <div className="relative p-4 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-gray-100">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode || checkoutUrl || '')}`} 
                  alt="VietQR Code" 
                  className="w-[200px] h-[200px] block"
                />
              </div>

              <div className="flex flex-col gap-2.5 w-full">
                <a 
                  href={checkoutUrl || ''}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98] shadow-md shadow-indigo-600/10"
                >
                  <ExternalLink size={14} /> {t('paywall.openPaymentDirect')}
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
                  <ArrowLeft size={14} /> {t('paywall.backToAmountSelect')}
                </button>
              </div>

              {/* Status Polling indicator */}
              <div className="flex items-center justify-center gap-2 bg-indigo-500/5 border border-indigo-500/10 px-4 py-2.5 rounded-xl w-full text-[11px] text-indigo-400 font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                <span>{t('paywall.waitingPayment')}</span>
              </div>

              {/* Lời khuyên an tâm */}
              <div className="flex gap-2 bg-neutral-900/50 border border-gray-800/80 p-3.5 rounded-xl text-[10px] leading-relaxed text-gray-400">
                <AlertCircle size={14} className="shrink-0 text-gray-500 mt-0.5" />
                <p>{t('paywall.pollingNotice')}</p>
              </div>
            </div>
          )}

        </div>

        {/* Nút Hành động ở chân (chỉ hiện ở Bước 1) */}
        {!checkoutUrl && (
          <div className="p-5 border-t border-gray-800/60 bg-black/10 flex flex-col gap-3">
            <button
              onClick={handleGeneratePayment}
              disabled={isLoading || finalAmount < 25000}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold text-xs uppercase tracking-wider py-4 rounded-xl transition-all duration-200 cursor-pointer active:scale-[0.98] shadow-[0_4px_15px_rgba(79,70,229,0.3)]"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin">⏳</span> {t('paywall.generatingQr')}
                </>
              ) : (
                <>
                  <CreditCard size={14} /> {t('paywall.createPaymentQr')}
                </>
              )}
            </button>
            <div className="text-center text-[10px] text-gray-500">
              <Trans i18nKey="paywall.termsAgreement">
                Bằng việc tiếp tục, bạn đồng ý với <button type="button" onClick={() => setIsPolicyOpen(true)} className="underline hover:text-indigo-400 transition-colors cursor-pointer">Điều khoản Dịch vụ</button> của chúng tôi.
              </Trans>
            </div>
          </div>
        )}
        <PolicyModal isOpen={isPolicyOpen} onClose={() => setIsPolicyOpen(false)} />

      </div>
    </div>
  );
};
