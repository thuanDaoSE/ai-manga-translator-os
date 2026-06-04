import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    ChevronRight
} from 'lucide-react';

// ==========================================
// COMPONENT 1: Thẻ Spotlight (Ánh sáng theo chuột)
// ==========================================
const SpotlightCard: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => {
    const divRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [opacity, setOpacity] = useState(0);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!divRef.current) return;
        const rect = divRef.current.getBoundingClientRect();
        setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    return (
        <div
            ref={divRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setOpacity(1)}
            onMouseLeave={() => setOpacity(0)}
            className={`relative overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/50 backdrop-blur-md shadow-2xl transition-colors duration-300 ${className}`}
        >
            <div
                className="pointer-events-none absolute -inset-px transition duration-300 z-0"
                style={{
                    opacity,
                    background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(255,255,255,0.08), transparent 40%)`,
                }}
            />
            <div className="relative z-10 p-8 h-full flex flex-col">{children}</div>
        </div>
    );
};

// ==========================================
// COMPONENT 2: Thanh trượt So sánh Trước/Sau
// ==========================================
const ComparisonSlider: React.FC = () => {
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMove = (clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        setSliderPosition(Math.max(0, Math.min((x / rect.width) * 100, 100)));
    };

    useEffect(() => {
        const handleMouseUp = () => setIsDragging(false);
        const handleMouseMove = (e: MouseEvent) => { if (isDragging) handleMove(e.clientX); };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    return (
        <div
            className="relative w-full aspect-[3/4] md:aspect-[16/10] max-w-4xl mx-auto rounded-2xl overflow-hidden cursor-ew-resize border border-white/10 shadow-2xl bg-neutral-900 group"
            ref={containerRef}
            onMouseDown={(e) => { setIsDragging(true); handleMove(e.clientX); }}
        >
            {/* Lớp nền: Truyện gốc tiếng Nhật (Thay URL ảnh thật của dự án vào đây) */}
            <div className="absolute inset-0 bg-neutral-800 bg-[url('https://images.unsplash.com/photo-1607513746994-51f730a44832?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center grayscale opacity-60">
                <span className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-white/80 border border-white/10">RAW (Nhật Bản)</span>
            </div>

            {/* Lớp Overlay: Truyện đã dịch (Thay URL ảnh thật của dự án vào đây) */}
            <div
                className="absolute inset-0 bg-neutral-900 overflow-hidden bg-[url('https://images.unsplash.com/photo-1607513746994-51f730a44832?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center"
                style={{ width: `${sliderPosition}%` }}
            >
                <span className="absolute top-4 left-4 bg-indigo-600/80 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-white border border-indigo-400/30">CLEAN (Việt Nam)</span>
            </div>

            {/* Thanh chia cắt */}
            <div
                className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_20px_rgba(255,255,255,0.7)] z-20 flex items-center justify-center -translate-x-1/2"
                style={{ left: `${sliderPosition}%` }}
            >
                <div className="w-10 h-10 rounded-full bg-white text-neutral-950 flex items-center justify-center shadow-xl transition-transform duration-300 group-hover:scale-110">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="rotate-180"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// COMPONENT 3: Nút Call-To-Action (Hiệu ứng nhịp đập)
// ==========================================
const PulsatingButton: React.FC<{ text: string; primary?: boolean }> = ({ text, primary = true }) => (
    <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className={`relative group overflow-hidden rounded-full font-bold transition-all tracking-wide ${primary ? 'px-8 py-4 text-white shadow-lg' : 'px-6 py-3 text-neutral-300 hover:text-white bg-white/5 border border-white/10'}`}
    >
        {primary && (
            <>
                <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full opacity-80 group-hover:opacity-100 transition-opacity duration-300 blur-xl pointer-events-none" />
                <span className="absolute inset-px bg-neutral-950 rounded-full z-0" />
                <span className="absolute inset-0 bg-gradient-to-r from-indigo-600/30 to-purple-600/30 rounded-full z-0" />
            </>
        )}
        <span className="relative z-10 flex items-center justify-center gap-2">
            {text} {primary && <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
        </span>
    </motion.button>
);

// ==========================================
// TRANG CHÍNH: LANDING PAGE
// ==========================================
export default function LandingPage() {
    const fadeInUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7 } } };
    const staggerContainer = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.15 } } };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans overflow-x-hidden antialiased">

            {/* Background Kính Lỏng (Liquid Glass) */}
            <div className="fixed inset-0 z-0 pointer-events-none flex justify-center items-center overflow-hidden">
                <div className="absolute top-[-15%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-900/15 blur-[140px] mix-blend-screen animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-15%] w-[50vw] h-[50vw] rounded-full bg-purple-900/15 blur-[140px] mix-blend-screen" />
            </div>

            {/* Navbar */}
            <nav className="relative z-50 w-full px-6 py-5 border-b border-white/5 bg-neutral-950/60 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-extrabold text-white text-lg">DK</div>
                        <span className="font-bold text-2xl text-white">DeepKoma</span>
                    </div>
                    <PulsatingButton text="Đăng Nhập" primary={false} />
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative z-10 pt-32 pb-24 px-6">
                <div className="max-w-7xl mx-auto text-center flex flex-col items-center">
                    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-4xl flex flex-col items-center">
                        <motion.h1 variants={fadeInUp} className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 mb-8 leading-tight">
                            Dịch Thuật Manga <br /> Nhanh Hơn 10 Lần Với AI
                        </motion.h1>
                        <motion.p variants={fadeInUp} className="text-xl text-neutral-400 mb-12 max-w-2xl">
                            Phá bỏ nút thắt cổ chai trong ngành Scanlation. Kết hợp sức mạnh dịch thuật DeepSeek, tái tạo ảnh nền LaMa GPU và tự động ghép chữ thông minh.
                        </motion.p>
                        <motion.div variants={fadeInUp} className="mb-24">
                            <PulsatingButton text="Bắt đầu miễn phí - Nhận 20 Credits" />
                        </motion.div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.9 }} className="w-full relative">
                        <ComparisonSlider />
                    </motion.div>
                </div>
            </section>

            {/* Phân vùng Bảng giá */}
            <section className="relative z-10 py-32 px-6 bg-neutral-950/80 border-t border-white/5">
                <div className="max-w-7xl mx-auto text-center">
                    <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-6">Thanh Toán Theo Mức Sử Dụng</h2>
                    <p className="text-xl text-neutral-400 max-w-2xl mx-auto mb-24">Không phí duy trì. Không ràng buộc. Chỉ trả tiền cho sức mạnh GPU và số lượng API Tokens bạn thực sự tiêu thụ.</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-center text-left">
                        {/* Gói Phổ biến (Nổi bật nhất) */}
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1.05 }} className="relative p-10 rounded-3xl bg-neutral-900 border-2 border-indigo-500/50 shadow-2xl shadow-indigo-500/20 md:col-start-2">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6 py-2 rounded-full text-sm font-bold tracking-widest shadow-lg">PHỔ BIẾN NHẤT</div>
                            <h3 className="text-2xl font-semibold text-white mb-3">Manga Enthusiast</h3>
                            <div className="flex items-baseline gap-1 mb-8">
                                <span className="text-5xl font-extrabold text-white">$14.99</span>
                            </div>
                            <p className="text-base text-indigo-300 mb-10 border-b border-white/10 pb-10">200 Tín dụng (~10 Chương truyện)</p>
                            <button className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold shadow-lg transition-all text-lg">Mua Tín Dụng</button>
                        </motion.div>
                    </div>
                </div>
            </section>

        </div>
    );
}