import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, Palette, ImageDown, FileText, Image as ImageIcon } from "lucide-react";
import { saveAs } from 'file-saver';
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";

// Import Stores & API
import { useToolStore } from "../../store/useToolStore";
import { useProjectStore } from "../../store/useProjectStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useCanvasStore } from "../../store/useCanvasStore";
import { exportTranslationToText } from "../Editor/ExportTextButton";
import { mangaApi } from "../../services/api";
import DeepKomaLogo from "../ui/DeepKomaLogo";
import { ModelUpgradeBadges } from "./ModelUpgradeBadges";

function getPageGroupKey(filename: string): string {
  const match = filename.match(/^(.*)_part_\d+\.[^.]+$/i);
  return match ? match[1] : filename.split('.')[0] || filename;
}

export default function Topbar() {
  const { t } = useTranslation();
  const { isComparing, setIsComparing } = useToolStore();
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

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogoClick = () => {
    if (window.confirm(t('topbar.confirmCloseProject', 'Bạn có muốn đóng dự án hiện tại và quay về màn hình chính không?'))) {
      projectStore.clearProject();
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
      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => res(img);
          img.onerror = () => rej(new Error('Không tải được ảnh.'));
          img.src = src;
        });

      if (isSlicedWebtoon) {
        const pageUrls = activeGroupPages.map(({ file, idx }) => {
          const pageId = projectStore.pageIds[idx];
          const fileExt = file.name.split('.').pop() || 'jpg';
          const serverRawUrl = pageId
            ? `${import.meta.env.VITE_API_URL || ''}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`
            : null;
          return projectStore.processedUrls?.[idx] || serverRawUrl;
        });

        if (pageUrls.some(u => !u)) throw new Error("Có trang chưa tải xong, vui lòng thử lại.");

        const imgs = await Promise.all(pageUrls.map(url => loadImg(url!)));
        const w = Math.max(...imgs.map(img => img.naturalWidth));
        const totalH = imgs.reduce((sum, img) => sum + img.naturalHeight, 0);

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = w;
        exportCanvas.height = totalH;
        const ctx = exportCanvas.getContext('2d')!;

        let currentY = 0;
        imgs.forEach((img, sliceIdx) => {
          const sliceH = img.naturalHeight;
          ctx.drawImage(img, 0, currentY, w, sliceH);

          if (activeGroupPages[sliceIdx].idx === projectStore.currentIndex) {
            const fabricCanvasEl = document.querySelector('#workspace-container canvas.lower-canvas') as HTMLCanvasElement
              || document.querySelector('#workspace-container canvas') as HTMLCanvasElement;
            if (fabricCanvasEl) {
              ctx.drawImage(fabricCanvasEl, 0, currentY, w, sliceH);
            }
          }
          currentY += sliceH;
        });

        exportCanvas.toBlob((blob) => {
          if (!blob) throw new Error('Không tạo được file ảnh.');
          saveAs(blob, `deepkoma-${Date.now()}.jpg`);
          toast.success('Xuất ảnh thành công!', { id: loadId });
          setIsExporting(false);
        }, 'image/jpeg', 0.95);

      } else {
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
        const pageUrls = activeGroupPages.map(({ file, idx }) => {
          const pageId = projectStore.pageIds[idx];
          const fileExt = file.name.split('.').pop() || 'jpg';
          const serverRawUrl = pageId
            ? `${import.meta.env.VITE_API_URL || ''}/workspace/${projectStore.projectId}/raw/${pageId}.${fileExt}`
            : null;
          return projectStore.processedUrls?.[idx] || serverRawUrl;
        });

        if (pageUrls.some(u => !u)) throw new Error("Có trang chưa tải xong, vui lòng thử lại.");

        const imgs = await Promise.all(pageUrls.map(url => loadImg(url!)));
        const w = Math.max(...imgs.map(img => img.naturalWidth));
        const totalH = imgs.reduce((sum, img) => sum + img.naturalHeight, 0);

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = w;
        exportCanvas.height = totalH;
        const ctx = exportCanvas.getContext('2d')!;

        let currentY = 0;
        imgs.forEach((img) => {
          const sliceH = img.naturalHeight;
          ctx.drawImage(img, 0, currentY, w, sliceH);
          currentY += sliceH;
        });

        exportCanvas.toBlob((blob) => {
          if (!blob) throw new Error('Không tạo được file ảnh.');
          saveAs(blob, `deepkoma-clean-${Date.now()}.jpg`);
          toast.success('Xuất ảnh sạch thành công!', { id: loadId });
          setIsExporting(false);
        }, 'image/jpeg', 0.95);

      } else {
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
      toast.success((tObj) => (
        <div className="flex flex-col gap-2">
          <span className="font-bold">Đã tạo file PSD thành công!</span>
          <div className="text-[11px] opacity-90">Nếu file PSD bị lỗi font tiếng Việt, hãy tải và cài đặt bộ Font chuẩn:</div>
          <button onClick={() => { toast.dismiss(tObj.id); mangaApi.downloadFontPack(); }} className="px-3 py-1.5 text-[11px] font-bold bg-primary text-white rounded-lg flex items-center justify-center gap-1.5">
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

      {/* 1. LEFT ZONE: LOGO */}
      <div className="flex items-center gap-3 flex-1">
        <DeepKomaLogo onClick={handleLogoClick} className="cursor-pointer transition-opacity hover:opacity-80" iconSize={32} showSubtitle={false} />
      </div>

      {/* 2. CENTER ZONE: VIEW MODE ONLY */}
      <div className="hidden md:flex items-center justify-center flex-1">
        {/* Toggle Raw/Clean View Mode */}
        <div className="flex items-center bg-slate-900/50 border border-slate-700/60 p-0.5 rounded-lg">
          <button 
            onClick={() => setIsComparing(false)} 
            className={`px-4 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
              !isComparing ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'
            }`}
          >
            {t('topbar.viewModeAi')}
          </button>
          <button 
            onClick={() => setIsComparing(true)} 
            className={`px-4 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
              isComparing ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'
            }`}
          >
            {t('topbar.viewModeRaw')}
          </button>
        </div>
      </div>

      {/* 3. RIGHT ZONE: MODEL UPGRADE BADGES & EXPORT */}
      <div className="flex items-center justify-end gap-2.5 flex-1 relative">
        {/* 
          ========================================================================================
          ⚠️ QUY TẮC CỐT LÕI (BẮT BUỘC TUÂN THỦ - TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP THAY ĐỔI):
          1. TUYỆT ĐỐI KHÔNG ĐƯỢC THÊM CỤM "NẠP GPU" (GPU BALANCE / CREDITS / CONSOLE / RECHARGE SWITCH)
             VÀO TOPBAR!
          2. TUYỆT ĐỐI KHÔNG ĐƯỢC THÊM MENU "PROFILE / ACCOUNT / AVATAR" VÀO TOPBAR!
          - Lý do: Người dùng yêu cầu Topbar phải tối giản, sạch sẽ, chỉ giữ các công cụ thao tác trực tiếp.
          - Toàn bộ tính năng tài khoản và nạp GPU thuộc về Sidebar hoặc Settings Modal riêng biệt.
          - TUYỆT ĐỐI KHÔNG TỰ Ý ĐƯA LẠI VÀO ĐÂY DƯỚI BẤT KỲ LÝ DO NÀO!
          ========================================================================================
        */}

        {/* Badges nâng cấp model AI (đặt sát bên trái nút Export) */}
        <ModelUpgradeBadges />

        {/* Menu Export */}
        <div className="relative shrink-0" ref={exportMenuRef}>
          <button 
            disabled={isExporting}
            onClick={() => {
              if (isExporting) return;
              setIsExportMenuOpen(!isExportMenuOpen); 
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
      </div>

    </header>
  );
}