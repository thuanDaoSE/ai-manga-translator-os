import React from 'react';
import { motion } from 'framer-motion';
import {
  Wand2,
  ScanText,
  Type,
  UploadCloud,
  Cpu,
  Download,
  CheckCircle2,
  FileStack,
  Zap,
  Layers,
  ArrowRight,
} from 'lucide-react';
import SpotlightCard from './ui/SpotlightCard';
import ComparisonSlider from './ui/ComparisonSlider';
import PulsatingButton from './ui/PulsatingButton';
import { cn } from '../utils';

interface LandingPageProps {
  onOpenAuth?: () => void;
}

const fadeInUp: any = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

const staggerContainer: any = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
};

// Reusable section header
const SectionHeader = ({ label, title, sub }: { label: string; title: React.ReactNode; sub: string }) => (
  <div className="text-center mb-16 md:mb-20">
    <span className="inline-block text-[11px] font-black tracking-[0.18em] uppercase text-indigo-400 mb-4 px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/5">
      {label}
    </span>
    <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-5 tracking-tight leading-tight">{title}</h2>
    <p className="text-base md:text-lg text-neutral-500 max-w-2xl mx-auto leading-relaxed">{sub}</p>
  </div>
);

export default function LandingPage({ onOpenAuth }: LandingPageProps) {
  const workflowSteps = [
    {
      icon: UploadCloud,
      step: '01',
      title: 'Tải Manga Lên',
      desc: 'Kéo thả toàn bộ chương truyện gốc (RAW) định dạng JPG, PNG hoặc WEBP. Hỗ trợ xử lý hàng loạt cả chapter.',
      color: 'indigo',
    },
    {
      icon: Cpu,
      step: '02',
      title: 'AI Xử Lý Tự Động',
      desc: 'YOLO định vị khung thoại, OCR đọc chữ Nhật, DeepSeek-V3 dịch ngữ cảnh, LaMa GPU tẩy nền sạch tinh tươm.',
      color: 'purple',
    },
    {
      icon: Download,
      step: '03',
      title: 'Xuất Bản Hoàn Thiện',
      desc: 'Tải về ảnh JPG đã dịch hoàn chỉnh hoặc file PSD tách layer chữ chỉnh sửa được thẳng trong Photoshop.',
      color: 'pink',
    },
  ];

  const lightFeatures = [
    'Dịch thuật AI & Tẩy nền GPU',
    'Tự động canh lề chống tràn khung thoại',
    'Xuất ảnh JPG độ phân giải cao',
    'Bộ font chữ mặc định đầy đủ',
  ];

  const popularFeatures = [
    'Mọi tính năng của gói Trải Nghiệm',
    'Ưu tiên xử lý cao — không chờ hàng đợi',
    'Xuất file PSD tách lớp Photoshop',
    'Tự ngắt dòng thông minh theo âm tiết',
    'Upload font chữ cá nhân (.ttf, .otf)',
  ];

  const studioFeatures = [
    'Mọi tính năng của gói Dịch Giả',
    'Từ điển thuật ngữ dùng chung cả nhóm',
    'Hệ thống Workspace cộng tác nhóm dịch',
    'API tăng tốc Multi-thread độc quyền',
    'Hỗ trợ kỹ thuật chuyên biệt 24/7',
  ];

  const featureCards = [
    {
      icon: ScanText,
      color: 'indigo',
      tag: 'OCR + LLM',
      title: 'Nhận Diện OCR & Dịch Thuật DeepSeek',
      desc: 'Mô hình YOLO-Nano tùy chỉnh định vị bong bóng thoại siêu tốc. DeepSeek-V3 dịch sát nghĩa ngữ cảnh, giữ nguyên đại từ nhân xưng và phong cách truyện.',
    },
    {
      icon: Wand2,
      color: 'purple',
      tag: 'LaMa GPU',
      title: 'Tẩy Nền Inpainting Hoàn Hảo',
      desc: 'Thuật toán LaMa Inpainting trên cụm GPU Runpod hiệu năng cao tự động vẽ lại chi tiết tranh bị chữ gốc đè lên. Sản phẩm sạch tuyệt đối, không tì vết.',
    },
    {
      icon: Layers,
      color: 'pink',
      tag: 'PSD Export',
      title: 'Xuất File PSD Tách Layer Chữ',
      desc: 'Tính năng độc quyền: Xuất thẳng file PSD có các Text Layer tiếng Việt chỉnh sửa được trong Photoshop. Không cần copy-paste. Không cần gõ lại từ đầu.',
    },
    {
      icon: Type,
      color: 'amber',
      tag: 'Typesetting',
      title: 'Typesetting Thông Minh',
      desc: 'Thuật toán chống tràn chữ anti-overflow. Tự động co giãn kích thước, ngắt dòng theo âm tiết và căn lề chuyên nghiệp trong từng ô thoại.',
    },
    {
      icon: Zap,
      color: 'emerald',
      tag: 'Tốc độ',
      title: '10 Giây Cho Mỗi Trang',
      desc: 'Quy trình End-to-end hoàn toàn tự động từ ảnh RAW đến PSD Việt hoá chỉ trong 10–30 giây mỗi trang. Tăng 270 lần so với quy trình làm tay truyền thống.',
    },
    {
      icon: FileStack,
      color: 'sky',
      tag: 'Batch',
      title: 'Xử Lý Hàng Loạt Cả Chapter',
      desc: 'Tải lên toàn bộ 30–50 trang cùng lúc. Hệ thống tự động xử lý song song và thông báo khi hoàn tất. Dịch cả chương truyện trong vài phút.',
    },
  ];

  const colorMap: Record<string, { icon: string; bg: string; border: string; tag: string }> = {
    indigo: { icon: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', tag: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
    purple: { icon: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', tag: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
    pink: { icon: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20', tag: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
    amber: { icon: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', tag: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    emerald: { icon: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', tag: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    sky: { icon: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', tag: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  };

  const workflowColorMap: Record<string, { ring: string; glow: string; num: string }> = {
    indigo: { ring: 'border-indigo-500/40', glow: 'shadow-indigo-500/10', num: 'text-indigo-500' },
    purple: { ring: 'border-purple-500/40', glow: 'shadow-purple-500/10', num: 'text-purple-500' },
    pink: { ring: 'border-pink-500/40', glow: 'shadow-pink-500/10', num: 'text-pink-500' },
  };

  return (
    <div className="h-[100dvh] w-full overflow-x-hidden overflow-y-auto bg-[#080810] text-neutral-200 font-sans selection:bg-indigo-500/30 selection:text-white antialiased">

      {/* ── Background ambient glows ── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] rounded-full bg-indigo-950/60 blur-[160px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[60vw] h-[60vw] rounded-full bg-purple-950/50 blur-[160px]" />
      </div>

      {/* ════════════════════════════════
          NAVIGATION
      ════════════════════════════════ */}
      <nav className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#080810]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3 group cursor-pointer select-none">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-indigo-500/30 group-hover:shadow-indigo-500/50 transition-shadow">
              DK
            </div>
            <span className="font-bold text-[1.1rem] tracking-tight text-white">
              DeepKoma<span className="text-indigo-500">.</span>ai
            </span>
          </div>

          {/* Links */}
          <div className="hidden md:flex items-center gap-7 text-[13px] font-medium text-neutral-500">
            {['Tính Năng', 'Quy Trình', 'Bảng Giá'].map((label, i) => (
              <a
                key={i}
                href={['#features', '#how-it-works', '#pricing'][i]}
                className="hover:text-white transition-colors duration-200 relative after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-[1.5px] after:bg-indigo-500 after:transition-[width] after:duration-300 hover:after:w-full"
              >
                {label}
              </a>
            ))}
          </div>

          {/* Auth CTA */}
          <PulsatingButton text="Đăng Nhập" primary={false} onClick={onOpenAuth} />
        </div>
      </nav>

      {/* ════════════════════════════════
          HERO
      ════════════════════════════════ */}
      <section className="relative z-10 pt-28 pb-16 px-6 overflow-hidden">
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_65%_55%_at_50%_0%,#000_60%,transparent_100%)] pointer-events-none" />
        {/* Center glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-gradient-to-b from-indigo-500/12 via-purple-500/6 to-transparent blur-[120px] pointer-events-none" />

        {/* ── Floating Widgets (xl only) ── */}
        <div className="absolute inset-0 hidden xl:block pointer-events-none z-20">

          {/* Widget: PSD Layer Panel */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0, y: [0, -12, 0] }}
            transition={{
              opacity: { duration: 0.8, delay: 0.3 },
              x: { duration: 0.8, delay: 0.3 },
              y: { repeat: Infinity, duration: 6, ease: 'easeInOut' },
            }}
            className="pointer-events-auto absolute left-[4%] top-[28%] w-[268px] rounded-2xl bg-neutral-900/95 border border-white/[0.09] backdrop-blur-lg shadow-[0_24px_60px_rgba(0,0,0,0.7)] overflow-hidden"
          >
            {/* Title bar */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.07] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-[4px] bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-[9px] font-black text-white">Ps</span>
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Layers Panel</span>
              </div>
              <span className="text-[8px] px-1.5 py-[2px] rounded-[4px] bg-emerald-500/15 text-emerald-400 font-black font-mono tracking-wide border border-emerald-500/20">READY</span>
            </div>
            {/* Layer tree */}
            <div className="px-3 py-3 space-y-1 text-[11px]">
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/15">
                <span className="text-neutral-500 text-[9px]">📁</span>
                <span className="text-white font-semibold tracking-wide">Group: Text Việt Hóa</span>
              </div>
              {[
                { text: '"Cái gì thế này!?"', badge: 'TEXT' },
                { text: '"Ngươi... là ai?"', badge: 'EDIT' },
                { text: '"Không thể thế này!"', badge: 'TEXT' },
              ].map(({ text, badge }) => (
                <div key={text} className="flex items-center justify-between pl-6 pr-2 py-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-indigo-400 font-black font-mono w-[14px] h-[14px] rounded-[3px] border border-indigo-500/30 flex items-center justify-center bg-indigo-500/8 text-[9px] shrink-0">T</span>
                    <span className="text-neutral-300 font-mono truncate">{text}</span>
                  </div>
                  <span className="text-[7.5px] text-indigo-400 font-black font-mono ml-2 shrink-0">{badge}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 px-2 py-1.5 mt-1 border-t border-white/[0.05]">
                <span className="text-neutral-600 text-[9px]">🖼️</span>
                <span className="text-neutral-500">Background (Cleaned · LaMa AI)</span>
              </div>
            </div>
          </motion.div>

          {/* Widget: Time Comparison */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0, y: [0, 12, 0] }}
            transition={{
              opacity: { duration: 0.8, delay: 0.45 },
              x: { duration: 0.8, delay: 0.45 },
              y: { repeat: Infinity, duration: 7.5, ease: 'easeInOut', delay: 0.5 },
            }}
            className="pointer-events-auto absolute right-[4%] top-[32%] w-[252px] rounded-2xl bg-neutral-900/95 border border-white/[0.09] backdrop-blur-lg shadow-[0_24px_60px_rgba(0,0,0,0.7)] overflow-hidden"
          >
            <div className="px-3.5 py-2.5 border-b border-white/[0.07] bg-white/[0.02]">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Tốc Độ Hoàn Thiện</span>
            </div>
            <div className="px-3.5 py-3.5 space-y-3.5">
              <div>
                <div className="flex justify-between text-[10.5px] mb-1.5">
                  <span className="text-neutral-500">Thủ công (Redraw + Typeset)</span>
                  <span className="text-red-400 font-bold">45 phút</span>
                </div>
                <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '85%' }}
                    transition={{ duration: 1, delay: 0.8 }}
                    className="h-full bg-red-500/50 rounded-full"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10.5px] mb-1.5">
                  <span className="text-indigo-400 font-bold flex items-center gap-1"><Zap className="w-3 h-3" /> DeepKoma AI</span>
                  <span className="text-emerald-400 font-bold">10 giây</span>
                </div>
                <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '8%' }}
                    transition={{ duration: 0.8, delay: 1.1 }}
                    className="h-full bg-gradient-to-r from-emerald-400 to-indigo-500 rounded-full"
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-white/[0.05] flex justify-between items-center text-[10px] font-mono">
                <span className="text-neutral-600">Tăng hiệu suất</span>
                <span className="text-indigo-400 font-black">270×</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Hero Copy ── */}
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-4xl mx-auto flex flex-col items-center"
          >
            {/* Status badge */}
            <motion.div
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-4 py-[6px] rounded-full mb-8 text-[12px] font-semibold text-indigo-300 bg-indigo-500/[0.08] border border-indigo-500/20 backdrop-blur select-none cursor-default"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
              YOLO-Nano OCR · DeepSeek-V3 · LaMa Inpainting — Đang Hoạt Động
            </motion.div>

            {/* H1 */}
            <motion.h1
              variants={fadeInUp}
              className="text-[2.8rem] sm:text-6xl md:text-7xl lg:text-[5.5rem] font-extrabold tracking-[-0.03em] leading-[1.04] mb-6 text-white"
            >
              Dịch Manga Trong{' '}
              <span className="relative inline-block">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400">
                  30 Giây.
                </span>
              </span>
              <br className="hidden sm:block" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/60">
                Xuất File PSD Tách Layer Chữ.
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={fadeInUp}
              className="text-base md:text-lg text-neutral-400 max-w-2xl leading-relaxed mb-10"
            >
              Mệt mỏi với <span className="text-neutral-200 font-medium">Redraw thủ công</span> và copy-paste từng dòng thoại vào Photoshop?{' '}
              DeepKoma tẩy chữ bằng{' '}
              <span className="text-pink-300 font-medium">LaMa GPU</span>, dịch ngữ cảnh bằng{' '}
              <span className="text-indigo-300 font-medium">DeepSeek-V3</span> và xuất thẳng{' '}
              <span className="text-violet-300 font-medium">PSD layer chữ chỉnh sửa được</span>.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center gap-4 mb-10">
              <PulsatingButton text="Bắt Đầu Miễn Phí — Nhận 20 Credits" onClick={onOpenAuth} />
              <button
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-[13.5px] font-semibold text-neutral-400 hover:text-white border border-white/[0.08] hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] transition-all cursor-pointer group"
              >
                Xem quy trình
                <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </motion.div>

            {/* Trust signals */}
            <motion.div variants={fadeInUp} className="flex items-center flex-wrap justify-center gap-x-7 gap-y-2 text-[12px] text-neutral-600 select-none font-medium mb-16">
              {[
                'Tẩy hội thoại đè tranh tự động',
                'Xuất PSD đầy đủ layer text',
                'Dịch ngữ cảnh DeepSeek-V3',
              ].map((item, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  {item}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* Comparison Slider */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.9, ease: [0.22, 1, 0.36, 1] as any }}
            className="w-full"
          >
            <ComparisonSlider />
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════
          FEATURES
      ════════════════════════════════ */}
      <section id="features" className="relative z-10 py-28 px-6 border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            label="Tính Năng"
            title={<>Chuẩn Mực Mới Trong<br className="hidden md:block" /> Dịch Thuật Manga AI</>}
            sub="Chúng tôi thay thế hàng ngày làm thủ công bằng các mô hình học máy chạy song song trên GPU hiệu năng cao."
          />

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {featureCards.map((card, i) => {
              const c = colorMap[card.color];
              const Icon = card.icon;
              return (
                <motion.div key={i} variants={fadeInUp} className="h-full">
                  <SpotlightCard>
                    <div className="flex items-start justify-between mb-5">
                      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center border', c.bg, c.border)}>
                        <Icon className={cn('w-6 h-6', c.icon)} />
                      </div>
                      <span className={cn('text-[10px] font-black tracking-widest uppercase px-2 py-1 rounded-lg border', c.tag)}>
                        {card.tag}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-bold text-white mb-2.5 leading-snug">{card.title}</h3>
                    <p className="text-neutral-500 leading-relaxed text-sm">{card.desc}</p>
                  </SpotlightCard>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════ */}
      <section id="how-it-works" className="relative z-10 py-28 px-6 border-t border-white/[0.06] overflow-hidden">
        {/* Subtle radial bg */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(99,102,241,0.04),transparent_70%)] pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10">
          <SectionHeader
            label="Quy Trình"
            title="Từ RAW Đến PSD Trong 3 Bước"
            sub="Quy trình hoàn toàn tự động. Không cần cài đặt phần mềm. Không cần kiến thức kỹ thuật."
          />

          <div className="relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-[52px] left-[18%] right-[18%] h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={staggerContainer}
              className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6"
            >
              {workflowSteps.map((step, idx) => {
                const wc = workflowColorMap[step.color];
                const Icon = step.icon;
                return (
                  <motion.div key={idx} variants={fadeInUp} className="flex flex-col items-center text-center group">
                    {/* Icon circle */}
                    <div className={cn(
                      'relative w-[104px] h-[104px] rounded-full border-2 bg-neutral-900/80 flex flex-col items-center justify-center mb-6',
                      wc.ring,
                      `shadow-[0_0_40px_rgba(0,0,0,0.5)] hover:shadow-[0_0_50px_rgba(0,0,0,0.6)] transition-shadow`
                    )}>
                      <span className={cn('absolute top-2 right-2 text-[10px] font-black font-mono opacity-50', wc.num)}>{step.step}</span>
                      <Icon className="w-9 h-9 text-white opacity-80" />
                    </div>
                    <h4 className="text-lg font-bold text-white mb-2">{step.title}</h4>
                    <p className="text-sm text-neutral-500 leading-relaxed max-w-[260px]">{step.desc}</p>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          PRICING
      ════════════════════════════════ */}
      <section id="pricing" className="relative z-10 py-28 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            label="Bảng Giá"
            title="Thanh Toán Theo Mức Sử Dụng"
            sub="Không phí duy trì hàng tháng. Không gói cước ẩn. Chỉ trả tiền cho số trang truyện thực tế bạn cần dịch."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">

            {/* Tier 1 */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
              className="flex flex-col p-8 rounded-2xl bg-neutral-900/40 border border-white/[0.08] backdrop-blur-sm"
            >
              <div className="mb-8 flex-1">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold text-white">Gói Trải Nghiệm</h3>
                  <span className="text-[10px] font-black tracking-widest uppercase px-2 py-[3px] rounded-md border text-neutral-500 border-neutral-700 bg-neutral-800">STARTER</span>
                </div>
                <div className="mb-1">
                  <span className="text-4xl font-extrabold text-white tracking-tight">$4.99</span>
                </div>
                <p className="text-sm text-neutral-600 mb-6 pb-6 border-b border-white/[0.06]">50 Credits · ~2 Chương truyện</p>
                <ul className="space-y-3">
                  {lightFeatures.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-neutral-400">
                      <CheckCircle2 className="w-4 h-4 text-neutral-600 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={onOpenAuth}
                className="w-full py-3 rounded-xl text-[13.5px] font-semibold text-neutral-300 hover:text-white border border-white/[0.08] hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.07] transition-all cursor-pointer"
              >
                Mua Credits
              </button>
            </motion.div>

            {/* Tier 2 — Popular */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="flex flex-col relative p-8 rounded-2xl bg-neutral-900 border-2 border-indigo-500/50 shadow-[0_0_60px_rgba(99,102,241,0.12)]"
            >
              {/* Popular badge */}
              <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[10px] font-black tracking-[0.16em] uppercase px-4 py-[5px] rounded-full shadow-lg">
                Khuyên Dùng
              </div>

              <div className="mb-8 flex-1">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold text-white">Dịch Giả Nghiệp Dư</h3>
                  <span className="text-[10px] font-black tracking-widest uppercase px-2 py-[3px] rounded-md border text-indigo-400 border-indigo-500/30 bg-indigo-500/10">PRO</span>
                </div>
                <div className="mb-1">
                  <span className="text-4xl font-extrabold text-white tracking-tight">$14.99</span>
                </div>
                <p className="text-sm text-indigo-400 font-semibold mb-6 pb-6 border-b border-white/[0.06]">200 Credits · ~10 Chương truyện</p>
                <ul className="space-y-3">
                  {popularFeatures.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-white/80">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={onOpenAuth}
                className="w-full py-3.5 rounded-xl text-[13.5px] font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 shadow-[0_0_24px_rgba(99,102,241,0.35)] hover:shadow-[0_0_32px_rgba(99,102,241,0.5)] transition-all cursor-pointer"
              >
                Mua Credits
              </button>
            </motion.div>

            {/* Tier 3 */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.15 }}
              className="flex flex-col p-8 rounded-2xl bg-neutral-900/40 border border-white/[0.08] backdrop-blur-sm"
            >
              <div className="mb-8 flex-1">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold text-white">Scanlation Studio</h3>
                  <span className="text-[10px] font-black tracking-widest uppercase px-2 py-[3px] rounded-md border text-violet-400 border-violet-500/30 bg-violet-500/10">TEAM</span>
                </div>
                <div className="mb-1">
                  <span className="text-4xl font-extrabold text-white tracking-tight">$49.99</span>
                </div>
                <p className="text-sm text-neutral-600 mb-6 pb-6 border-b border-white/[0.06]">1000 Credits · ~50 Chương truyện</p>
                <ul className="space-y-3">
                  {studioFeatures.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-neutral-400">
                      <CheckCircle2 className="w-4 h-4 text-neutral-600 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={onOpenAuth}
                className="w-full py-3 rounded-xl text-[13.5px] font-semibold text-neutral-300 hover:text-white border border-white/[0.08] hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.07] transition-all cursor-pointer"
              >
                Mua Credits
              </button>
            </motion.div>
          </div>

          {/* Bottom note */}
          <p className="text-center text-[12px] text-neutral-700 mt-8">
            Credits không có hạn sử dụng · Thanh toán một lần qua PayOS · Không có phí định kỳ ẩn
          </p>
        </div>
      </section>

      {/* ════════════════════════════════
          FOOTER CTA + FOOTER
      ════════════════════════════════ */}
      <footer className="relative z-10 border-t border-white/[0.06] overflow-hidden">
        {/* CTA Block */}
        <div className="relative py-28 px-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(99,102,241,0.1),transparent_65%)] pointer-events-none" />
          <div className="max-w-3xl mx-auto text-center relative z-10">
            <p className="text-[11px] font-black tracking-[0.18em] uppercase text-indigo-400 mb-4">Sẵn Sàng Chưa?</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-5">
              Tăng Tốc Dự Án Của Bạn<br />Ngay Hôm Nay
            </h2>
            <p className="text-neutral-500 text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
              Tham gia cùng hàng trăm nhóm dịch tự do và dịch giả độc lập đang tối ưu hóa quy trình bằng DeepKoma.
            </p>
            <PulsatingButton text="Bắt Đầu Miễn Phí — Nhận 20 Credits" onClick={onOpenAuth} />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.05] px-6 py-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-neutral-600">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-white text-[11px]">DK</div>
              <span>© 2026 DeepKoma Inc. Bảo lưu mọi quyền.</span>
            </div>
            <div className="flex items-center gap-6 font-medium">
              <a href="#" className="hover:text-white transition-colors">Điều khoản dịch vụ</a>
              <a href="#" className="hover:text-white transition-colors">Chính sách bảo mật</a>
              <a href="#" className="hover:text-white transition-colors flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Twitter
              </a>
              <a href="#" className="hover:text-white transition-colors flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}