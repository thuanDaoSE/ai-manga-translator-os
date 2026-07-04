import { useState, useRef, useEffect } from "react";
import { toJpeg } from "html-to-image";
import {
  CloudCheck, Download, User, Settings, LogOut, ChevronDown,
  Palette, ImageDown, Save, CreditCard, HelpCircle, Settings2, Wand2, Languages,
  FileText, Globe, Image as ImageIcon
} from "lucide-react";
import toast from 'react-hot-toast';
import { useConfigStore } from "../../store/useConfigStore";
import TranslationConfigModal from "../Modals/TranslationConfigModal";
import PaymentHistoryModal from "../Modals/PaymentHistoryModal";
import { saveAs } from 'file-saver';
import { useTranslation } from "react-i18next";
import { useServerStatusStore } from "../../store/useServerStatusStore";

// Import Stores & API
import { useToolStore } from "../../store/useToolStore";
import { useProjectStore } from "../../store/useProjectStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useCanvasStore } from "../../store/useCanvasStore";
import { exportTranslationToText } from "../Editor/ExportTextButton";
import { mangaApi } from "../../services/api";
import { PaywallDrawer } from "../Modals/PaywallDrawer";
import SupportModal from "../Modals/SupportModal";
import DeepKomaLogo from "../ui/DeepKomaLogo";

const GpuIcon = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    fill="currentColor" 
    className={className} 
    viewBox="0 0 16 16"
  >
    <path d="M4 8a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0m7.5-1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"/>
    <path d="M0 1.5A.5.5 0 0 1 .5 1h1a.5.5 0 0 1 .5.5V4h13.5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H2v2.5a.5.5 0 0 1-1 0V2H.5a.5.5 0 0 1-.5-.5m5.5 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M9 8a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0"/>
    <path d="M3 12.5h3.5v1a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5zm4 1v-1h4v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5"/>
  </svg>
);

export default function Topbar() {
  const { t, i18n } = useTranslation();
  const { isComparing, setIsComparing, showLeftPanel, toggleLeftPanel } = useToolStore();
  const { user, signOut } = useAuthStore();
  const projectStore = useProjectStore();

  const storeProjectName = (projectStore as any).projectName || "";
  const [localProjectName, setLocalProjectName] = useState(storeProjectName);

  useEffect(() => {
    setLocalProjectName(storeProjectName);
  }, [storeProjectName]);

  const { isModalOpen, setModalOpen } = useConfigStore();

  const { serverStatus, fetchStatus } = useServerStatusStore();
 
  useEffect(() => {
    if (!user) return;
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Check status every 10s
 
    return () => {
      clearInterval(interval);
    };
  }, [user?.id, fetchStatus]);

  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleLogoClick = () => {
    if (window.confirm(t('topbar.confirmCloseProject', 'Bạn có muốn đóng dự án hiện tại và quay về màn hình chính không?'))) {
      projectStore.clearProject();
    }
  };

  const handleExportManga = async () => {
    const pageId = projectStore.pageIds[projectStore.currentIndex];
    if (!pageId) return toast.error("Chưa có trang truyện nào được chọn!");
    setIsExporting(true);
    setIsExportMenuOpen(false);
    const loadId = toast.loading("Đang đóng gói file backup .manga...");
    try {
      const token = useAuthStore.getState().session?.access_token || "";
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/pages/${pageId}/export-manga?token=${token}`);
      if (!response.ok) throw new Error("Lỗi máy chủ khi đóng gói backup");
      const blob = await response.blob();
      saveAs(blob, `backup-${pageId}.manga`);
      toast.success("Xuất file backup thành công!", { id: loadId });
    } catch (error: any) {
      toast.error(error.message || "Lỗi khi xuất file backup!", { id: loadId });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportText = async () => {
    const activePageNumber = projectStore.currentIndex + 1;
    const currentBubbles = useCanvasStore.getState().bubbles;
    
    if (!currentBubbles || currentBubbles.length === 0) {
      setIsExportMenuOpen(false);
      return toast.error("Trang hiện tại không có văn bản nào để xuất!");
    }
    setIsExporting(true);
    setIsExportMenuOpen(false);
    const loadId = toast.loading("Đang xuất file văn bản...");
    const textBlocks = currentBubbles.map(b => ({
      original: b.japanese || b.text,
      translated: b.text || b.vietnamese || ""
    }));
    const pagesData = [{ pageNumber: activePageNumber, textBlocks }];
    
    try {
      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          try {
            exportTranslationToText(pagesData);
            resolve();
          } catch (e) {
            reject(e);
          }
        }, 100);
      });
      toast.success("Xuất file Text thành công!", { id: loadId });
    } catch (e) {
      toast.error("Lỗi khi xuất file Text!", { id: loadId });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportImage = async () => {
    setIsExporting(true);
    setIsExportMenuOpen(false);
    const loadId = toast.loading("Đang xuất ảnh JPG...");
    try {
      // Lấy ảnh display (clean/processed)
      const projectStore = useProjectStore.getState();
      const idx = projectStore.currentIndex;
      const pageId = projectStore.pageIds[idx];
      const fileExt = projectStore.fileQueue[idx]?.name?.split('.').pop() || 'jpg';
      const serverRawUrl = pageId
        ? `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`
        : null;
      const displayUrl = projectStore.processedUrls?.[idx] || serverRawUrl;
      if (!displayUrl) throw new Error("Ảnh hiện tại chưa tải xong, vui lòng thử lại.");

      // Tải ảnh chính vào Image
      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => res(img);
          img.onerror = () => rej(new Error('Không tải được ảnh.'));
          img.src = src;
        });

      const baseImg = await loadImg(displayUrl);
      const w = baseImg.naturalWidth;
      const h = baseImg.naturalHeight;

      // Tạo canvas tổng hợp
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = w;
      exportCanvas.height = h;
      const ctx = exportCanvas.getContext('2d')!;

      // Layer 1: vẽ ảnh nền
      ctx.drawImage(baseImg, 0, 0, w, h);

      // Layer 2: vẽ Fabric canvas (text layer) nếu có
      const fabricCanvasEl = document.querySelector('#workspace-container canvas.lower-canvas') as HTMLCanvasElement
        || document.querySelector('#workspace-container canvas') as HTMLCanvasElement;
      if (fabricCanvasEl) {
        ctx.drawImage(fabricCanvasEl, 0, 0, w, h);
      }

      // Xuất JPEG
      exportCanvas.toBlob((blob) => {
        if (!blob) throw new Error('Không tạo được file ảnh.');
        saveAs(blob, `deepkoma-${Date.now()}.jpg`);
        toast.success('Xuất ảnh thành công!', { id: loadId });
        setIsExporting(false);
      }, 'image/jpeg', 0.95);
      return; // early return, setIsExporting handled inside toBlob
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi xuất ảnh!', { id: loadId });
    } finally {
      // chỉ set false nếu chưa được set bởi toBlob
    }
    setIsExporting(false);
  };

  const handleExportCleanImage = async () => {
    const idx = projectStore.currentIndex;
    if (idx === -1) return toast.error("Chưa có trang truyện nào được chọn!");
    setIsExporting(true);
    setIsExportMenuOpen(false);
    const loadId = toast.loading("Đang xuất ảnh Clean...");

    try {
      const pageId = projectStore.pageIds[idx];
      const fileExt = projectStore.fileQueue[idx]?.name?.split('.').pop() || 'jpg';
      const serverRawUrl = pageId
        ? `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`
        : null;
      const displayUrl = projectStore.processedUrls?.[idx] || serverRawUrl;
      if (!displayUrl) throw new Error("Ảnh hiện tại chưa tải xong, vui lòng thử lại.");

      // Tải ảnh chính vào Image
      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => res(img);
          img.onerror = () => rej(new Error('Không tải được ảnh.'));
          img.src = src;
        });

      const baseImg = await loadImg(displayUrl);
      const w = baseImg.naturalWidth;
      const h = baseImg.naturalHeight;

      // Tạo canvas tổng hợp
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = w;
      exportCanvas.height = h;
      const ctx = exportCanvas.getContext('2d')!;

      // Chỉ vẽ ảnh nền (đây là ảnh đã inpaint/sạch chữ)
      ctx.drawImage(baseImg, 0, 0, w, h);

      // Xuất JPEG
      exportCanvas.toBlob((blob) => {
        if (!blob) throw new Error('Không tạo được file ảnh.');
        saveAs(blob, `deepkoma-clean-${Date.now()}.jpg`);
        toast.success('Xuất ảnh sạch thành công!', { id: loadId });
        setIsExporting(false);
      }, 'image/jpeg', 0.95);
      return;
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi xuất ảnh!', { id: loadId });
    }
    setIsExporting(false);
  };

  const handleExportPSD = async () => {
    const pageId = projectStore.pageIds[projectStore.currentIndex];
    if (!pageId) return toast.error("Chưa có trang truyện nào được chọn!");
    setIsExporting(true);
    setIsExportMenuOpen(false);
    const loadId = toast.loading("Đang tạo file PSD...");
    try {
      const token = useAuthStore.getState().session?.access_token || "";
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/pages/${pageId}/download-psd?token=${token}`);
      if (!response.ok) throw new Error("Lỗi máy chủ khi tạo file PSD");
      const blob = await response.blob();
      saveAs(blob, `MangaAI_${pageId}.psd`);
      
      toast.dismiss(loadId);
      toast.success((t) => (
        <div className="flex flex-col gap-2">
          <span className="font-bold">Đã tạo file PSD thành công!</span>
          <div className="text-[11px] opacity-90">Nếu file PSD bị lỗi font tiếng Việt, hãy tải và cài đặt bộ Font chuẩn:</div>
          <button onClick={() => { toast.dismiss(t.id); mangaApi.downloadFontPack(); }} className="px-3 py-1.5 text-[11px] font-bold bg-primary text-white rounded-lg flex items-center justify-center gap-1.5">
            <Download size={14} /> Tải Bộ Font
          </button>
        </div>
      ), { duration: 15000 });
    } catch (error: any) { 
      toast.error(error.message || "Lỗi tạo file PSD!", { id: loadId }); 
    } finally {
      setIsExporting(false);
    }
  };



  return (
    <header className="h-14 border-b border-border bg-panel px-4 flex items-center justify-between select-none shrink-0 relative" style={{ zIndex: 99 }}>

      {/* 1. LEFT ZONE: LOGO & PROJECT */}
      <div className="flex items-center gap-4 flex-1">
        <DeepKomaLogo onClick={handleLogoClick} className="cursor-pointer transition-opacity hover:opacity-80" iconSize={32} showSubtitle={false} />

        {/* <div className="w-px h-8 bg-border mx-2 hidden sm:block" /> */}


        {/* Project name + sync status — ẩn tạm thời (tính năng .manga sẽ phát triển sau) */}
        {/* <div className="flex flex-col justify-center min-w-0 max-w-[300px]">
          <input
            type="text"
            value={localProjectName}
            onChange={(e) => setLocalProjectName(e.target.value)}
            className="bg-transparent font-bold text-[13px] text-text-main focus:outline-none focus:border-b border-[#8A2BE2] w-full truncate transition-all placeholder-text-muted/50"
            placeholder={t('topbar.projectNamePlaceholder')}
          />
          <div className="flex items-center text-[10px] text-text-muted font-medium mt-0.5">
            <CloudCheck size={12} className="mr-1 text-[#06B6D4]" />
            <span>{t('topbar.synced')}</span>
          </div>
        </div> */}

      </div>

      {/* 2. CENTER ZONE: CHỈ CÒN ĐÚNG VIEW MODE (Tập trung tối đa) */}
      <div className="flex items-center justify-center flex-1">
        <div className="flex items-center bg-background p-1 rounded-lg border border-border shadow-inner">
          <button onClick={() => setIsComparing(false)} className={`px-5 py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${!isComparing ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}>{t('topbar.viewModeAi')}</button>
          <button onClick={() => setIsComparing(true)} className={`px-5 py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${isComparing ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}>{t('topbar.viewModeRaw')}</button>
        </div>
      </div>

      {/* 3. RIGHT ZONE: CONFIG, CREDITS, EXPORT, ACCOUNT */}
      <div className="flex items-center justify-end gap-3 flex-1 relative">

        {/* Nút Cài đặt dự án chung (Cấu hình dịch) */}
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-border/40 text-text-muted hover:text-text-main transition-colors cursor-pointer shadow-sm group whitespace-nowrap shrink-0 text-[12px] font-bold"
          title="Cài đặt từ điển & Xưng hô AI"
        >
          <Languages size={14} className="text-primary group-hover:scale-110 transition-transform" />
          <span>{t('topbar.configBtn')}</span>
        </button>

        {/* ĐƯỜNG PHÂN CÁCH DỌC */}
        <div className="w-px h-5 bg-border mx-1 shrink-0" />

        {/* Server Status Badge */}
        <div className="group relative cursor-help shrink-0 z-30">
          {serverStatus === 'HOT' ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 text-[10px] font-black uppercase tracking-wider shadow-[0_0_12px_rgba(16,185,129,0.1)] select-none">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>GPU Ready</span>
            </div>
          ) : serverStatus === 'STARTING' ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 text-amber-400 text-[10px] font-black uppercase tracking-wider shadow-[0_0_12px_rgba(245,158,11,0.1)] select-none">
              <span className="relative flex h-2 w-2">
                <span className="animate-spin absolute inline-flex h-full w-full rounded-full border-t border-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span>Booting GPU</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-700 bg-neutral-800/40 text-neutral-400 text-[10px] font-black uppercase tracking-wider select-none">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-500"></span>
              <span>GPU Sleeping</span>
            </div>
          )}
          
          <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-[#141417]/95 border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-[220] flex flex-col gap-1.5 text-left normal-case tracking-normal">
            <div className="text-[11px] font-black uppercase tracking-widest border-b border-white/5 pb-1 flex items-center gap-1.5 text-slate-200">
              {serverStatus === 'HOT' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span>⚡ GPU Đang Sẵn Sàng</span>
                </>
              ) : serverStatus === 'STARTING' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>⚙️ Đang Bật Máy GPU</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-neutral-500"></span>
                  <span>💤 GPU Đang Tạm Nghỉ</span>
                </>
              )}
            </div>
            <div className="text-[10px] text-slate-400 leading-relaxed">
              {serverStatus === 'HOT' && 'Hệ thống đang hoạt động ổn định. Xử lý tức thì và MIỄN PHÍ thời gian khởi động máy (Không tính Boot Fee).'}
              {serverStatus === 'STARTING' && 'GPU đang khởi động lạnh (~30 giây). Vui lòng chờ máy sẵn sàng để bắt đầu dịch thuật.'}
              {serverStatus === 'SLEEPING' && 'Để tiết kiệm chi phí hệ thống, GPU sẽ tạm ngủ nếu không có yêu cầu. Lượt dịch tiếp theo sẽ mất khoảng 30s khởi động (+30s phí khởi động GPU).'}
            </div>
            <div className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-xl border border-amber-500/20">
              💡 Mẹo: Nhìn đèn tín hiệu trước khi Dịch. Nếu đèn ĐỎ, hãy chờ người khác kích hoạt hoặc tự kích hoạt bằng cách gửi yêu cầu dịch.
            </div>
          </div>
        </div>

        {/* Nút Credits */}
        <button 
          onClick={() => setIsPaywallOpen(true)} 
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors group cursor-pointer shadow-sm whitespace-nowrap shrink-0 text-[12px] font-bold ${
            user?.isPro 
              ? 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' 
              : 'bg-background hover:bg-border/40 border-border'
          }`}
          title={
            serverStatus === 'HOT' 
              ? "GPU: Sẵn sàng (Ready)" 
              : serverStatus === 'STARTING' 
                ? "GPU: Đang ngủ/Đang khởi động (Cold Start)" 
                : "GPU: Ngoại tuyến (Offline)"
          }
        >
          <GpuIcon size={14} className={
            user?.isPro 
              ? "text-indigo-400 animate-pulse" 
              : serverStatus === 'HOT' 
                ? "text-emerald-500 group-hover:scale-110 transition-transform" 
                : serverStatus === 'STARTING' 
                  ? "text-amber-500 animate-pulse" 
                  : "text-neutral-500 group-hover:scale-110 transition-transform"
          } />
          <span className={user?.isPro ? 'text-indigo-400' : 'text-text-main'}>
            {user?.isPro ? t('topbar.proPlan') : `${(user?.credits || 0).toLocaleString()} ${t('topbar.credits')}`}
          </span>
          {!user?.isPro && <span className="text-[9px] font-black uppercase text-amber-500/80 ml-0.5 hidden sm:inline">{t('topbar.recharge')}</span>}
        </button>

        {/* Menu Export */}
        <div className="relative shrink-0" ref={exportMenuRef}>
          <button 
            disabled={isExporting}
            onClick={() => {
              if (isExporting) return;
              setIsExportMenuOpen(!isExportMenuOpen); 
              setIsAccountMenuOpen(false); 
            }} 
            className={`flex items-center gap-1.5 bg-primary hover:bg-primary-hover px-4 py-1.5 rounded-lg text-[12px] font-bold text-white shadow-md transition-colors active:scale-95 shrink-0 ${isExporting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {isExporting ? (
              <>
                <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download size={14} strokeWidth={2.5} /> <span className="hidden sm:inline">Export</span> <ChevronDown size={14} />
              </>
            )}
          </button>

          {isExportMenuOpen && (
            <div className="absolute top-[calc(100%+8px)] right-0 w-52 bg-panel border border-border rounded-xl shadow-2xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2" style={{ zIndex: 99999 }}>
              <button onClick={handleExportImage} className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-semibold text-text-main hover:bg-background transition-colors cursor-pointer"><ImageDown size={14} className="text-emerald-500" /> {t('sidebar.exportJpg')}</button>
              <button onClick={handleExportCleanImage} className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-semibold text-text-main hover:bg-background transition-colors cursor-pointer border-t border-border/50"><ImageIcon size={14} className="text-sky-500" /> {t('sidebar.exportCleanJpg', 'Tải ảnh Clean (Đã xóa chữ)')}</button>
              <button onClick={handleExportPSD} className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-semibold text-text-main hover:bg-background transition-colors border-y border-border/50 cursor-pointer"><Palette size={14} className="text-indigo-500" /> {t('sidebar.exportPsd')}</button>
              <button onClick={handleExportText} className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] font-semibold text-text-main hover:bg-background transition-colors cursor-pointer"><FileText size={14} className="text-amber-500" /> {t('sidebar.exportText')}</button>
            </div>
          )}
        </div>

        {/* Menu Account */}
        <div className="relative shrink-0" ref={accountMenuRef}>
          <button onClick={() => { setIsAccountMenuOpen(!isAccountMenuOpen); setIsExportMenuOpen(false); }} className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 focus:ring-2 focus:ring-amber-500/50 transition-transform active:scale-95 cursor-pointer shadow-sm shrink-0">
            <User size={16} className="text-amber-950" strokeWidth={2.5} />
          </button>

          {isAccountMenuOpen && (
            <div className="absolute top-[calc(100%+12px)] right-0 w-64 bg-panel border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 origin-top-right" style={{ zIndex: 99999 }}>
              <div className="px-4 py-3 border-b border-border bg-background/50">
                <p className="text-[13px] font-bold text-text-main truncate">{t('topbar.welcomeUser')}</p>
                <p className="text-[11px] text-text-muted truncate mt-0.5">{user?.email || "Chưa đăng nhập"}</p>
              </div>
              <div className="px-2 py-2 border-b border-border">
                <div className="flex items-center justify-between px-3 py-2.5 mb-1 bg-background rounded-lg border border-border/50">
                  <div className="flex items-center gap-2 text-[12px] font-bold text-text-main"><GpuIcon size={14} className="text-amber-500" /><span>{user?.isPro ? t('topbar.proPlan') : `${(user?.credits || 0).toLocaleString()} ${t('topbar.credits')}`}</span></div>
                  <button onClick={() => { setIsAccountMenuOpen(false); setIsPaywallOpen(true); }} className="text-[10px] font-black uppercase text-primary hover:text-primary-hover transition-colors cursor-pointer">{t('topbar.rechargeMore')}</button>
                </div>
                <button
                  onClick={() => { setIsAccountMenuOpen(false); setIsHistoryOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-text-muted hover:bg-background hover:text-text-main rounded-md transition-colors cursor-pointer"
                >
                  <CreditCard size={14} /> {t('topbar.transactionHistory')}
                </button>
                <button
                  onClick={() => { setIsSupportOpen(true); setIsAccountMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-text-muted hover:bg-background hover:text-text-main rounded-md transition-colors cursor-pointer mt-0.5"
                >
                  <HelpCircle size={14} /> {t('topbar.supportRequest')}
                </button>
                {/* Lựa chọn Ngôn ngữ (Language Switcher) */}
                <button
                  onClick={() => {
                    const nextLang = i18n.language === 'vi' ? 'en' : 'vi';
                    i18n.changeLanguage(nextLang);
                    localStorage.setItem('lang', nextLang);
                    localStorage.setItem('ui_language', nextLang);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-[12px] font-medium text-text-muted hover:bg-background hover:text-text-main rounded-md transition-colors cursor-pointer mt-0.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Globe size={14} className="text-text-muted" />
                    <span>{i18n.language === 'vi' ? 'Ngôn ngữ: Tiếng Việt' : 'Language: English'}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-black uppercase">
                    {i18n.language === 'vi' ? 'VN' : 'EN'}
                  </span>
                </button>
              </div>
              <div className="px-2 py-2 bg-background/30">
                <button onClick={signOut} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-bold text-danger/80 hover:bg-danger/10 hover:text-danger rounded-md transition-colors cursor-pointer"><LogOut size={14} strokeWidth={2.5} /> {t('topbar.logout')}</button>
              </div>
            </div>
          )}
        </div>

      </div>

      <PaywallDrawer isOpen={isPaywallOpen} onClose={() => setIsPaywallOpen(false)} />
      <PaymentHistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />

      {/* 🚀 Bảng cấu hình dịch thuật sẽ hiện lên khi isModalOpen = true */}
      {isModalOpen && <TranslationConfigModal />}

    </header>
  );
}