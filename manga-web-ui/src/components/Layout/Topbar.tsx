import { useState, useRef, useEffect } from "react";
import { toJpeg } from "html-to-image";
import {
  CloudCheck, Download, Diamond, User, Settings, LogOut, ChevronDown,
  Palette, ImageDown, Save, CreditCard, HelpCircle, Settings2, Wand2
} from "lucide-react";
import toast from 'react-hot-toast';
import { useConfigStore } from "../../store/useConfigStore";
import TranslationConfigModal from "../Modals/TranslationConfigModal";
import { saveAs } from 'file-saver';

// Import Stores & API
import { useToolStore } from "../../store/useToolStore";
import { useProjectStore } from "../../store/useProjectStore";
import { useAuthStore } from "../../store/useAuthStore";
import { mangaApi } from "../../services/api";
import { PaywallDrawer } from "../Modals/PaywallDrawer";

export default function Topbar() {
  const { isComparing, setIsComparing } = useToolStore();
  const { user, signOut } = useAuthStore();
  const projectStore = useProjectStore();

  const { isModalOpen, setModalOpen } = useConfigStore();

  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) setIsExportMenuOpen(false);
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) setIsAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExportManga = () => {
    const pageId = projectStore.pageIds[projectStore.currentIndex];
    if (!pageId) return toast.error("Chưa có trang truyện nào được chọn!");
    window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/pages/${pageId}/export-manga`, '_blank');
    setIsExportMenuOpen(false);
  };

  const handleExportImage = async () => {
    const el = document.getElementById("manga-canvas-render");
    if (!el) return toast.error("Không tìm thấy vùng vẽ để xuất ảnh!");
    const loadId = toast.loading("Đang xuất ảnh JPG...");
    try {
      const dataUrl = await toJpeg(el, { quality: 0.95 });
      saveAs(dataUrl, `deepkoma-${Date.now()}.jpg`);
      toast.success("Xuất ảnh thành công!", { id: loadId });
    } catch (e) { toast.error("Lỗi khi xuất ảnh!", { id: loadId }); }
    setIsExportMenuOpen(false);
  };

  const handleExportPSD = async () => {
    const pageId = projectStore.pageIds[projectStore.currentIndex];
    if (!pageId) return toast.error("Chưa có trang truyện nào được chọn!");
    const loadId = toast.loading("Đang tạo liên kết tải file PSD...");
    try {
      mangaApi.downloadPsd(pageId);
      toast.dismiss(loadId);
      toast.success((t) => (
        <div className="flex flex-col gap-2">
          <span className="font-bold">Đã bắt đầu tải file PSD!</span>
          <div className="text-[11px] opacity-90">Nếu file PSD bị lỗi font tiếng Việt, hãy tải và cài đặt bộ Font chuẩn:</div>
          <button onClick={() => { toast.dismiss(t.id); mangaApi.downloadFontPack(); }} className="px-3 py-1.5 text-[11px] font-bold bg-primary text-white rounded-lg flex items-center justify-center gap-1.5">
            <Download size={14} /> Tải Bộ Font
          </button>
        </div>
      ), { duration: 15000 });
    } catch (error: any) { toast.error(error.message, { id: loadId }); }
    setIsExportMenuOpen(false);
  };

  return (
    <header className="h-14 border-b border-border bg-panel px-4 flex items-center justify-between select-none shrink-0 relative" style={{ zIndex: 99 }}>

      {/* 1. LEFT ZONE: LOGO & PROJECT (Đã nới rộng flex-1 để tên dài không bị che) */}
      <div className="flex items-center gap-4 flex-1">
        <div className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-hover rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
            <Wand2 size={18} className="text-white" />
          </div>
          <span className="text-sm font-black tracking-widest text-text-main hidden md:block uppercase">DeepKoma</span>
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <div className="flex flex-col justify-center min-w-0 max-w-[300px]">
          {/* Đã bỏ chữ "Dự án:", tên ngắn gọn, khung dài hơn */}
          <input
            type="text"
            defaultValue="Tiêu diệt Goblin - Chap 1"
            className="bg-transparent font-bold text-[13px] text-text-main focus:outline-none focus:border-b border-primary w-full truncate transition-all"
          />
          <div className="flex items-center text-[10px] text-text-muted font-medium mt-0.5">
            <CloudCheck size={12} className="mr-1 text-emerald-500/80" />
            <span>Đã đồng bộ tự động</span> {/* 🚀 Sửa lại text cho chuẩn thực tế */}
          </div>
        </div>
      </div>

      {/* 2. CENTER ZONE: CHỈ CÒN ĐÚNG VIEW MODE (Tập trung tối đa) */}
      <div className="flex items-center justify-center flex-1">
        <div className="flex items-center bg-background p-1 rounded-lg border border-border shadow-inner">
          <button onClick={() => setIsComparing(false)} className={`px-5 py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${!isComparing ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}>Bản dịch AI</button>
          <button onClick={() => setIsComparing(true)} className={`px-5 py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${isComparing ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}>Ảnh gốc (Raw)</button>
        </div>
      </div>

      {/* 3. RIGHT ZONE: CONFIG, CREDITS, EXPORT, ACCOUNT */}
      <div className="flex items-center justify-end gap-3 flex-1 relative">

        {/* Nút Cài đặt dự án chung */}
        <button
          onClick={() => setModalOpen(true)} // 🚀 Gắn sự kiện click mở Modal vào đây
          className="flex items-center justify-center w-8 h-8 rounded-full bg-background border border-border hover:bg-border/50 text-text-muted hover:text-text-main transition-colors cursor-pointer"
          title="Cài đặt từ điển & Xưng hô AI"
        >
          <Settings2 size={16} />
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Nút Credits */}
        <button onClick={() => setIsPaywallOpen(true)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors group cursor-pointer shadow-sm ${user?.isPro ? 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' : 'bg-background hover:bg-border/40 border-border'}`}>
          <Diamond size={14} className={user?.isPro ? "text-indigo-400 animate-pulse" : "text-amber-500 group-hover:scale-110 transition-transform"} />
          <span className={`text-[12px] font-bold ${user?.isPro ? 'text-indigo-400' : 'text-text-main'}`}>{user?.isPro ? "GÓI PRO" : (user?.credits || 0).toLocaleString()}</span>
          {!user?.isPro && <span className="text-[9px] font-black uppercase text-amber-500/80 ml-1 hidden sm:inline">Nạp</span>}
        </button>

        {/* Menu Export */}
        <div className="relative" ref={exportMenuRef}>
          <button onClick={() => { setIsExportMenuOpen(!isExportMenuOpen); setIsAccountMenuOpen(false); }} className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover px-4 py-1.5 rounded-lg text-[12px] font-bold text-white shadow-md transition-colors active:scale-95 cursor-pointer">
            <Download size={14} strokeWidth={2.5} /> <span className="hidden sm:inline">Export</span> <ChevronDown size={14} />
          </button>

          {isExportMenuOpen && (
            <div className="absolute top-[calc(100%+8px)] right-0 w-52 bg-panel border border-border rounded-xl shadow-2xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2" style={{ zIndex: 99999 }}>
              <button onClick={handleExportImage} className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-semibold text-text-main hover:bg-background transition-colors cursor-pointer"><ImageDown size={14} className="text-emerald-500" /> Xuất ảnh JPG</button>
              <button onClick={handleExportPSD} className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-semibold text-text-main hover:bg-background transition-colors border-y border-border/50 cursor-pointer"><Palette size={14} className="text-indigo-500" /> Xuất file PSD</button>
              <button onClick={handleExportManga} className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-semibold text-text-muted hover:text-text-main hover:bg-background transition-colors cursor-pointer"><Save size={14} /> Lưu Backup (.manga)</button>
            </div>
          )}
        </div>

        {/* Menu Account */}
        <div className="relative" ref={accountMenuRef}>
          <button onClick={() => { setIsAccountMenuOpen(!isAccountMenuOpen); setIsExportMenuOpen(false); }} className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 focus:ring-2 focus:ring-amber-500/50 transition-transform active:scale-95 cursor-pointer shadow-sm">
            <User size={16} className="text-amber-950" strokeWidth={2.5} />
          </button>

          {isAccountMenuOpen && (
            <div className="absolute top-[calc(100%+12px)] right-0 w-64 bg-panel border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 origin-top-right" style={{ zIndex: 99999 }}>
              <div className="px-4 py-3 border-b border-border bg-background/50">
                <p className="text-[13px] font-bold text-text-main truncate">Xin chào, Dịch giả!</p>
                <p className="text-[11px] text-text-muted truncate mt-0.5">{user?.email || "Chưa đăng nhập"}</p>
              </div>
              <div className="px-2 py-2 border-b border-border">
                <div className="flex items-center justify-between px-3 py-2.5 mb-1 bg-background rounded-lg border border-border/50">
                  <div className="flex items-center gap-2 text-[12px] font-bold text-text-main"><Diamond size={14} className="text-amber-500" /><span>{user?.isPro ? "GÓI PRO" : `${(user?.credits || 0).toLocaleString()} Credits`}</span></div>
                  <button onClick={() => { setIsAccountMenuOpen(false); setIsPaywallOpen(true); }} className="text-[10px] font-black uppercase text-primary hover:text-primary-hover transition-colors cursor-pointer">Nạp thêm</button>
                </div>
                <button className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-text-muted hover:bg-background hover:text-text-main rounded-md transition-colors cursor-pointer"><CreditCard size={14} /> Lịch sử giao dịch</button>
              </div>
              <div className="px-2 py-2 bg-background/30">
                <button onClick={signOut} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-bold text-danger/80 hover:bg-danger/10 hover:text-danger rounded-md transition-colors cursor-pointer"><LogOut size={14} strokeWidth={2.5} /> Đăng xuất</button>
              </div>
            </div>
          )}
        </div>

      </div>

      <PaywallDrawer isOpen={isPaywallOpen} onClose={() => setIsPaywallOpen(false)} />

      {/* 🚀 Bảng cấu hình dịch thuật sẽ hiện lên khi isModalOpen = true */}
      {isModalOpen && <TranslationConfigModal />}

    </header>
  );
}