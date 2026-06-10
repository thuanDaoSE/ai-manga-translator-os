import React from 'react';
import { motion } from 'framer-motion';
import {
  Wand2,
  ScanText,
  Type,
  UploadCloud,
  Cpu,
  Download,
  CheckCircle2
} from 'lucide-react';
import SpotlightCard from './ui/SpotlightCard';
import ComparisonSlider from './ui/ComparisonSlider';
import PulsatingButton from './ui/PulsatingButton';
import { cn } from '../utils';

// --- Type Definitions for Props ---
interface LandingPageProps {
  onOpenAuth?: () => void;
}

// --- Page Assembly & Application Layout ---

// Motion primitives for coordinated scroll-reveal sequences using composite properties (no CLS)
const fadeInUp: any = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }
};

const staggerContainer: any = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
};

export default function LandingPage({ onOpenAuth }: LandingPageProps) {
  const workflowSteps = [
    {
      icon: UploadCloud,
      title: "1. Tải Manga Lên",
      desc: "Kéo thả toàn bộ chương truyện gốc (RAW) định dạng JPG, PNG hoặc WEBP."
    },
    {
      icon: Cpu,
      title: "2. AI Xử Lý Tự Động",
      desc: "YOLO định vị khung thoại, OCR đọc chữ Nhật, DeepSeek dịch ngữ cảnh và LaMa GPU xóa nền."
    },
    {
      icon: Download,
      title: "3. Xuất Bản Hoàn Thiện",
      desc: "Tải xuống ảnh dịch hoàn chỉnh hoặc file PSD tách layer chữ chuyên nghiệp cho Photoshop."
    }
  ];

  const lightFeatures = [
    "Dịch thuật AI & Tẩy nền GPU",
    "Tự động canh lề chống tràn khung thoại",
    "Hỗ trợ xuất ảnh JPG độ phân giải cao",
    "Đầy đủ bộ font chữ mặc định chuẩn",
  ];

  const popularFeatures = [
    "Mọi tính năng của gói Light Pack",
    "Độ ưu tiên xử lý cao (Không cần chờ hàng đợi)",
    "Xuất file PSD tách lớp Photoshop chuẩn chỉnh",
    "Hệ thống tự động ngắt dòng thông minh theo âm tiết",
    "Hỗ trợ tải lên bộ font chữ cá nhân (.ttf, .otf)",
  ];

  const studioFeatures = [
    "Mọi tính năng của gói Enthusiast",
    "Từ điển thuật ngữ (Glossary) dùng chung cho nhóm",
    "Hệ thống quản lý nhóm (Workspace cộng tác)",
    "Độc quyền API tăng tốc độ dịch (Multi-thread)",
    "Đội ngũ kỹ thuật hỗ trợ chuyên biệt 24/7",
  ];

  return (
    <div className={cn("h-[100dvh] w-full overflow-x-hidden overflow-y-auto bg-neutral-950 text-neutral-200 font-sans selection:bg-indigo-500/30 selection:text-white antialiased relative z-10")}>

      {/* Global Fluid Glassmorphic Background Canvas - GPU Accelerated */}
      <div className={cn("fixed inset-0 z-0 pointer-events-none flex justify-center items-center overflow-hidden")}>
        <div className={cn("absolute top-[-15%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-900/15 blur-[140px] mix-blend-screen animate-pulse transform-gpu will-change-[opacity] pointer-events-none")} />
        <div className={cn("absolute bottom-[-10%] right-[-15%] w-[50vw] h-[50vw] rounded-full bg-purple-900/15 blur-[140px] mix-blend-screen transform-gpu will-change-[opacity] pointer-events-none")} />
      </div>

      {/* Main Navigation Header */}
      <nav className={cn("relative z-50 w-full px-6 py-5 border-b border-white/5 bg-neutral-950/60 backdrop-blur-xl")}>
        <div className={cn("max-w-7xl mx-auto flex justify-between items-center")}>
          <div className={cn("flex items-center gap-3")}>
            <div className={cn("w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-extrabold text-white shadow-lg shadow-purple-500/20 text-lg")}>DK</div>
            <span className={cn("font-bold text-2xl tracking-tight text-white")}>DeepKoma</span>
          </div>
          <div className={cn("hidden md:flex items-center gap-8 text-sm font-semibold text-neutral-400")}>
            <a href="#features" className={cn("hover:text-white transition-colors")}>Tính Năng</a>
            <a href="#how-it-works" className={cn("hover:text-white transition-colors")}>Quy Trình</a>
            <a href="#pricing" className={cn("hover:text-white transition-colors")}>Bảng Giá</a>
          </div>
          <div>
            <PulsatingButton text="Đăng Nhập" primary={false} onClick={onOpenAuth} />
          </div>
        </div>
      </nav>

      {/* 1. Hero Section (The Hook) */}
      <section className={cn("relative z-10 pt-24 pb-20 px-6")}>
        <div className={cn("max-w-7xl mx-auto text-center flex flex-col items-center")}>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className={cn("max-w-4xl flex flex-col items-center")}
          >
            <motion.div variants={fadeInUp} className={cn("inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs md:text-sm font-medium text-neutral-300 mb-8 backdrop-blur-md shadow-xl select-none")}>
              <span className={cn("w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.8)]")} />
              YOLO-Nano OCR & Hạ Tầng DeepSeek-V3 Đang Hoạt Động
            </motion.div>

            <motion.h1 variants={fadeInUp} className={cn("text-4xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white via-white/95 to-white/40 tracking-tighter leading-[1.1] mb-8")}>
              Dịch Thuật Manga <br className={cn("hidden md:block")} /> Nhanh Hơn 10 Lần Với AI
            </motion.h1>

            <motion.p variants={fadeInUp} className={cn("text-base md:text-xl text-neutral-400 mb-10 max-w-3xl leading-relaxed")}>
              Giải phóng sức lao động trong dịch truyện. Tích hợp dịch thuật ngữ cảnh DeepSeek, tẩy nền inpainting LaMa tăng tốc bằng GPU và tự động căn chữ typesetting thông minh chỉ trong một quy trình duy nhất.
            </motion.p>

            <motion.div variants={fadeInUp} className={cn("flex flex-col sm:flex-row gap-5 mb-20")}>
              <PulsatingButton text="Bắt Đầu Miễn Phí - Nhận 20 Credits" onClick={onOpenAuth} />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.9, ease: [0.22, 1, 0.36, 1] as any }}
            className={cn("w-full relative")}
          >
            <ComparisonSlider />
          </motion.div>
        </div>
      </section>

      {/* 2. Features Matrix (The "Aha!" Moment) */}
      <section id="features" className={cn("relative z-10 py-28 px-6 bg-neutral-950/40 border-t border-white/5")}>
        <div className={cn("max-w-7xl mx-auto")}>
          <div className={cn("text-center mb-20")}>
            <h2 className={cn("text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight animate-fade-in")}>Chuẩn Mực Mới Trong Dịch Thuật Manga</h2>
            <p className={cn("text-base md:text-lg text-neutral-400 max-w-2xl mx-auto")}>Chúng tôi thay thế hàng ngày làm việc thủ công (xóa chữ, vẽ nền, căn chữ) bằng các mô hình học máy song song chạy trên GPU tốc độ cao.</p>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className={cn("grid grid-cols-1 md:grid-cols-3 gap-8")}
          >
            <motion.div variants={fadeInUp} className={cn("h-full")}>
              <SpotlightCard>
                <div className={cn("w-14 h-14 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6 shadow-lg shadow-indigo-500/5")}>
                  <ScanText className={cn("w-7 h-7")} />
                </div>
                <h3 className={cn("text-xl font-bold text-white mb-3")}>Nhận Diện OCR & DeepSeek</h3>
                <p className={cn("text-neutral-400 leading-relaxed text-sm")}>
                  Mô hình YOLO-Nano tùy chỉnh định vị bong bóng thoại siêu tốc. Kết hợp trí tuệ nhân tạo DeepSeek dịch sát nghĩa ngữ cảnh, giữ nguyên đại từ nhân xưng và tôn trọng bản sắc văn hóa truyện.
                </p>
              </SpotlightCard>
            </motion.div>

            <motion.div variants={fadeInUp} className={cn("h-full")}>
              <SpotlightCard>
                <div className={cn("w-14 h-14 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-6 shadow-lg shadow-purple-500/5")}>
                  <Wand2 className={cn("w-7 h-7")} />
                </div>
                <h3 className={cn("text-xl font-bold text-white mb-3")}>Tẩy Nền LaMa GPU</h3>
                <p className={cn("text-neutral-400 leading-relaxed text-sm")}>
                  Được vận hành trên cụm GPU hiệu năng cao của Runpod, thuật toán LaMa Inpainting tự động vẽ lại hoàn hảo những chi tiết tranh bị chữ gốc đè lên, tạo ra sản phẩm sạch tinh tươm không tì vết.
                </p>
              </SpotlightCard>
            </motion.div>

            <motion.div variants={fadeInUp} className={cn("h-full")}>
              <SpotlightCard>
                <div className={cn("w-14 h-14 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 mb-6 shadow-lg shadow-pink-500/5")}>
                  <Type className={cn("w-7 h-7")} />
                </div>
                <h3 className={cn("text-xl font-bold text-white mb-3 font-sans")}>Typesetting Thông Minh</h3>
                <p className={cn("text-neutral-400 leading-relaxed text-sm")}>
                  Được xây dựng với thuật toán chống tràn chữ (anti-overflow). Tự động co giãn kích thước chữ cho vừa khít hình học khung thoại, tự ngắt dòng tự nhiên và căn lề chuyên nghiệp.
                </p>
              </SpotlightCard>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* 3. Workflow Timeline (Frictionless Flow) */}
      <section id="how-it-works" className={cn("relative z-10 py-28 px-6 border-t border-white/5")}>
        <div className={cn("max-w-6xl mx-auto")}>
          <div className={cn("text-center mb-20")}>
            <h2 className={cn("text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight")}>Quy Trình Hoạt Động Siêu Tốc</h2>
            <p className={cn("text-base md:text-lg text-neutral-400")}>Từ các trang scan gốc thô sơ đến chap truyện dịch hoàn chỉnh chỉ trong 3 bước trực quan.</p>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={staggerContainer}
            className={cn("flex flex-col md:flex-row justify-between items-start md:items-center relative")}
          >
            {/* Visual connecting line (Desktop only) */}
            <div className={cn("hidden md:block absolute top-12 left-[15%] right-[15%] h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent z-0")} />

            {workflowSteps.map((step, idx) => (
              <motion.div key={idx} variants={fadeInUp} className={cn("relative z-10 flex flex-col items-center text-center w-full md:w-1/3 mb-12 md:mb-0 px-6")}>
                <div className={cn("w-20 h-20 rounded-full bg-neutral-950 border border-white/10 flex items-center justify-center text-white mb-6 shadow-[0_0_40px_rgba(99,102,241,0.08)] relative")}>
                  <div className={cn("absolute inset-0 rounded-full border border-indigo-500/50 animate-ping opacity-20")} style={{ animationDelay: `${idx * 0.3}s`, animationDuration: '3s' }} />
                  <step.icon className={cn("w-8 h-8 text-indigo-400")} />
                </div>
                <h4 className={cn("text-xl font-bold text-white mb-2")}>{step.title}</h4>
                <p className={cn("text-sm text-neutral-400 max-w-xs")}>{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* 4. Transparent Pay-As-You-Go Pricing */}
      <section id="pricing" className={cn("relative z-10 py-28 px-6 bg-neutral-950/80 border-t border-white/5")}>
        <div className={cn("max-w-7xl mx-auto")}>
          <div className={cn("text-center mb-20")}>
            <h2 className={cn("text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight")}>Thanh Toán Theo Mức Sử Dụng</h2>
            <p className={cn("text-base md:text-lg text-neutral-400 max-w-2xl mx-auto")}>Không phí duy trì hàng tháng. Không gói cước ẩn. Bạn chỉ cần trả tiền mua Tín dụng (Credits) cho số lượng trang truyện thực tế cần dịch.</p>
          </div>

          <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch")}>
            {/* Base Tier */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className={cn("p-8 md:p-10 rounded-3xl bg-neutral-900/40 border border-white/10 backdrop-blur-md flex flex-col justify-between")}
            >
              <div>
                <h3 className={cn("text-xl font-semibold text-white mb-2")}>Gói Trải Nghiệm</h3>
                <div className={cn("flex items-baseline gap-1 mb-6")}>
                  <span className={cn("text-4xl font-extrabold text-white")}>4.99 USD</span>
                </div>
                <p className={cn("text-sm text-neutral-400 mb-8 border-b border-white/10 pb-6 font-bold text-indigo-400")}>50 Credits (~2 Chương truyện)</p>
                <ul className={cn("space-y-4 mb-8")}>
                  {lightFeatures.map((feature, i) => (
                    <li key={i} className={cn("flex items-start gap-3 text-sm text-neutral-300")}>
                      <CheckCircle2 className={cn("w-5 h-5 text-neutral-500 shrink-0 mt-0.5")} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={onOpenAuth} className={cn("w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold border border-white/10 transition-colors text-base cursor-pointer")}>Mua Credits</button>
            </motion.div>

            {/* Optimal Tier */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1.02 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className={cn("relative p-8 md:p-10 rounded-3xl bg-neutral-900 border-2 border-indigo-500/60 shadow-2xl shadow-indigo-500/10 z-20 flex flex-col justify-between")}
            >
              <div className={cn("absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-5 py-1.5 rounded-full text-xs font-bold tracking-widest shadow-lg")}>KHUYÊN DÙNG</div>
              <div>
                <h3 className={cn("text-xl font-semibold text-white mb-2")}>Dịch Giả Nghiệp Dư</h3>
                <div className={cn("flex items-baseline gap-1 mb-6")}>
                  <span className={cn("text-4xl font-extrabold text-white")}>14.99 USD</span>
                </div>
                <p className={cn("text-sm text-indigo-300 mb-8 border-b border-white/10 pb-6 font-bold")}>200 Credits (~10 Chương truyện)</p>
                <ul className={cn("space-y-4 mb-8")}>
                  {popularFeatures.map((feature, i) => (
                    <li key={i} className={cn("flex items-start gap-3 text-sm text-white")}>
                      <CheckCircle2 className={cn("w-5 h-5 text-indigo-400 shrink-0 mt-0.5")} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={onOpenAuth} className={cn("w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all text-base tracking-wide cursor-pointer")}>Mua Credits</button>
            </motion.div>

            {/* Enterprise Tier */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className={cn("p-8 md:p-10 rounded-3xl bg-neutral-900/40 border border-white/10 backdrop-blur-md flex flex-col justify-between")}
            >
              <div>
                <h3 className={cn("text-xl font-semibold text-white mb-2")}>Scanlation Studio</h3>
                <div className={cn("flex items-baseline gap-1 mb-6")}>
                  <span className={cn("text-4xl font-extrabold text-white")}>49.99 USD</span>
                </div>
                <p className={cn("text-sm text-neutral-400 mb-8 border-b border-white/10 pb-6 font-bold text-indigo-400")}>1000 Credits (~50 Chương truyện)</p>
                <ul className={cn("space-y-4 mb-8")}>
                  {studioFeatures.map((feature, i) => (
                    <li key={i} className={cn("flex items-start gap-3 text-sm text-neutral-300")}>
                      <CheckCircle2 className={cn("w-5 h-5 text-neutral-500 shrink-0 mt-0.5")} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={onOpenAuth} className={cn("w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold border border-white/10 transition-colors text-base cursor-pointer")}>Mua Credits</button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 5. Footer & Trust Signals */}
      <footer className={cn("relative z-10 pt-32 pb-12 px-6 border-t border-white/5 overflow-hidden")}>
        <div className={cn("absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-indigo-900/20 via-neutral-950 to-neutral-950 pointer-events-none")} />

        <div className={cn("max-w-4xl mx-auto text-center relative z-10 mb-32")}>
          <h2 className={cn("text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight")}>Sẵn sàng tăng tốc dự án của bạn?</h2>
          <p className={cn("text-base md:text-lg text-neutral-400 mb-10 max-w-xl mx-auto")}>Tham gia cùng hàng trăm nhóm dịch tự do và các dịch giả độc lập tối ưu hóa quy trình làm việc ngay hôm nay.</p>
          <div className={cn("flex justify-center")}>
            <PulsatingButton text="Bắt Đầu Trải Nghiệm Miễn Phí" onClick={onOpenAuth} />
          </div>
        </div>

        <div className={cn("max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-xs md:text-sm text-neutral-500 relative z-10")}>
          <div className={cn("flex items-center gap-3")}>
            <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-sm shadow-md")}>DK</div>
            <span className={cn("font-medium")}>© 2026 DeepKoma Inc. Bảo lưu mọi quyền.</span>
          </div>
          <div className={cn("flex items-center gap-6 md:gap-8 font-medium")}>
            <a href="#" className={cn("hover:text-white transition-colors")}>Điều khoản dịch vụ</a>
            <a href="#" className={cn("hover:text-white transition-colors")}>Chính sách bảo mật</a>
            <a href="#" className={cn("hover:text-white transition-colors flex items-center gap-1.5")}>
              <svg className={cn("w-3.5 h-3.5 fill-current")} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
              </svg>
              Twitter
            </a>
            <a href="#" className={cn("hover:text-white transition-colors flex items-center gap-1.5")}>
              <svg className={cn("w-3.5 h-3.5 fill-current")} viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"></path>
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}