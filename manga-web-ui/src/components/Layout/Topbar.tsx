import { useState, useRef, useEffect } from "react";
import { toJpeg } from "html-to-image";
import {
  CloudCheck, Download, User, Settings, LogOut, ChevronDown,
  Palette, ImageDown, Save, CreditCard, HelpCircle, Settings2, Wand2, Sparkles,
  FileText, Globe, Image as ImageIcon, ArrowRight, Lock, Zap
} from "lucide-react";
import { useConfigStore } from "../../store/useConfigStore";
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
import { ModelUpgradeBadges } from "./ModelUpgradeBadges";

function getPageGroupKey(filename: string): string {
  const match = filename.match(/^(.*)_part_\d+\.[^.]+$/i);
  return match ? match[1] : filename.split('.')[0] || filename;
}

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
  const { fileQueue, currentIndex } = projectStore;
  const activeFile = fileQueue[currentIndex];
  const activeGroupKey = activeFile ? getPageGroupKey(activeFile.name) : "";
  const activeGroupPages = fileQueue
    .map((file, idx) => ({ file, idx }))
    .filter(({ file }) => getPageGroupKey(file.name) === activeGroupKey)
    .sort((a, b) => {
      const matchA = a.file.name.match(/_part_(\d+)/i);
      const matchB = b.file.name.match(/_part_(\d+)/i);
      if (matchA && matchB) {
        return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
      }
      return a.file.name.localeCompare(b.file.name);
    });
  const isSlicedWebtoon = activeGroupPages.length > 1;

  const storeProjectName = (projectStore as any).projectName || "";
  const [localProjectName, setLocalProjectName] = useState(storeProjectName);

  useEffect(() => {
    setLocalProjectName(storeProjectName);
  }, [storeProjectName]);

  const { useGpu, setUseGpu } = useConfigStore();
  const [showGpuConfirm, setShowGpuConfirm] = useState(false);

  const handleToggleGpu = () => {
    const newValue = !useGpu;
    setUseGpu(newValue);
    setTimeout(() => {
      useConfigStore.getState().saveToLocal();
    }, 50);
    if (newValue) {
      toast.success("Đã kích hoạt GPU Premium ⚡");
    } else {
      toast.success("Đã khóa chốt an toàn GPU 🔒");
    }
  };

  const confirmGpuOn = () => {
    setUseGpu(true);
    setTimeout(() => {
      useConfigStore.getState().saveToLocal();
    }, 50);
    toast.success("Đã bật GPU Premium 🚀");
    setShowGpuConfirm(false);
  };

  const cancelGpuOn = () => {
    setShowGpuConfirm(false);
  };

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
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/pages/${pageId}/export-manga?token=${token}`);
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
      // Helper to load image
      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => res(img);
          img.onerror = () => rej(new Error('Không tải được ảnh.'));
          img.src = src;
        });

      if (isSlicedWebtoon) {
        // Resolve URLs for all active group slices
        const pageUrls = activeGroupPages.map(({ file, idx }) => {
          const pageId = projectStore.pageIds[idx];
          const fileExt = file.name.split('.').pop() || 'jpg';
          const serverRawUrl = pageId
            ? `${import.meta.env.VITE_API_URL || ''}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`
            : null;
          return projectStore.processedUrls?.[idx] || serverRawUrl;
        });

        if (pageUrls.some(u => !u)) throw new Error("Có trang chưa tải xong, vui lòng thử lại.");

        // Load all slice images asynchronously
        const imgs = await Promise.all(pageUrls.map(url => loadImg(url!)));
        
        // Calculate stitched dimensions
        const w = Math.max(...imgs.map(img => img.naturalWidth));
        const totalH = imgs.reduce((sum, img) => sum + img.naturalHeight, 0);

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = w;
        exportCanvas.height = totalH;
        const ctx = exportCanvas.getContext('2d')!;

        // Draw each slice at its vertical offset
        let currentY = 0;
        imgs.forEach((img, sliceIdx) => {
          const sliceH = img.naturalHeight;
          ctx.drawImage(img, 0, currentY, w, sliceH);

          // If this slice is the active page, also overlay the fabric canvas (translated text layer)
          if (activeGroupPages[sliceIdx].idx === projectStore.currentIndex) {
            const fabricCanvasEl = document.querySelector('#workspace-container canvas.lower-canvas') as HTMLCanvasElement
              || document.querySelector('#workspace-container canvas') as HTMLCanvasElement;
            if (fabricCanvasEl) {
              ctx.drawImage(fabricCanvasEl, 0, currentY, w, sliceH);
            }
          }
          currentY += sliceH;
        });

        // Export stitched JPEG
        exportCanvas.toBlob((blob) => {
          if (!blob) throw new Error('Không tạo được file ảnh.');
          saveAs(blob, `deepkoma-${Date.now()}.jpg`);
          toast.success('Xuất ảnh thành công!', { id: loadId });
          setIsExporting(false);
        }, 'image/jpeg', 0.95);

      } else {
        // Standard single page export
        const idx = projectStore.currentIndex;
        const pageId = projectStore.pageIds[idx];
        const fileExt = projectStore.fileQueue[idx]?.name?.split('.').pop() || 'jpg';
        const serverRawUrl = pageId
          ? `${import.meta.env.VITE_API_URL || ''}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`
          : null;
        const displayUrl = projectStore.processedUrls?.[idx] || serverRawUrl;
        if (!displayUrl) throw new Error("Ảnh hiện tại chưa tải xong, vui lòng thử lại.");

        const baseImg = await loadImg(displayUrl);
        const w = baseImg.naturalWidth;
        const h = baseImg.naturalHeight;

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = w;
        exportCanvas.height = h;
        const ctx = exportCanvas.getContext('2d')!;

        ctx.drawImage(baseImg, 0, 0, w, h);

        const fabricCanvasEl = document.querySelector('#workspace-container canvas.lower-canvas') as HTMLCanvasElement
          || document.querySelector('#workspace-container canvas') as HTMLCanvasElement;
        if (fabricCanvasEl) {
          ctx.drawImage(fabricCanvasEl, 0, 0, w, h);
        }

        exportCanvas.toBlob((blob) => {
          if (!blob) throw new Error('Không tạo được file ảnh.');
          saveAs(blob, `deepkoma-${Date.now()}.jpg`);
          toast.success('Xuất ảnh thành công!', { id: loadId });
          setIsExporting(false);
        }, 'image/jpeg', 0.95);
      }
      return;
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi xuất ảnh!', { id: loadId });
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
      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => res(img);
          img.onerror = () => rej(new Error('Không tải được ảnh.'));
          img.src = src;
        });

      if (isSlicedWebtoon) {
        // Resolve URLs for all active group slices
        const pageUrls = activeGroupPages.map(({ file, idx }) => {
          const pageId = projectStore.pageIds[idx];
          const fileExt = file.name.split('.').pop() || 'jpg';
          const serverRawUrl = pageId
            ? `${import.meta.env.VITE_API_URL || ''}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`
            : null;
          return projectStore.processedUrls?.[idx] || serverRawUrl;
        });

        if (pageUrls.some(u => !u)) throw new Error("Có trang chưa tải xong, vui lòng thử lại.");

        // Load all slice images asynchronously
        const imgs = await Promise.all(pageUrls.map(url => loadImg(url!)));
        
        // Calculate stitched dimensions
        const w = Math.max(...imgs.map(img => img.naturalWidth));
        const totalH = imgs.reduce((sum, img) => sum + img.naturalHeight, 0);

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = w;
        exportCanvas.height = totalH;
        const ctx = exportCanvas.getContext('2d')!;

        // Draw each slice at its vertical offset
        let currentY = 0;
        imgs.forEach((img) => {
          const sliceH = img.naturalHeight;
          ctx.drawImage(img, 0, currentY, w, sliceH);
          currentY += sliceH;
        });

        // Export clean stitched JPEG
        exportCanvas.toBlob((blob) => {
          if (!blob) throw new Error('Không tạo được file ảnh.');
          saveAs(blob, `deepkoma-clean-${Date.now()}.jpg`);
          toast.success('Xuất ảnh sạch thành công!', { id: loadId });
          setIsExporting(false);
        }, 'image/jpeg', 0.95);

      } else {
        // Standard single page clean export
        const pageId = projectStore.pageIds[idx];
        const fileExt = projectStore.fileQueue[idx]?.name?.split('.').pop() || 'jpg';
        const serverRawUrl = pageId
          ? `${import.meta.env.VITE_API_URL || ''}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`
          : null;
        const displayUrl = projectStore.processedUrls?.[idx] || serverRawUrl;
        if (!displayUrl) throw new Error("Ảnh hiện tại chưa tải xong, vui lòng thử lại.");

        const baseImg = await loadImg(displayUrl);
        const w = baseImg.naturalWidth;
        const h = baseImg.naturalHeight;

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = w;
        exportCanvas.height = h;
        const ctx = exportCanvas.getContext('2d')!;

        ctx.drawImage(baseImg, 0, 0, w, h);

        exportCanvas.toBlob((blob) => {
          if (!blob) throw new Error('Không tạo được file ảnh.');
          saveAs(blob, `deepkoma-clean-${Date.now()}.jpg`);
          toast.success('Xuất ảnh sạch thành công!', { id: loadId });
          setIsExporting(false);
        }, 'image/jpeg', 0.95);
      }
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
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/pages/${pageId}/download-psd?token=${token}`);
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
    <header className="h-14 border-b border-border bg-panel px-3 md:px-4 flex items-center justify-between select-none shrink-0 relative" style={{ zIndex: 99 }}>

      {/* 1. LEFT ZONE: LOGO & PROJECT */}
      <div className="flex items-center gap-3 flex-1">
        <DeepKomaLogo onClick={handleLogoClick} className="cursor-pointer transition-opacity hover:opacity-80" iconSize={32} showSubtitle={false} />

      </div>

      {/* 2. CENTER ZONE: VIEW MODE & MODEL UPGRADES */}
      <div className="hidden md:flex items-center justify-center flex-1 gap-3">
        {/* Badges nâng cấp chất lượng dịch & Redraw SOTA */}
        <ModelUpgradeBadges />

        {/* Đường phân cách */}
        <div className="w-px h-4 bg-white/10 shrink-0" />

        {/* Toggle Raw/Clean View Mode */}
        <div className="flex items-center bg-[#18181b] border border-white/[0.04] p-1 rounded-lg">
          <button onClick={() => setIsComparing(false)} className={`px-5 py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${!isComparing ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}>{t('topbar.viewModeAi')}</button>
          <button onClick={() => setIsComparing(true)} className={`px-5 py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${isComparing ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}>{t('topbar.viewModeRaw')}</button>
        </div>
      </div>

      {/* 3. RIGHT ZONE: CONFIG, CREDITS, EXPORT, ACCOUNT */}
      <div className="flex items-center justify-end gap-2.5 flex-1 relative">

        {/* Bảng Điều Khiển Động Cơ & Số Dư GPU Tích Hợp (Premium Console) */}
        <div className={`flex items-center gap-2.5 pl-3 pr-1.5 py-1 rounded-full border transition-all duration-300 select-none shrink-0 relative group/gpuconsole z-30
          ${useGpu 
            ? 'bg-purple-950/20 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.25)]' 
            : 'bg-panel/40 border-border/80 hover:border-border-hover'
          }`}
        >
          {/* 1. Phần Switch bật/tắt (Chốt an toàn) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleGpu}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-all duration-300 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                useGpu 
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 shadow-[0_0_8px_rgba(168,85,247,0.5)]' 
                  : 'bg-neutral-800'
              }`}
              title={useGpu ? "Tắt GPU để khóa chức năng dịch (Tránh bấm nhầm trừ số dư)" : "Bật GPU Premium để kích hoạt chức năng dịch truyện"}
            >
              <span
                className={`pointer-events-none flex items-center justify-center h-4 w-4 transform rounded-full bg-white shadow transition-all duration-300 ease-in-out mt-0.5 ${
                  useGpu ? 'translate-x-4.5 text-purple-600 shadow-[0_0_5px_rgba(168,85,247,0.5)]' : 'translate-x-0.5 text-neutral-500'
                }`}
              >
                {useGpu ? (
                  <Zap size={9} fill="currentColor" className="animate-pulse text-purple-600" />
                ) : (
                  <Lock size={8} className="text-neutral-500" />
                )}
              </span>
            </button>
          </div>

          {/* Đường phân cách mảnh trong capsule */}
          <div className="w-px h-4 bg-border/60 shrink-0" />

          {/* 2. Phần hiển thị thời gian còn lại (Click để mở Paywall nạp tiền) */}
          <button 
            onClick={() => setIsPaywallOpen(true)} 
            className={`flex items-center gap-2 pl-1 pr-2.5 py-0.5 rounded-full transition-all group/balance cursor-pointer text-[11px] font-extrabold whitespace-nowrap shrink-0 relative
              ${user?.isPro 
                ? 'text-indigo-400' 
                : useGpu 
                  ? 'text-purple-300 hover:text-purple-200' 
                  : 'text-text-muted hover:text-text-main'
              }`}
          >
            <div className="relative flex items-center justify-center">
              <GpuIcon size={13} className={
                user?.isPro 
                  ? "text-indigo-400 animate-pulse" 
                  : serverStatus === 'HOT' 
                    ? "text-emerald-400 group-hover/balance:scale-110 transition-transform" 
                    : serverStatus === 'STARTING' 
                      ? "text-amber-400 animate-pulse" 
                      : "text-neutral-500 group-hover/balance:scale-110 transition-transform"
              } />
              
              {/* Đốm màu nhỏ chỉ thị trạng thái máy chủ */}
              <span className="absolute -top-1 -right-1 flex h-1.5 w-1.5">
                {serverStatus === 'HOT' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                  </>
                ) : serverStatus === 'STARTING' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neutral-500"></span>
                )}
              </span>
            </div>
            
            <span>
              {user?.isPro ? t('topbar.proPlan') : `${Math.round(user?.credits || 0).toLocaleString()} ${t('topbar.credits')}`}
            </span>
            {!user?.isPro && (
              <span className={`text-[8.5px] font-black uppercase ml-0.5 px-1 py-0.5 rounded transition-all hidden sm:inline
                ${useGpu 
                  ? 'bg-purple-500/20 text-purple-300 group-hover/balance:bg-purple-500/30' 
                  : 'bg-white/[0.06] text-text-muted group-hover/balance:bg-white/10 group-hover/balance:text-text-main'
                }`}
              >
                {t('topbar.recharge')}
              </span>
            )}
          </button>

          {/* Unified Hover Dashboard Popover */}
          <div className="absolute right-0 top-full mt-2.5 w-64 p-3 bg-[#141417]/95 border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md opacity-0 pointer-events-none group-hover/gpuconsole:opacity-100 transition-all duration-200 z-[220] flex flex-col gap-2 text-left normal-case tracking-normal">
            <div className="flex flex-col gap-1 border-b border-white/5 pb-1.5">
              <span className={`text-[10px] font-black uppercase tracking-wider ${useGpu ? 'text-purple-400' : 'text-neutral-400'}`}>
                {useGpu ? '⚡ Động cơ: ĐANG CHẠY' : '🔒 Động cơ: ĐANG KHÓA'}
              </span>
              <span className="text-[9.5px] text-white/50 leading-normal">
                {useGpu 
                  ? 'Tất cả lượt dịch sẽ sử dụng GPU Premium và trừ vào giây tích lũy trong tài khoản.' 
                  : 'Đã khóa chức năng dịch để bảo vệ số dư của bạn khỏi bấm nhầm.'
                }
              </span>
            </div>

            <div className="text-[10.5px] font-bold text-slate-200 flex items-center gap-1.5">
              {serverStatus === 'HOT' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Máy chủ GPU: SẴN SÀNG</span>
                </>
              ) : serverStatus === 'STARTING' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>Máy chủ GPU: ĐANG KHỞI ĐỘNG</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-neutral-500"></span>
                  <span>Máy chủ GPU: ĐANG NGHỈ</span>
                </>
              )}
            </div>
            
            <div className="text-[9.5px] text-slate-400 leading-relaxed">
              {serverStatus === 'HOT' && 'Hệ thống đang chạy ổn định. Dịch tức thì và miễn phí thời gian giữ máy.'}
              {serverStatus === 'STARTING' && 'GPU đang khởi động nguội (~30 giây). Vui lòng chờ vài giây để bắt đầu.'}
              {serverStatus === 'SLEEPING' && 'GPU đang ngủ để tiết kiệm tài nguyên. Lượt dịch tiếp theo sẽ tự động đánh thức GPU (~30 giây).'}
            </div>

            <div className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1.5 rounded-lg border border-amber-500/20 leading-snug">
              💡 Mẹo: Click vào mục hiển thị thời gian để nạp thêm giây dịch GPU Premium.
            </div>
          </div>
        </div>

        {/* ĐƯỜNG PHÂN CÁCH DỌC */}
        <div className="w-px h-5 bg-border mx-1 shrink-0" />

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
                  <div className="flex items-center gap-2 text-[12px] font-bold text-text-main"><GpuIcon size={14} className="text-amber-500" /><span>{user?.isPro ? t('topbar.proPlan') : `${Math.round(user?.credits || 0).toLocaleString()} ${t('topbar.credits')}`}</span></div>
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

      {/* 🚀 Hộp thoại xác nhận kích hoạt GPU Premium */}
      {showGpuConfirm && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 animate-in fade-in duration-200" style={{ zIndex: 99999 }}>
          <div className="bg-[#141416] w-full max-w-sm rounded-3xl border border-white/[0.08] shadow-2xl p-6 flex flex-col text-left text-text-main animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <div className="flex items-center justify-center w-9 h-9 bg-amber-500/10 border border-amber-500/30 rounded-xl shadow-inner text-amber-400">
                <GpuIcon size={18} className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-text-main">
                  Kích hoạt GPU Premium?
                </h3>
                <p className="text-[9px] text-text-muted mt-0.5">
                  Xác nhận thay đổi cấu hình xử lý dịch thuật
                </p>
              </div>
            </div>

            <div className="text-[11px] text-slate-300 leading-relaxed py-4 border-b border-white/5 flex flex-col gap-2.5">
              <p>
                Bạn đang yêu cầu kích hoạt chế độ <strong className="text-amber-400 font-extrabold">GPU Premium ⚡</strong>.
              </p>
              <ul className="list-disc pl-4 flex flex-col gap-1.5 text-slate-400">
                <li>
                  <strong className="text-slate-200">Ưu điểm:</strong> Tốc độ dịch siêu tốc (&lt;1 giây/trang) và dịch tự động toàn bộ chương.
                </li>
                <li>
                  <strong className="text-slate-200">Lưu ý:</strong> Chế độ này sẽ tiêu thụ số dư <strong className="text-slate-200">Credit</strong> trong tài khoản của bạn.
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4">
              <button
                onClick={cancelGpuOn}
                className="px-4 py-2 rounded-xl text-[10px] font-bold text-text-muted hover:text-text-main hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={confirmGpuOn}
                className="flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-black uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-amber-500/20"
              >
                Đồng ý kích hoạt
              </button>
            </div>
          </div>
        </div>
      )}

    </header>
  );
}