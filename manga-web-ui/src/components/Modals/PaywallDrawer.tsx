import React, { useState } from 'react';
import { X, Gem, CheckCircle2, Zap, QrCode, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/useAuthStore'; // 🚀 Lấy thông tin user hiện tại

interface PaywallDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

// 🚀 CHUYỂN BẢNG GIÁ SANG VNĐ CHUẨN THỊ TRƯỜNG VIỆT NAM
const PRICING_TIERS = [
    // 🚀 CHÈN THÊM GÓI TEST VÀO ĐÂY
    {
        id: 'pack_test',
        name: 'Gói Dev Test',
        credits: 20,
        price: 2000,
        priceStr: '2.000đ',
        popular: false,
        color: 'border-blue-500/30 hover:border-blue-500/60 bg-blue-500/10 border-dashed',
        desc: 'Chỉ dành cho sếp test luồng Webhook nạp tiền tự động.'
    },
    {
        id: 'pack_50k',
        name: 'Gói Sinh Viên',
        credits: 500,
        price: 50000,
        priceStr: '50.000đ',
        popular: false,
        color: 'border-white/10 hover:border-white/30 bg-black/20',
        desc: 'Đủ để dịch khoảng 1-2 chapter truyện ngắn.'
    },
    {
        id: 'pack_100k',
        name: 'Gói Cày Cuốc',
        credits: 1200,
        price: 100000,
        priceStr: '100.000đ',
        popular: true,
        color: 'border-amber-500/50 hover:border-amber-400 bg-amber-500/10 ring-1 ring-amber-500/30',
        desc: 'Tiết kiệm 20%. Dành cho dân cày truyện đêm khuya.'
    },
    {
        id: 'pack_pro',
        name: 'Thuê Bao PRO',
        credits: 'Vô cực',
        price: 200000,
        priceStr: '200.000đ / Tháng',
        popular: false,
        color: 'border-indigo-500/30 hover:border-indigo-500/60 bg-indigo-500/10',
        desc: 'Dịch tẹt ga không giới hạn. Tốc độ server ưu tiên cao nhất.'
    }
];

export const PaywallDrawer: React.FC<PaywallDrawerProps> = ({ isOpen, onClose }) => {
    const [selectedTier, setSelectedTier] = useState<string>('pack_100k'); 
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Lấy ID user từ Store (nếu chưa đăng nhập thì để tạm 'guest_123' để test)
    const userId = useAuthStore(state => state.user?.id) || "guest_123";

    const activeTier = PRICING_TIERS.find(t => t.id === selectedTier);

    // 🚀 HÀM GỌI API TẠO MÃ QR TỪ BACKEND
    const handleCheckout = async () => {
        if (!activeTier) return;
        setIsProcessing(true);

        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/payment/create-link?user_id=${userId}&package_id=${activeTier.id}`, {
                method: 'POST',
            });

            const data = await response.json();

            if (data.checkoutUrl) {
                // 🚀 Chuyển hướng thẳng người dùng sang Cổng thanh toán của PayOS
                window.location.href = data.checkoutUrl;
            } else {
                toast.error("Không tạo được mã thanh toán, vui lòng thử lại!");
                setIsProcessing(false);
            }
        } catch (error) {
            console.error("Payment Error:", error);
            toast.error("Mất kết nối tới máy chủ thanh toán!");
            setIsProcessing(false);
        }
    };

    return (
        <>
            <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />

            <div className={`fixed inset-y-0 right-0 z-50 w-[420px] bg-[#111] backdrop-blur-3xl border-l border-white/10 shadow-2xl transform transition-transform duration-500 ease-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-400">
                            <Gem size={20} className="animate-pulse" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-white uppercase tracking-wider">Cửa hàng Credits</h2>
                            <p className="text-[11px] text-neutral-400">Nạp năng lượng cho Trợ lý AI</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                    <div className="space-y-3">
                        {PRICING_TIERS.map((tier) => (
                            <div
                                key={tier.id}
                                onClick={() => setSelectedTier(tier.id)}
                                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${tier.color} ${selectedTier === tier.id ? 'scale-[1.02] shadow-lg' : 'opacity-70 hover:opacity-100 grayscale-[30%] hover:grayscale-0'}`}
                            >
                                {tier.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-amber-950 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                                        Phổ Biến Nhất
                                    </div>
                                )}

                                <div className="flex items-center justify-between mb-1">
                                    <span className={`text-sm font-bold ${tier.popular ? 'text-amber-400' : 'text-neutral-200'}`}>
                                        {tier.name}
                                    </span>
                                    <span className="text-lg font-black text-white">{tier.priceStr}</span>
                                </div>

                                <div className="flex items-center gap-1.5 text-white/90 font-medium text-sm mb-2">
                                    <Gem size={14} className={tier.id === 'pack_pro' ? 'text-indigo-400' : 'text-cyan-400'} />
                                    <span>{tier.credits} Credits</span>
                                </div>

                                <p className="text-[11px] text-neutral-400 leading-relaxed">{tier.desc}</p>

                                {selectedTier === tier.id && (
                                    <div className="absolute top-4 right-4 text-white">
                                        <CheckCircle2 size={20} className={tier.popular ? 'text-amber-400' : 'text-indigo-400'} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-4"></div>

                    {/* THÔNG TIN THANH TOÁN VIETQR */}
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4 space-y-3 shadow-inner">
                        <div className="flex items-center justify-between text-neutral-300">
                            <div className="flex items-center gap-2 text-sm font-bold">
                                <QrCode size={18} className="text-emerald-400" />
                                <span>Thanh toán siêu tốc 24/7</span>
                            </div>
                            <img src="https://payos.vn/wp-content/uploads/sites/13/2023/07/payos-logo.svg" alt="PayOS" className="h-4 opacity-70" />
                        </div>
                        <ul className="text-[11px] text-neutral-400 space-y-2 list-disc list-inside">
                            <li>Hỗ trợ mọi ngân hàng (Vietcombank, MB, Techcombank...)</li>
                            <li>Mở app ngân hàng quét mã VietQR.</li>
                            <li><span className="text-emerald-400 font-bold">Credits được cộng TỰ ĐỘNG</span> trong 3 giây.</li>
                        </ul>
                    </div>
                </div>

                <div className="p-5 border-t border-white/5 bg-neutral-900">
                    <button
                        onClick={handleCheckout}
                        disabled={isProcessing}
                        className="w-full flex items-center justify-center gap-2 bg-white text-black font-black text-sm uppercase tracking-wider py-4 rounded-xl hover:bg-neutral-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                    >
                        {isProcessing ? (
                            <span className="flex items-center gap-2"><Zap className="animate-spin" size={16} /> Đang tạo mã QR...</span>
                        ) : (
                            <span>Thanh toán {activeTier?.priceStr}</span>
                        )}
                    </button>
                    <div className="flex items-center justify-center gap-1.5 mt-3 text-[9px] text-neutral-500 uppercase tracking-widest">
                        <ShieldCheck size={12} className="text-emerald-500/70" />
                        Giao dịch an toàn & bảo mật
                    </div>
                </div>
            </div>
        </>
    );
};