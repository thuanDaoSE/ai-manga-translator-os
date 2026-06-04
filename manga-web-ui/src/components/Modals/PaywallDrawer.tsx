import React, { useState } from 'react';
import { X, Gem, CheckCircle2, CreditCard, Zap, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

interface PaywallDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

const PRICING_TIERS = [
    {
        id: 'light',
        name: 'The Light Pack',
        credits: 500,
        price: 4.99,
        popular: false,
        color: 'border-white/10 hover:border-white/30 bg-black/20',
        desc: 'Lý tưởng để dịch hoàn chỉnh một tập truyện.'
    },
    {
        id: 'enthusiast',
        name: 'The Manga Enthusiast',
        credits: 2000,
        price: 14.99,
        popular: true,
        color: 'border-amber-500/50 hover:border-amber-400 bg-amber-500/10 ring-1 ring-amber-500/30',
        desc: 'Tiết kiệm 25%. Dành cho độc giả cày cuốc ngày đêm.'
    },
    {
        id: 'studio',
        name: 'The Scanlation Studio',
        credits: 10000,
        price: 49.99,
        popular: false,
        color: 'border-indigo-500/30 hover:border-indigo-500/60 bg-indigo-500/10',
        desc: 'Giá sỉ tốt nhất. Dành cho các nhóm dịch thuật chuyên nghiệp.'
    }
];

export const PaywallDrawer: React.FC<PaywallDrawerProps> = ({ isOpen, onClose }) => {
    const [selectedTier, setSelectedTier] = useState<string>('enthusiast'); // Mặc định chọn gói Popular
    const [isProcessing, setIsProcessing] = useState(false);

    const activeTier = PRICING_TIERS.find(t => t.id === selectedTier);

    const handleCheckout = () => {
        setIsProcessing(true);
        // Giả lập độ trễ gọi API Stripe
        setTimeout(() => {
            setIsProcessing(false);
            toast.success(`Đã nạp thành công ${activeTier?.credits} Tín dụng!`, { icon: '💎' });
            onClose(); // Đóng thanh trượt và cho user tiếp tục dịch ngay lập tức
        }, 2000);
    };

    return (
        <>
            {/* Backdrop làm tối nền Canvas nhẹ nhàng (không làm mất ảnh đang dịch) */}
            <div
                className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            {/* Ngăn kéo trượt (Slide-out Drawer) */}
            <div className={`fixed inset-y-0 right-0 z-50 w-[420px] bg-neutral-900/95 backdrop-blur-3xl border-l border-white/10 shadow-2xl transform transition-transform duration-500 ease-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

                {/* HEADER */}
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400">
                            <Zap size={18} className="animate-pulse" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Hết Tín Dụng</h2>
                            <p className="text-[11px] text-neutral-400">Vui lòng nạp thêm để tiếp tục dịch thuật</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* BODY (SCROLLABLE) */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">

                    {/* PRICING TIERS */}
                    <div className="space-y-3">
                        {PRICING_TIERS.map((tier) => (
                            <div
                                key={tier.id}
                                onClick={() => setSelectedTier(tier.id)}
                                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${tier.color} ${selectedTier === tier.id ? 'scale-[1.02] shadow-lg' : 'opacity-70 hover:opacity-100 grayscale-[30%] hover:grayscale-0'}`}
                            >
                                {/* Badge MOST POPULAR */}
                                {tier.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-amber-950 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">
                                        Phổ Biến Nhất
                                    </div>
                                )}

                                <div className="flex items-center justify-between mb-1">
                                    <span className={`text-sm font-bold ${tier.popular ? 'text-amber-400' : 'text-neutral-200'}`}>
                                        {tier.name}
                                    </span>
                                    <span className="text-lg font-black text-white">${tier.price}</span>
                                </div>

                                <div className="flex items-center gap-1.5 text-white/90 font-medium text-sm mb-2">
                                    <Gem size={14} className="text-cyan-400" />
                                    <span>{tier.credits.toLocaleString()} Credits</span>
                                </div>

                                <p className="text-[11px] text-neutral-400 leading-relaxed">
                                    {tier.desc}
                                </p>

                                {/* Nút check hiện lên khi được chọn */}
                                {selectedTier === tier.id && (
                                    <div className="absolute top-4 right-4 text-white">
                                        <CheckCircle2 size={20} className={tier.popular ? 'text-amber-400' : 'text-indigo-400'} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-2"></div>

                    {/* CHECKOUT SECTION (Nơi cắm Stripe Elements) */}
                    <div className="space-y-3">
                        <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">Thanh toán an toàn</h3>

                        {/* MOCKUP STRIPE ELEMENT */}
                        <div className="bg-black/40 border border-white/10 rounded-lg p-3 space-y-3 shadow-inner">
                            <div className="flex items-center gap-2 text-sm text-neutral-300">
                                <CreditCard size={16} className="text-neutral-500" />
                                <span className="font-mono text-xs">Thông tin thẻ tín dụng</span>
                            </div>

                            <div className="h-10 bg-white/5 border border-white/5 rounded flex items-center px-3 justify-between">
                                <span className="text-neutral-500 text-sm tracking-widest font-mono">**** **** **** 4242</span>
                                <div className="flex gap-2">
                                    <span className="text-neutral-500 text-xs font-mono">12/26</span>
                                    <span className="text-neutral-500 text-xs font-mono">CVC</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 justify-center text-[10px] text-neutral-500">
                            <ShieldCheck size={12} className="text-emerald-500" />
                            Bảo mật 256-bit mã hóa bởi Stripe
                        </div>
                    </div>
                </div>

                {/* FOOTER (STICKY PAY BUTTON) */}
                <div className="p-5 border-t border-white/5 bg-neutral-900">
                    <button
                        onClick={handleCheckout}
                        disabled={isProcessing}
                        className="w-full flex items-center justify-center gap-2 bg-white text-black font-black text-sm uppercase tracking-wider py-3.5 rounded-xl hover:bg-neutral-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? (
                            <span className="flex items-center gap-2"><Zap className="animate-spin" size={16} /> Đang xử lý...</span>
                        ) : (
                            <span>Thanh toán ${activeTier?.price}</span>
                        )}
                    </button>
                </div>

            </div>
        </>
    );
};