import { useProjectStore } from '../../store/useProjectStore';
import { useEffect, useRef, useState, useCallback } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreVertical, Trash2, Wand2, RefreshCw, XCircle, CheckCircle2, Clock, Image as ImageIcon, Loader2, Upload, GripVertical, Sparkles, AlertTriangle, PanelLeftClose, X, Square, Check, Layers, FileImage, Download, Package, ChevronDown, Undo2, Search } from 'lucide-react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import { useConfigStore, VALID_LANGUAGES } from '../../store/useConfigStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTranslation } from 'react-i18next';

import toast from 'react-hot-toast';
import { mangaApi } from '../../services/api';

const API_URL = `${import.meta.env.VITE_API_URL}/api`;



// =========================================
// 1. COMPONENT CON: THẺ TRANG TRUYỆN (UI NÂNG CẤP)
// =========================================
function SortableItem({
  id, file, isActive, status, displayImg, progress,
  onClick, onTranslate, onDelete, onCancel, onRetry,
  isSelected, isSelectionMode, onToggleSelection, hasCleanUrl,
  isProcessing, disabled, retryCount
}: any) {

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: id,
    disabled: isSelectionMode
  });

  const { t } = useTranslation();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...(!isSelectionMode ? listeners : {})}>
      <div
        onClick={(e) => {
          if (isSelectionMode) {
            e.stopPropagation();
            onToggleSelection();
          } else {
            onClick(e);
          }
        }}
        className={`w-full text-left rounded-xl flex items-center p-2.5 transition-colors border group relative outline-none min-h-[5.5rem] ${isSelectionMode ? 'cursor-pointer' : 'cursor-grab'} ${isDragging ? 'opacity-50 shadow-2xl scale-105 border-primary bg-primary/20' :
          isSelected ? 'bg-primary/15 border-primary/50 shadow-md ring-1 ring-primary/50' :
            isActive ? 'bg-primary/10 border-primary/40 shadow-lg' :
              status === 'error' ? 'bg-danger/5 border-danger/30 hover:bg-danger/10' :
                status === 'waiting' ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/10' :
                  'bg-panel/40 border-transparent hover:border-border hover:bg-panel/60'
          }`}
      >
        {/* DRAG HANDLE */}
        {!isSelectionMode && (
          <div ref={setActivatorNodeRef} className="flex shrink-0 w-5 h-full items-center justify-center opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity text-text-muted">
            <GripVertical size={16} />
          </div>
        )}

        {/* CHECKBOX (SELECTION MODE) */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggleSelection(); }}
          className={`absolute left-2.5 z-20 w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer shadow-sm border ${isSelected
            ? 'bg-primary border-primary text-white opacity-100 scale-100'
            : 'bg-background/90 border-border text-transparent hover:border-primary opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
            } ${isSelectionMode && !isSelected ? 'opacity-100' : ''}`}
        >
          <Check size={14} strokeWidth={3} className={isSelected ? 'opacity-100' : 'opacity-0'} />
        </div>

        {/* 🚀 BẢN VÁ UI 1: PHÓNG TO THUMBNAIL (w-14 h-20) */}
        <div className={`relative w-14 h-20 shrink-0 rounded-lg overflow-hidden border border-border bg-black/40 transition-transform shadow-sm ${isSelectionMode && !isSelected ? 'ml-6' : isSelected ? 'ml-6' : (!isSelectionMode ? 'ml-1' : '')}`}>
          {displayImg ? (
            <img src={displayImg} className={`w-full h-full object-cover ${(status === 'processing' || isProcessing || status === 'error') ? 'blur-[2px] opacity-50 scale-110' : ''} ph-no-capture`} alt="thumb" crossOrigin="anonymous" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800"><Loader2 className="animate-spin text-gray-600" size={16} /></div>
          )}

          {(status === 'processing' || isProcessing) && <div className="absolute inset-0 flex items-center justify-center bg-primary/20"><Loader2 className="animate-spin text-white" size={20} /></div>}
          {status === 'completed' && <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5 shadow-sm"><CheckCircle2 size={10} className="text-white" /></div>}
        </div>

        {/* ============================================================== */}
        {/* 🚀 BẢN VÁ UI 2: CHIA LẠI KHÔNG GIAN (PADDING ĐỘNG) VÀ FIX BỊ ÉP CHỮ */}
        {/* ============================================================== */}
        <div className={`flex flex-col gap-1 overflow-hidden flex-1 min-w-0 pl-3 justify-center transition-all duration-300 ${
          (status === 'processing' || status === 'waiting') 
            ? 'pr-12' 
            : 'pr-[65px] group-hover:pr-[130px]'
        }`}>
          <span className={`text-xs font-bold truncate block w-full ${isActive || isSelected ? 'text-primary' : status === 'error' ? 'text-danger' : 'text-text-main'}`}>
            {file.name}
          </span>
          
          {status === 'unprocessed' && <span className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold uppercase truncate"><Clock size={12} /> {t('sidebar.waiting')}</span>}
          {status === 'waiting' && <span className="flex items-center gap-1.5 text-[10px] text-amber-500 font-bold uppercase truncate animate-pulse"><Clock size={12} /> {t('sidebar.waitingQueue')}</span>}
          
          {status === 'processing' && (
            <div className="flex flex-col gap-1.5 mt-0.5 w-full">
              {/* 🚀 FIX 1: Bỏ truncate, dùng line-clamp-2 để chữ được phép rớt 2 dòng mà không bị cắt cụt */}
              <span className="text-[9.5px] text-amber-400 font-bold uppercase line-clamp-2 leading-snug w-full tracking-wide">
                {progress ? `${Math.round(progress.percent)}% - ${progress.message}` : t('sidebar.startingAi')}
              </span>
              
              {/* 🚀 FIX 2: Thanh tiến trình được làm nổi bật với hiệu ứng 3D và Gradient */}
              <div className="w-full bg-black/40 rounded-full h-1.5 border border-border/40 overflow-hidden shrink-0 shadow-inner">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full transition-all duration-300 ease-out relative" 
                  style={{ width: `${progress ? progress.percent : 0}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </div>
              </div>
            </div>
          )}
          
          {status === 'completed' && <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-black uppercase truncate"><CheckCircle2 size={12} /> {t('sidebar.completed')}</span>}
          {retryCount >= 3 && (
            <span className="flex items-center gap-1 text-[9.5px] text-orange-400 font-bold uppercase truncate mt-0.5" title="AI đã đạt giới hạn dịch tự động cho đoạn này. Vui lòng chỉnh sửa bản dịch thủ công để có kết quả tốt nhất.">
              <AlertTriangle size={11} className="shrink-0 text-orange-400 animate-pulse" /> Đạt giới hạn AI
            </span>
          )}
        </div>

        {/* ============================================================== */}
        {/* 🚀 BẢN VÁ UI 3: TĂNG KÍCH THƯỚC CÁC NÚT BẤM DỄ THAO TÁC HƠN */}
        {/* ============================================================== */}
        {!isSelectionMode && status !== 'processing' && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex flex-col items-end gap-2 
            opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20"
          >
            {/* NÚT XÓA (To hơn một chút: p-2, icon 14) */}
            <button 
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); if (disabled) return; onDelete(); }} 
              className={`p-2 text-text-muted hover:bg-danger hover:text-white rounded-lg transition-colors bg-background/80 backdrop-blur-md border border-border/50 shadow-sm shrink-0 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} 
              title={t('sidebar.deletePage')}
            >
              <Trash2 size={14} />
            </button>

            {/* CÁC NÚT HÀNH ĐỘNG (Padding lớn hơn, chữ to hơn: text-[11px]) */}
            {status === 'unprocessed' && (
              <button
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); onTranslate(); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-[11px] font-bold shadow-sm transition-colors cursor-pointer shrink-0 ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
              >
                <Wand2 size={11} className="shrink-0" />
                <span>{t('canvas.translateAction', 'Dịch')}</span>
              </button>
            )}

            {status === 'error' && (
              <button
                disabled={disabled || (hasCleanUrl && retryCount >= 3)}
                onClick={(e) => { e.stopPropagation(); hasCleanUrl ? onRetry() : onTranslate(); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-danger hover:bg-red-600 text-white rounded-lg text-[11px] font-bold shadow-sm transition-colors cursor-pointer shrink-0 ${(disabled || (hasCleanUrl && retryCount >= 3)) ? 'opacity-50 cursor-not-allowed pointer-events-none grayscale' : ''}`}
              >
                {hasCleanUrl ? (
                  <>
                    <Sparkles size={11} className={retryCount >= 3 ? "" : "animate-pulse"} />
                    <span>Dịch lại AI</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} />
                    <span>{t('sidebar.retrySingle')}</span>
                  </>
                )}
              </button>
            )}

            {status === 'completed' && (
              <button 
                disabled={disabled || retryCount >= 3}
                onClick={(e) => { e.stopPropagation(); onRetry(); }} 
                className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-background/95 backdrop-blur-md border border-border hover:border-primary/50 text-primary hover:bg-primary/10 rounded-lg text-[11px] font-bold shadow-sm transition-all cursor-pointer shrink-0 ${(disabled || retryCount >= 3) ? 'opacity-50 cursor-not-allowed pointer-events-none grayscale' : ''}`} 
                title={t('sidebar.retranslate')}
              >
                <Sparkles size={11} className={retryCount >= 3 ? "" : "animate-pulse"} />
                <span>Dịch lại AI</span>
              </button>
            )}
          </div>
        )}

        {/* NÚT DỪNG (To hơn: w-8 h-8, icon 14) */}
        {!isSelectionMode && (status === 'processing' || status === 'waiting') && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onCancel(); }}>
            <button className="flex items-center justify-center w-8 h-8 bg-background/90 backdrop-blur-md hover:bg-danger text-danger hover:text-white border border-danger/30 hover:border-danger rounded-lg shadow-sm transition-all cursor-pointer group" title={status === 'waiting' ? t('sidebar.cancelQueue') : t('sidebar.stop')}>
              <Square size={14} className="fill-current group-hover:scale-90 transition-transform" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}


// ==========================================
// 2. COMPONENT CHÍNH: SIDEBAR
// ==========================================
export default function Sidebar() {
  const projectStore = useProjectStore();
  const { fileQueue, currentIndex, setCurrentIndex, pageStatuses, processedUrls, uploadProjectFiles, reorderFiles, progresses, retryCounts } = projectStore;
  const isProcessing = useToolStore((state) => state.isProcessing);
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const currentCredits = user?.credits || 0;

  const modeCost = 1; // Chi phí dịch chạy ngầm Celery mặc định là 1 Xu/trang

  const [previews, setPreviews] = useState<Record<number, string>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeTasksRef = useRef<Record<number, { taskId: string, eventSource: EventSource }>>({});
  const deleteTimeoutsRef = useRef<Record<string, any>>({});
  const importMangaRef = useRef<HTMLInputElement>(null);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // 🚀 STATE MỚI CHO MULTI-SELECT & FAB BAR
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    const imageFiles = files.filter(file => 
      file.type.startsWith('image/') || file.name.endsWith('.manga')
    );
    if (imageFiles.length === 0) return;
    if (imageFiles.length > 30) {
      toast.error("Để đảm bảo tốc độ, chỉ hỗ trợ tải lên tối đa 30 trang mỗi lần!");
      return;
    }
    uploadProjectFiles(imageFiles.sort((a, b) => a.name.localeCompare(b.name)));
  };

  const isSelectionMode = selectedPages.size > 0;


  const [sidebarWidth, setSidebarWidth] = useState(280); // Mặc định 256px
  const isResizing = useRef(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; // Chống bôi đen chữ khi kéo
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = '';
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing.current) {
      let newWidth = e.clientX;
      if (newWidth < 220) newWidth = 220; // Ép kích thước tối thiểu
      if (newWidth > 600) newWidth = 600; // Ép kích thước tối đa
      setSidebarWidth(newWidth);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  useEffect(() => {
    (window as any).cancelPageTask = handleCancelTask;
    return () => {
      delete (window as any).cancelPageTask;
    };
  }, [fileQueue]);

  const toggleSelection = (pageId: string) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedPages(new Set());
    setIsExportMenuOpen(false);
  };

  const handleExportBatch = async (type: 'raw' | 'clean' | 'psd') => {
    if (!projectStore.projectId) return toast.error("Vui lòng lưu dự án trước!");

    // Đóng menu và hiển thị Toast
    setIsExportMenuOpen(false);
    const loadingToast = toast.loading(`📦 Đang đóng gói ${selectedPages.size} file ${type.toUpperCase()}...`);

    try {
      const token = localStorage.getItem("token");
      // 🚀 Truyền danh sách ID đã chọn lên API (Backend có thể đọc query này để lọc file)
      const selectedIdsParam = Array.from(selectedPages).join(',');
      const url = `${import.meta.env.VITE_API_URL}/projects/${projectStore.projectId}/export-batch?export_type=${type}&page_ids=${selectedIdsParam}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error("Lỗi khi tạo file nén");

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `Export_${type.toUpperCase()}_${selectedPages.size}_Pages.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objectUrl);

      toast.success("✅ Tải file thành công!", { id: loadingToast });
      clearSelection(); // Reset UI sau khi tải xong
    } catch (error: any) {
      toast.error(`❌ Tải thất bại: ${error.message}`, { id: loadingToast });
    }
  };

  const handleImportManga = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const projectId = useProjectStore.getState().projectId;
    if (!projectId) return toast.error("Vui lòng chọn hoặc tạo Dự án trước!");

    const loadId = toast.loading(`Đang khôi phục dự án: ${file.name}...`);
    try {
      await mangaApi.importManga(projectId, file);
      toast.success("Khôi phục thành công! Đang tải lại trang...", { id: loadId });
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      toast.error(error.message, { id: loadId });
    }
    e.target.value = '';
  };

  const handleCancelTask = async (pageIndex: number) => {
    const task = activeTasksRef.current[pageIndex];
    if (task) {
      task.eventSource.close();
      try {
        await mangaApi.cancelTask(task.taskId);
        toast.success(`Đã hủy dịch trang ${fileQueue[pageIndex]?.name}`);
      } catch (err) {
        console.error("Lỗi hủy task:", err);
      }
      delete activeTasksRef.current[pageIndex];
    }
    projectStore.clearProgress(pageIndex);
    projectStore.setPageStatus(pageIndex, "unprocessed");
  };

  const processSinglePage = (pageIndex: number) => {
    return new Promise<void>(async (resolve) => {
      const pageId = projectStore.pageIds[pageIndex];
      if (!pageId) {
        resolve();
        return;
      }

      projectStore.setPageStatus(pageIndex, "processing");

      try {
        const configStore = useConfigStore.getState();

        const data = await mangaApi.translatePageById(pageId, {
          genre: configStore.genre,
          tone: configStore.tone,
          pronouns: configStore.pronoun,
          glossary: configStore.glossary,
          targetLanguage: configStore.targetLanguage || "Tiếng Việt"
        });

        if (data.task_id) {
          const taskId = data.task_id;
          
          // Kiểm tra xem có phải là cache hit không (nếu là cache hit thì taskId bắt đầu bằng cached_)
          const isCacheHit = taskId.startsWith("cached_");
          if (!isCacheHit) {
            toast("Đã trừ 1 Xu", { icon: "💰", duration: 2000 });
            useAuthStore.getState().deductLocalCredits(1);
          }

          // 🚀 Chỉ mở 1 đường truyền SSE duy nhất
          const eventSource = new EventSource(`${API_URL}/stream/${taskId}`);
          activeTasksRef.current[pageIndex] = { taskId, eventSource };

          eventSource.onmessage = async (event) => {
            const sseData = JSON.parse(event.data);

            // 🚀 Liên tục cập nhật tiến độ (Ví dụ: Runpod đang tải 10%... 30%...)
            useProjectStore.setState((state: any) => ({
              progresses: { ...state.progresses, [pageIndex]: { percent: sseData.progress, message: sseData.message } }
            }));

            if (sseData.state === "SUCCESS") {
              eventSource.close();
              delete activeTasksRef.current[pageIndex];

              // 🚀 BẢN VÁ UX: RUNPOD XONG RỒI NHƯNG KHÔNG ĐƯỢC BÁO HOÀN TẤT VỘI!
              // Ép thanh tiến trình đứng ở 90% và báo đang gọi DeepSeek
              projectStore.setPageStatus(pageIndex, "processing");
              useProjectStore.setState((state: any) => ({
                progresses: { ...state.progresses, [pageIndex]: { percent: 90, message: "Đang dịch thuật..." } }
              }));

              let taskData = null;
              // Vòng lặp chờ VPS và DeepSeek làm việc (Cái này tốn 2-3 giây)
              for (let i = 0; i < 15; i++) {
                const taskRes = await fetch(`${API_URL}/task/${taskId}`);
                const data = await taskRes.json();
                if (data.status === "SUCCESS" && data.result) {
                  taskData = data;
                  break;
                }
                await new Promise(res => setTimeout(res, 1000));
              }

              if (taskData && taskData.result) {
                const result = taskData.result;
                const fullCleanUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${result.clean_url}?t=${Date.now()}`;
                projectStore.setProcessedUrl(pageIndex, fullCleanUrl);

                const toolState = useToolStore.getState();

                const newBubbles = result.data.map((item: any) => {
                  const origW = item.box_coordinates.x2 - item.box_coordinates.x1;
                  const origH = item.box_coordinates.y2 - item.box_coordinates.y1;

                  return {
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                    x: item.box_coordinates.x1,
                    y: item.box_coordinates.y1,
                    w: origW,
                    h: origH,
                    text: item.vietnamese,
                    japanese: item.japanese,
                    fontSize: toolState.fontSize,
                    fontColor: toolState.fontColor,
                    fontFamily: toolState.fontFamily,
                    rotation: 0,
                    sfxClass: "",
                    rawBox: item.box_coordinates,
                    boxX: item.box_coordinates.x1,
                    boxY: item.box_coordinates.y1,
                    boxW: origW,
                    boxH: origH,
                  };
                });

                if (pageIndex === useProjectStore.getState().currentIndex) {
                  const canvasStore = useCanvasStore.getState();
                  canvasStore.setBubbles(newBubbles);
                } else {
                  mangaApi.savePageBubbles(pageId, newBubbles).catch(console.error);
                }

                // 🚀 LƯU Ý MŨI TIÊM THÔNG MINH TRƯỚC ĐÓ CỦA SẾP (Kiểm tra chữ Lỗi)
                const hasTranslationError = newBubbles.some((b: any) => (b.text || "").toLowerCase().includes("lỗi"));

                if (hasTranslationError) {
                  projectStore.setPageStatus(pageIndex, "error"); // Đánh thẻ Đỏ
                  toast.error(`Trang ${pageIndex + 1} gặp lỗi xử lý dịch thuật!`);
                } else {
                  projectStore.setPageStatus(pageIndex, "completed"); // Xanh tuyệt đối!
                }

                await mangaApi.savePageResults(pageId, result.clean_url, newBubbles)
                  .catch(err => console.error("Lỗi lưu kết quả vào DB:", err));

                // 🚀 CHỈ KHI CHỮ ĐÃ ĐƯỢC VẼ LÊN HÌNH THÌ MỚI XÓA THANH TIẾN TRÌNH
                setTimeout(() => projectStore.clearProgress(pageIndex), 1000);
                
                // Đồng bộ Xu từ máy chủ
                useAuthStore.getState().fetchProfile();
              }
              resolve();
            } else if (sseData.state === "FAILURE") {
              eventSource.close();
              delete activeTasksRef.current[pageIndex];
              projectStore.clearProgress(pageIndex);
              projectStore.setPageStatus(pageIndex, "error");
              // Đồng bộ Xu (trong trường hợp được hoàn Xu)
              useAuthStore.getState().fetchProfile();
              resolve();
            }
          };

          eventSource.onerror = () => {
            eventSource.close();
            delete activeTasksRef.current[pageIndex];
            projectStore.clearProgress(pageIndex);
            projectStore.setPageStatus(pageIndex, "error");
            // Đồng bộ Xu (trong trường hợp được hoàn Xu)
            useAuthStore.getState().fetchProfile();
            resolve();
          };
        } else {
          resolve();
        }
      } catch (error) {
        projectStore.clearProgress(pageIndex);
        projectStore.setPageStatus(pageIndex, "error");
        // Đồng bộ Xu khi gặp lỗi ném ra từ API dịch
        useAuthStore.getState().fetchProfile();
        resolve();
      }
    });
  };

  // 🚀 BẢN VÁ TỐI THƯỢNG: Phân luồng Dịch lại cực kỳ thông minh
  // 🚀 BẢN VÁ TỐI THƯỢNG: Phân luồng Dịch lại cực kỳ thông minh và Chống Race Condition
  const handleRetrySinglePage = async (pageIndex: number) => {
    const state = useProjectStore.getState();
    const pageId = state.pageIds[pageIndex];
    if (!pageId) return;

    const currentRetryCount = state.retryCounts[pageIndex] || 0;
    if (currentRetryCount >= 3) {
      toast.error("AI đã đạt giới hạn dịch tự động cho trang này!");
      return;
    }

    const prevStatus = state.pageStatuses[pageIndex] || 'completed';

    // Đánh dấu trang đang xử lý để ẩn nút bấm
    projectStore.setPageStatus(pageIndex, "processing");
    useProjectStore.setState((s: any) => ({
      progresses: { ...s.progresses, [pageIndex]: { percent: 50, message: "Đang dịch lại..." } }
    }));

    // 1. Kiểm tra xem trang này đã qua bàn tay Runpod (có ảnh xóa nền) chưa?
    const hasCleanUrl = !!state.processedUrls[pageIndex];

    if (hasCleanUrl) {
      // 🟢 LUỒNG 1: CÓ ẢNH SẠCH RỒI -> TUYỆT ĐỐI CHỈ GỌI DEEPSEEK
      const loadId = toast.loading("Đang dịch lại...");
      try {
        const result = await mangaApi.retryTextTranslation(pageId);

        // 🚀 FIX 1: Map lại dữ liệu để đảm bảo chữ Việt được dán đúng vào trường 'text' của Fabric.js và chuẩn hóa layout
        const updatedBubbles = result.bubbles.map((b: any) => {
          let x = b.x;
          let y = b.y;
          let w = b.w;
          let h = b.h;
          
          if ((x === undefined || y === undefined || w === undefined || h === undefined) && b.box_coordinates) {
            x = b.box_coordinates.x1;
            y = b.box_coordinates.y1;
            w = b.box_coordinates.x2 - b.box_coordinates.x1;
            h = b.box_coordinates.y2 - b.box_coordinates.y1;
          } else if ((x === undefined || y === undefined || w === undefined || h === undefined) && b.rawBox) {
            x = b.rawBox.x1;
            y = b.rawBox.y1;
            w = b.rawBox.x2 - b.rawBox.x1;
            h = b.rawBox.y2 - b.rawBox.y1;
          }

          x = x !== undefined ? x : 0;
          y = y !== undefined ? y : 0;
          w = w !== undefined ? w : 100;
          h = h !== undefined ? h : 50;

          const toolState = useToolStore.getState();

          return {
            ...b,
            x,
            y,
            w,
            h,
            text: b.text !== undefined && b.text !== "" ? b.text : (b.vietnamese || ""),
            japanese: b.japanese || "",
            vietnamese: b.vietnamese || b.text || "",
            fontSize: b.fontSize || toolState.fontSize || 20,
            fontColor: b.fontColor || toolState.fontColor || "#000000",
            fontFamily: b.fontFamily || toolState.fontFamily || "'Comic Neue', cursive",
            rotation: b.rotation !== undefined ? b.rotation : 0,
            sfxClass: b.sfxClass || "",
            boxX: b.boxX !== undefined ? b.boxX : x,
            boxY: b.boxY !== undefined ? b.boxY : y,
            boxW: b.boxW !== undefined ? b.boxW : w,
            boxH: b.boxH !== undefined ? b.boxH : h,
          };
        });

        const realTimeIndex = useProjectStore.getState().currentIndex;

        if (realTimeIndex === pageIndex) {
          // 🚀 FIX 2: Dùng setBubbles để vẽ lại chữ an toàn tuyệt đối (Không bị crash trắng trang)
          const canvasStore = useCanvasStore.getState();
          canvasStore.setBubbles(updatedBubbles);
        } else {
          // 🚀 FIX 3 (RACE CONDITION): Nếu sếp đã chuyển sang trang khác, ÉP HỆ THỐNG LƯU KẾT QUẢ MỚI VÀO DB!
          // Đề phòng trường hợp Auto-save của trang cũ vừa ghi đè nhầm.
          mangaApi.savePageBubbles(pageId, updatedBubbles).catch(console.error);
        }

        toast.success("Dịch lại thành công!", { id: loadId });
        projectStore.clearProgress(pageIndex);

        // Cập nhật retry count từ kết quả trả về của API hoặc tăng cục bộ
        const apiRetryCount = result.retry_count !== undefined ? result.retry_count : (currentRetryCount + 1);
        projectStore.setRetryCount(pageIndex, apiRetryCount);

        // Cập nhật thẻ Xanh/Đỏ
        const hasTranslationError = updatedBubbles.some((b: any) => (b.text || "").toLowerCase().includes("lỗi"));
        if (hasTranslationError) {
          useProjectStore.getState().setPageStatus(pageIndex, "error");
        } else {
          useProjectStore.getState().setPageStatus(pageIndex, "completed");
        }
      } catch (err: any) {
        toast.error(err.message, { id: loadId });
        projectStore.clearProgress(pageIndex);
        useProjectStore.getState().setPageStatus(pageIndex, prevStatus);
        
        if (err.message && (err.message.includes("giới hạn") || err.message.includes("limit"))) {
          projectStore.setRetryCount(pageIndex, 3);
        }
      }
    } else {
      // 🔴 LUỒNG 2: CHƯA CÓ ẢNH SẠCH -> Buộc phải gọi Runpod cày lại từ đầu
      processSinglePage(pageIndex);
    }
  };

  const handleDeletePage = (index: number) => {
    const file = fileQueue[index];
    const fileName = file.name;
    const pageId = projectStore.pageIds[index];
    const uniqueId = pageId || `temp-${index}-${file.name}`;

    if (deleteTimeoutsRef.current[uniqueId]) return;

    if (index === projectStore.currentIndex) {
      const nextIndex = fileQueue.findIndex((f, i) => {
        if (i === index) return false;
        const uid = projectStore.pageIds[i] || `temp-${i}-${f.name}`;
        return !pendingDeletes.has(uid);
      });
      projectStore.setCurrentIndex(nextIndex !== -1 ? nextIndex : -1);
    }

    const wasActive = index === projectStore.currentIndex;

    setPendingDeletes(prev => new Set(prev).add(uniqueId));

    toast((t) => (
      <div className="flex items-center gap-3">
        <span className="text-sm">Đang xóa <b>{fileName}</b>...</span>
        <button
          onClick={() => {
            clearTimeout(deleteTimeoutsRef.current[uniqueId]);
            delete deleteTimeoutsRef.current[uniqueId];

            setPendingDeletes(prev => {
              const next = new Set(prev);
              next.delete(uniqueId);
              return next;
            });

            // Định vị lại index thực tế của trang sau khi hoàn tác để tránh bị lệch do kéo thả (reorder)
            const state = useProjectStore.getState();
            const realIndex = state.fileQueue.findIndex((f, i) => {
              const uid = state.pageIds[i] || `temp-${i}-${f.name}`;
              return uid === uniqueId;
            });

            if (realIndex !== -1 && (wasActive || state.currentIndex === -1)) {
              projectStore.setCurrentIndex(realIndex);
            }

            toast.dismiss(t.id);
            toast.success("Đã hoàn tác! Giữ lại trang.");
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
        >
          <Undo2 size={13} className="text-white" />
          <span>Hoàn tác</span>
        </button>
      </div>
    ), { 
      duration: 5000, 
      id: `delete-${uniqueId}`, 
      icon: <Clock size={16} className="text-amber-500 animate-pulse" /> 
    });

    deleteTimeoutsRef.current[uniqueId] = setTimeout(async () => {
      const state = useProjectStore.getState();
      const realIndex = state.fileQueue.findIndex((f, i) => {
        const uid = state.pageIds[i] || `temp-${i}-${f.name}`;
        return uid === uniqueId;
      });

      if (realIndex !== -1) {
        if (state.pageStatuses[realIndex] === 'processing') {
          handleCancelTask(realIndex);
        }
        await state.removePage(realIndex);
      }
      delete deleteTimeoutsRef.current[uniqueId];

      setPendingDeletes(prev => {
        const next = new Set(prev);
        next.delete(uniqueId);
        return next;
      });
    }, 5000);
  }

  // 🚀 FIX: TÌM ẢNH BẰNG UNIQUE ID MỚI TRÁNH CRASH KHI KÉO THẢ
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldItem = visibleFiles.find(f => f.uniqueId === active.id);
      const newItem = visibleFiles.find(f => f.uniqueId === over.id);

      if (oldItem && newItem) {
        reorderFiles(oldItem.index, newItem.index);
      }
    }
  };

  const handlePageClick = (index: number) => {
    const currentPageId = projectStore.pageIds[projectStore.currentIndex];
    const prevStatus = projectStore.pageStatuses[projectStore.currentIndex];
    const isPrevProcessing = prevStatus === 'processing' || prevStatus === 'waiting';

    // 🚀 BẢN VÁ TỐI THƯỢNG: CHẶN ĐỨNG RACE CONDITION
    if (currentPageId && !isPrevProcessing) {
      const currentBubbles = useCanvasStore.getState().bubbles;

      // BÍ QUYẾT: Chỉ Auto-save khi trên màn hình THỰC SỰ CÓ CHỮ.
      // Tuyệt đối không bao giờ lưu mảng rỗng.
      if (currentBubbles && currentBubbles.length > 0) {
        mangaApi.savePageBubbles(currentPageId, currentBubbles).catch(console.error);
      }
    }

    // Đồng bộ Canvas với Server trước khi chuyển
    const targetPageId = projectStore.pageIds[index];
    if (currentPageId !== targetPageId) {
      projectStore.setCurrentIndex(index);
      // Reset trạng thái phiên vẽ lại AI khi đổi trang
      useToolStore.getState().setIsRedrawSessionActive(false);
    }
  };

  useEffect(() => {
    const newPreviews: Record<number, string> = {};

    fileQueue.forEach((file, index) => {
      if (projectStore.processedUrls[index]) {
        newPreviews[index] = projectStore.processedUrls[index];
      }
      else if (file.size === 0) {
        const pageId = projectStore.pageIds[index];
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
        newPreviews[index] = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/workspace/${projectStore.projectId}/raw/${pageId}.${ext}`;
      }
      else {
        newPreviews[index] = URL.createObjectURL(file);
      }
    });

    setPreviews(newPreviews);

    return () => {
      Object.values(newPreviews).forEach(url => {
        if (url.startsWith('blob:')) {
          // 🚀 BẢN VÁ: Trì hoãn việc xóa Blob URL 10 giây để trình duyệt không báo lỗi đỏ lòm
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }
      });
    };
  }, [fileQueue, projectStore.processedUrls]);

  const allProjectFiles = fileQueue
    .map((file, index) => {
      const pageId = projectStore.pageIds[index];
      return {
        file,
        index,
        // Nếu đã có ID từ Server thì dùng, chưa có thì tự sinh ID tạm thời
        uniqueId: pageId || `temp-${index}-${file.name}`
      };
    })
    .filter(({ uniqueId }) => !pendingDeletes.has(uniqueId));

  const visibleFiles = allProjectFiles.filter(({ file }) => {
    if (!searchQuery.trim()) return true;
    return file.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
  });

  const itemIds = visibleFiles.map(f => f.uniqueId);

  const totalPages = allProjectFiles.length;
  const completedPages = allProjectFiles.filter(({ index }) => pageStatuses[index] === 'completed').length;
  const errorPages = allProjectFiles.filter(({ index }) => pageStatuses[index] === 'error').length;
  const processingPages = allProjectFiles.filter(({ index }) => pageStatuses[index] === 'processing').length;
  const progressPercent = totalPages === 0 ? 0 : ((completedPages + errorPages) / totalPages) * 100;
  const hasUnprocessed = allProjectFiles.some(({ index }) => pageStatuses[index] === 'unprocessed' || pageStatuses[index] === 'error');
  const isAnyProcessingOrWaiting = allProjectFiles.some(({ index }) => pageStatuses[index] === 'processing' || pageStatuses[index] === 'waiting');

  const isAllVisibleSelected = visibleFiles.length > 0 && visibleFiles.every(f => selectedPages.has(f.uniqueId));
  const isSomeVisibleSelected = visibleFiles.some(f => selectedPages.has(f.uniqueId)) && !isAllVisibleSelected;

  const handleTranslateAll = async () => {
    if (visibleFiles.length === 0) return;

    // Lọc ra các trang cần dịch
    const pendingIndexes = visibleFiles
      .map(f => f.index)
      .filter(index => projectStore.pageStatuses[index] === 'unprocessed' || projectStore.pageStatuses[index] === 'error');

    if (pendingIndexes.length === 0) return;

    // Đánh dấu tất cả trang chờ là "Đang chờ..."
    pendingIndexes.forEach(index => {
      projectStore.setPageStatus(index, "waiting");
    });

    // Chạy với giới hạn đồng thời tối đa là 3 trang để tránh nghẽn browser connection pool (limit 6)
    const limit = 3;
    let nextIdx = 0;

    const runNext = async () => {
      if (nextIdx >= pendingIndexes.length) return;
      const index = pendingIndexes[nextIdx++];

      // Nếu trang đã bị hủy khỏi hàng đợi (không còn là 'waiting'), bỏ qua và chạy tiếp trang tiếp theo
      if (useProjectStore.getState().pageStatuses[index] !== 'waiting') {
        runNext();
        return;
      }

      try {
        await processSinglePage(index);
      } catch (err) {
        console.error("Lỗi khi chạy dịch hàng loạt trang:", index, err);
      } finally {
        runNext();
      }
    };

    // Khởi chạy đồng thời tối đa bằng giới hạn limit
    for (let i = 0; i < Math.min(limit, pendingIndexes.length); i++) {
      runNext();
    }
  };

  const handleTranslateSelected = async () => {
    if (selectedPages.size === 0) return;

    // Lấy danh sách index của các trang đã chọn và chưa dịch / lỗi
    const selectedIndexes = visibleFiles
      .filter(({ uniqueId, index }) =>
        selectedPages.has(uniqueId) &&
        (pageStatuses[index] === 'unprocessed' || pageStatuses[index] === 'error')
      )
      .map(f => f.index);

    if (selectedIndexes.length === 0) return;

    const totalCost = selectedIndexes.length * modeCost;
    if (currentCredits < totalCost) {
      toast.error(`Không đủ năng lượng! Cần ⚡${totalCost} nhưng bạn chỉ có ⚡${currentCredits}.`);
      return;
    }

    // Đánh dấu chờ
    selectedIndexes.forEach(index => projectStore.setPageStatus(index, 'waiting'));
    clearSelection();

    const limit = 3;
    let nextIdx = 0;
    const runNext = async () => {
      if (nextIdx >= selectedIndexes.length) return;
      const index = selectedIndexes[nextIdx++];
      if (useProjectStore.getState().pageStatuses[index] !== 'waiting') { runNext(); return; }
      try { await processSinglePage(index); } catch (err) { console.error('Lỗi dịch selected:', index, err); } finally { runNext(); }
    };
    for (let i = 0; i < Math.min(limit, selectedIndexes.length); i++) { runNext(); }
  };

  if (fileQueue.length === 0) return null;

  return (
    <>
      <div
        className="bg-sidebar border-r border-border flex flex-col h-full shadow-2xl z-20 shrink-0 select-none relative"
        style={{ width: `${sidebarWidth}px` }} // 🚀 Bổ sung chiều rộng động
      >

        {/* 🚀 DRAG HANDLE - CỘT MỐC TÀNG HÌNH Ở MÉP PHẢI ĐỂ KÉO */}
        <div
          className="absolute top-0 -right-1.5 w-3 h-full cursor-col-resize z-50 group flex items-center justify-center"
          onMouseDown={startResizing}
        >
          <div className="w-0.5 h-12 bg-transparent group-hover:bg-primary transition-colors rounded-full" />
        </div>

        {/* ── ZONE 1: SLIM HEADER ─────────────────────────── */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full bg-primary/60" />
            <span className="text-[11px] font-extrabold text-text-muted uppercase tracking-wider">
              DANH SÁCH TRANG ({totalPages > 0 ? currentIndex + 1 : 0}/{totalPages})
            </span>
          </div>

          <button
            onClick={() => useToolStore.getState().toggleLeftPanel()}
            className="p-1.5 text-text-muted hover:bg-border/40 hover:text-danger rounded-lg transition-colors cursor-pointer"
            title="Đóng thanh bên trái"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>

        {/* ── ZONE 2: HERO UPLOAD BUTTON (DRAG & DROP ZONE) ── */}
        <div className="px-3 pb-2">
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              group w-full flex flex-col items-center justify-center gap-2.5
              py-7 px-4 rounded-2xl cursor-pointer select-none
              border-2 border-dashed transition-all duration-200
              ${isDragOver 
                ? 'border-primary bg-primary/10 scale-[1.01] shadow-md shadow-primary/5' 
                : 'border-border/60 hover:border-primary/50 bg-[#16161a]/60 hover:bg-[#1a1a24]/40 hover:scale-[1.01]'
              }
            `}
          >
            <Upload size={24} strokeWidth={2} className={`transition-transform duration-200 group-hover:-translate-y-0.5 ${isDragOver ? 'text-primary scale-110' : 'text-text-muted/70 group-hover:text-primary/90'}`} />
            <div className="flex flex-col items-center text-center">
              <span className="text-[11px] font-medium text-text-muted/80">Kéo & thả hoặc bấm để</span>
              <span className="text-[13px] font-extrabold text-text-main group-hover:text-primary transition-colors mt-0.5">Tải ảnh lên</span>
            </div>
            <input
              type="file"
              multiple
              className="hidden"
              accept="image/jpeg, image/png, image/webp,.manga"
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                if (files.length > 30) {
                  toast.error("Để đảm bảo tốc độ, chỉ hỗ trợ tải lên tối đa 30 trang mỗi lần!");
                  e.target.value = '';
                  return;
                }
                uploadProjectFiles(files.sort((a, b) => a.name.localeCompare(b.name)));
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {/* ── ZONE 4: PROGRESS BAR ───────────────────────── */}
        <div className="mx-3 mb-3 bg-[#16161a]/60 rounded-2xl p-4 border border-border/50 flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold text-text-muted">
              Hoàn thành: {completedPages}/{totalPages} trang
            </span>
          </div>
          <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
            <div className="bg-primary h-full transition-all duration-500 rounded-full" style={{ width: `${progressPercent}%` }} />
          </div>
          {(processingPages > 0 || errorPages > 0) && (
            <div className="flex justify-between items-center text-[9px] font-extrabold tracking-wide uppercase pt-0.5">
              {processingPages > 0 ? (
                <span className="text-amber-400 animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
                  Đang chạy: {processingPages}
                </span>
              ) : <span />}
              {errorPages > 0 && <span className="text-danger">Lỗi: {errorPages}</span>}
            </div>
          )}
        </div>

        {/* ── ZONE 3: SEARCH BAR ─────────────────────────── */}
        <div className="px-3 pb-3">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-text-muted/50 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm trang..."
              className="w-full bg-[#16161a]/60 border border-border/50 hover:border-border focus:border-primary/50 text-text-main placeholder-text-muted/40 text-xs rounded-xl pl-9 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-primary/10 transition-all font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-text-muted/40 hover:text-text-muted transition-colors cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* ── SEPARATOR ──────────────────────────────────── */}
        <div className="h-px bg-border/50 mx-3 mb-1" />

        {/* ── LIST CONTROL BAR ───────────────────────────── */}
        <div className="flex items-center justify-between px-3 py-1.5 text-xs text-text-muted font-medium select-none">
          <button
            onClick={() => {
              const visibleIds = visibleFiles.map(f => f.uniqueId);
              if (isAllVisibleSelected) {
                // Deselect all visible pages
                setSelectedPages(prev => {
                  const next = new Set(prev);
                  visibleIds.forEach(id => next.delete(id));
                  return next;
                });
              } else {
                // Select all visible pages
                setSelectedPages(prev => {
                  const next = new Set(prev);
                  visibleIds.forEach(id => next.add(id));
                  return next;
                });
              }
            }}
            className={`flex items-center gap-1.5 text-[10px] font-semibold transition-all duration-150 cursor-pointer
              ${isAllVisibleSelected
                ? 'text-primary'
                : 'text-text-muted hover:text-text-main'
              }`}
            title="Chọn tất cả các trang đang hiển thị"
          >
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
              isAllVisibleSelected
                ? 'bg-primary border-primary text-white'
                : isSomeVisibleSelected
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'border-border/80 text-transparent hover:border-primary'
            }`}>
              {isAllVisibleSelected ? (
                <Check size={10} strokeWidth={4} />
              ) : isSomeVisibleSelected ? (
                <div className="w-1.5 h-0.5 bg-primary" />
              ) : null}
            </div>
            <span>{isAllVisibleSelected ? 'Bỏ chọn' : 'Chọn tất'} ({visibleFiles.length})</span>
          </button>

          {isSelectionMode && (
            <button
              onClick={() => {
                if (!window.confirm(`Xóa ${selectedPages.size} trang đã chọn?`)) return;
                Array.from(selectedPages).forEach((uid) => {
                  const idx = allProjectFiles.findIndex(f => f.uniqueId === uid);
                  if (idx !== -1) handleDeletePage(allProjectFiles[idx].index);
                });
                clearSelection();
              }}
              className="flex items-center gap-1 text-[10px] font-semibold text-danger hover:text-red-400 cursor-pointer transition-all duration-150"
              title="Xóa các trang đang chọn"
            >
              <Trash2 size={12} strokeWidth={2} />
              <span>Xóa ({selectedPages.size})</span>
            </button>
          )}
        </div>


        {/* DANH SÁCH ẢNH (KÉO THẢ & CHỌN) */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar pb-20">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {visibleFiles.map(({ file, index, uniqueId }) => { // 🚀 Lấy uniqueId ra
                  return (
                    <SortableItem
                      key={uniqueId}  // 🚀 Dùng ID an toàn
                      id={uniqueId}   // 🚀 Dùng ID an toàn
                      file={file}
                      isActive={index === currentIndex}
                      status={pageStatuses[index] || 'unprocessed'}
                      displayImg={processedUrls[index] || previews[index]}
                      progress={progresses[index]}
                      onClick={() => handlePageClick(index)}
                      onTranslate={() => processSinglePage(index)}
                      onDelete={() => handleDeletePage(index)}
                      onCancel={() => handleCancelTask(index)}
                      onRetry={() => handleRetrySinglePage(index)}
                      isSelected={selectedPages.has(uniqueId)} // 🚀 Dùng ID an toàn
                      isSelectionMode={isSelectionMode}
                      onToggleSelection={() => toggleSelection(uniqueId)}
                      hasCleanUrl={!!processedUrls[index]} // 🚀 Dùng ID an toàn
                      isProcessing={index === currentIndex && isProcessing}
                      disabled={isAnyProcessingOrWaiting}
                      retryCount={retryCounts[index] || 0} // 🚀 Truyền số lần dịch lại
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* NÚT DỊCH TẤT CẢ (Ẩn đi khi đang chọn ảnh) */}
        <div className={`absolute bottom-0 left-0 w-full p-3 bg-sidebar/95 backdrop-blur-md border-t border-border z-30 transition-transform duration-300 ${isSelectionMode ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
          <button
            onClick={handleTranslateAll}
            disabled={!hasUnprocessed || isAnyProcessingOrWaiting}
            className={`w-full justify-center py-2.5 text-sm transition-all shadow-lg ${(hasUnprocessed && !isAnyProcessingOrWaiting)
              ? 'btn-primary shadow-primary/20 hover:scale-[1.02]'
              : 'bg-panel text-text-muted cursor-not-allowed border border-border/50 rounded-md font-medium flex items-center gap-2'
              }`}
          >
            {isAnyProcessingOrWaiting ? (
              <Loader2 className="animate-spin" size={16} />
            ) : errorPages > 0 ? (
              <RefreshCw size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            {isAnyProcessingOrWaiting
              ? t('sidebar.batchTranslating')
              : errorPages > 0
                ? t('sidebar.retryError', { count: errorPages })
                : hasUnprocessed
                  ? t('sidebar.batchTranslate', 'Dịch Tất Cả (Batch)')
                  : t('sidebar.completedAll')}
          </button>
        </div>
      </div>

      {/* 🚀 LỚP MÀN PHỦ KHI MỞ DROPDOWN (Click outside to close) */}
      {isExportMenuOpen && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setIsExportMenuOpen(false)}></div>
      )}

      {/* 🚀 CONTEXTUAL FLOATING ACTION BAR (FAB) - ĐƯA LÊN TOP CENTER */}
      <div
        className={`fixed top-20 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-4 p-2 pl-4 
          bg-panel/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
          ${isSelectionMode ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-16 opacity-0 scale-95 pointer-events-none'}
        `}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-primary/20 text-primary text-xs font-bold transition-all">
            <span>{selectedPages.size}</span>
          </div>
          <span className="text-sm font-semibold text-text-main select-none">{t('sidebar.selectedPages')}</span>
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <button
          onClick={clearSelection}
          className="p-2 rounded-xl text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          title={t('sidebar.cancelSelection')}
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        {/* NÚT DỊCH CÁC TRANG ĐÃ CHỌN */}
        {(() => {
          const selectedUnprocessedCount = visibleFiles.filter(({ uniqueId, index }) =>
            selectedPages.has(uniqueId) &&
            (pageStatuses[index] === 'unprocessed' || pageStatuses[index] === 'error')
          ).length;
          const totalCost = selectedUnprocessedCount * modeCost;
          const hasEnough = currentCredits >= totalCost && totalCost > 0;
          const nothingToTranslate = selectedUnprocessedCount === 0;

          return (
            <button
              onClick={handleTranslateSelected}
              disabled={nothingToTranslate || !hasEnough || isAnyProcessingOrWaiting}
              title={nothingToTranslate ? 'Không có trang nào cần dịch' : !hasEnough ? `Cần ⚡${totalCost}, bạn có ⚡${currentCredits}` : `Dịch ${selectedUnprocessedCount} trang`}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl transition-all active:scale-95 shadow-md
                ${nothingToTranslate || isAnyProcessingOrWaiting
                  ? 'bg-border/30 text-text-muted cursor-not-allowed'
                  : !hasEnough
                    ? 'bg-danger/10 border border-danger/30 text-danger cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/25 cursor-pointer'
                }`}
            >
              <Sparkles size={15} strokeWidth={2.5} />
              {!hasEnough && !nothingToTranslate ? (
                <span>Không đủ ⚡</span>
              ) : (
                <>
                  <span>Dịch {selectedUnprocessedCount > 0 ? selectedUnprocessedCount : selectedPages.size}</span>
                  {totalCost > 0 && (
                    <span className="flex items-center gap-0.5 bg-black/15 px-1.5 py-0.5 rounded-full text-[11px] font-black">
                      ⚡{totalCost}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })()}

        {/* NÚT EXPORT VÀ DROPDOWN POPOVER */}

        <div className="relative">
          <button
            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-primary hover:bg-primary-hover active:scale-95 text-white rounded-xl shadow-lg shadow-primary/20 transition-all"
          >
            <Download size={16} strokeWidth={2.5} />
            {t('sidebar.downloadDropdown')}
          </button>

          {/* DROPDOWN MENU TẢI XUỐNG (Thả xuống dưới) */}
          <div
            className={`absolute top-[calc(100%+12px)] right-0 w-72 bg-panel border border-border shadow-2xl rounded-2xl p-1.5 transition-all origin-top-right duration-200 ease-out z-[101]
              ${isExportMenuOpen ? 'opacity-100 scale-100 pointer-events-auto translate-y-0' : 'opacity-0 scale-95 pointer-events-none -translate-y-2'}
            `}
          >
            <div className="px-3 pt-2.5 pb-2 mb-1 border-b border-border">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                {t('sidebar.exportFormat')}
              </span>
            </div>

            <button onClick={() => handleExportBatch('psd')} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-main hover:bg-background/80 rounded-xl transition-colors text-left group">
              <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                <Layers size={18} className="text-blue-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold">File PSD (Photoshop)</span>
                <span className="text-[11px] text-text-muted font-medium">{t('sidebar.layeredTrans')}</span>
              </div>
            </button>

            <button onClick={() => handleExportBatch('clean')} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-main hover:bg-background/80 rounded-xl transition-colors text-left group">
              <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                <ImageIcon size={18} className="text-emerald-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold">{t('sidebar.transJpg')}</span>
                <span className="text-[11px] text-text-muted font-medium">Ảnh đã xóa nền và ghép chữ</span>
              </div>
            </button>

            <button onClick={() => handleExportBatch('raw')} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-main hover:bg-background/80 rounded-xl transition-colors text-left group">
              <div className="p-2 bg-border/40 rounded-lg group-hover:bg-border/60 transition-colors">
                <FileImage size={18} className="text-text-muted" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold">Ảnh Gốc (RAW)</span>
                <span className="text-[11px] text-text-muted font-medium">Bản scan chưa qua xử lý</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}