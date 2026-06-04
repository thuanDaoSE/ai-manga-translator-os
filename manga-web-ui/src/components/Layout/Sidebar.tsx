import { useProjectStore } from '../../store/useProjectStore';
import { useEffect, useRef, useState, useCallback } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreVertical, Trash2, Wand2, RefreshCw, XCircle, CheckCircle2, Clock, Image as ImageIcon, Loader2, Upload, GripVertical, Sparkles, AlertTriangle, PanelLeftClose, X, Square, Check, Layers, FileImage, Download, Package } from 'lucide-react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import { useConfigStore } from '../../store/useConfigStore';

import toast from 'react-hot-toast';
import { mangaApi } from '../../services/api';

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

// ==========================================
// 1. COMPONENT CON: THẺ TRANG TRUYỆN
// ==========================================
function SortableItem({
  id, file, isActive, status, displayImg, progress,
  onClick, onTranslate, onDelete, onCancel, onRetry,
  isSelected, isSelectionMode, onToggleSelection, hasCleanUrl // 🚀 PROPS MỚI CHO MULTI-SELECT
}: any) {

  // 🚀 Vô hiệu hóa Kéo-Thả nếu đang ở Chế độ Chọn (Selection Mode)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id,
    disabled: isSelectionMode
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...(!isSelectionMode ? listeners : {})}>
      <div
        onClick={(e) => {
          // 🚀 Nếu đang ở chế độ chọn, click vào thẻ sẽ là Tick chọn thay vì Đổi ảnh
          if (isSelectionMode) {
            e.stopPropagation();
            onToggleSelection();
          } else {
            onClick(e);
          }
        }}
        className={`w-full text-left rounded-xl flex items-center gap-2 p-2 transition-colors border group relative ${isSelectionMode ? 'cursor-pointer' : 'cursor-grab'} ${isDragging ? 'opacity-50 shadow-2xl scale-105 border-primary bg-primary/20' :
          isSelected ? 'bg-primary/15 border-primary/50 shadow-md ring-1 ring-primary/50' :
            isActive ? 'bg-primary/10 border-primary/40 shadow-lg' :
              status === 'error' ? 'bg-danger/5 border-danger/30 hover:bg-danger/10' :
                'bg-panel/40 border-transparent hover:border-border hover:bg-panel/60'
          }`}
      >
        {/* ICON KÉO THẢ (Ẩn đi khi đang ở chế độ chọn) */}
        {!isSelectionMode && (
          <GripVertical size={14} className="text-text-muted opacity-50 group-hover:opacity-100 shrink-0" />
        )}

        {/* 🚀 CHECKBOX TÀNG HÌNH (Two-Step Hover) */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggleSelection(); }}
          className={`absolute left-2 z-20 w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer shadow-sm border ${isSelected
            ? 'bg-primary border-primary text-white opacity-100 scale-100'
            : 'bg-background/90 border-border text-transparent hover:border-primary opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
            } ${isSelectionMode && !isSelected ? 'opacity-100' : ''}`} // Ép hiện nếu đang trong Selection Mode
        >
          <Check size={14} strokeWidth={3} className={isSelected ? 'opacity-100' : 'opacity-0'} />
        </div>

        <div className={`relative w-12 h-16 shrink-0 rounded-md overflow-hidden border border-border bg-black/40 transition-transform ${isSelectionMode && !isSelected ? 'ml-6' : isSelected ? 'ml-6' : ''}`}>
          {displayImg ? (
            <img src={displayImg} className={`w-full h-full object-cover ${(status === 'processing' || status === 'error') ? 'blur-[2px] opacity-50 scale-110' : ''}`} alt="thumb" crossOrigin="anonymous" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800"><Loader2 className="animate-spin text-gray-600" size={14} /></div>
          )}

          {status === 'processing' && <div className="absolute inset-0 flex items-center justify-center bg-primary/20"><Loader2 className="animate-spin text-white" size={16} /></div>}
          {status === 'completed' && <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5"><CheckCircle2 size={8} className="text-white" /></div>}

          {/* 🚀 Phân biệt Lỗi Runpod và Lỗi DeepSeek */}
          {status === 'error' && (
            <span className="flex items-center gap-1 text-[9px] text-danger font-black uppercase">
              <AlertTriangle size={10} /> {hasCleanUrl ? 'Lỗi API Chữ' : 'Dịch thất bại'}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1 overflow-hidden w-full">
          <span className={`text-[11px] font-bold truncate ${isActive || isSelected ? 'text-primary' : status === 'error' ? 'text-danger' : 'text-text-main'}`}>{file.name}</span>

          {status === 'unprocessed' && <span className="flex items-center gap-1 text-[9px] text-text-muted font-bold uppercase"><Clock size={10} /> Đợi dịch</span>}

          {status === 'processing' && (
            <div className="flex flex-col gap-1 mt-0.5 w-full">
              <span className="flex items-center gap-1 text-[9px] text-amber-400 font-black uppercase truncate">
                {progress ? `${Math.round(progress.percent)}% - ${progress.message}` : "Đang tải AI..."}
              </span>
              <div className="w-full bg-background/50 rounded-full h-1 border border-border overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress ? progress.percent : 0}%` }}
                ></div>
              </div>
            </div>
          )}

          {status === 'completed' && <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-black uppercase">Hoàn tất</span>}

          {status === 'error' && <span className="flex items-center gap-1 text-[9px] text-danger font-black uppercase"><AlertTriangle size={10} /> Dịch thất bại</span>}
        </div>

        {/* Các nút công cụ ẨN TRONG QUÁ TRÌNH SELECT MODE để tránh click nhầm */}
        {!isSelectionMode && (
          <>
            <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 p-1.5 rounded-lg border border-border shadow-lg z-10 backdrop-blur-sm">
              {/* Nút 1: Dịch lại chữ (DeepSeek) */}
              <button onClick={(e) => { e.stopPropagation(); onRetry(); }} className="p-1.5 text-text-muted hover:text-primary hover:bg-border rounded-md transition-all cursor-pointer hover:scale-110" title="Dịch lại chữ (Tiết kiệm)">
                <RefreshCw size={15} className={status === 'processing' ? 'animate-spin' : ''} />
              </button>

              <div className="w-px h-4 bg-border/80"></div>

              {/* 🚀 NÚT 2 MỚI: QUÉT LẠI TOÀN BỘ ẢNH (RUNPOD) */}
              <button onClick={(e) => { e.stopPropagation(); onTranslate(); }} className="p-1.5 text-text-muted hover:text-amber-500 hover:bg-amber-500/20 rounded-md transition-all cursor-pointer hover:scale-110" title="Quét lại ảnh từ đầu (Chạy lại Runpod)">
                <Wand2 size={15} />
              </button>

              <div className="w-px h-4 bg-border/80"></div>

              {/* Nút 3: Xóa */}
              <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/20 rounded-md transition-all cursor-pointer hover:scale-110" title="Xóa trang này">
                <X size={15} />
              </button>
            </div>

            {(status === 'unprocessed' || status === 'error') && (
              <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity z-10" onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  // 🚀 LOGIC CỨU HỘ: Nếu có nền sạch rồi -> Chỉ dịch lại chữ. Nếu chưa -> Dịch từ đầu
                  if (status === 'error' && hasCleanUrl) {
                    onRetry();
                  } else {
                    onTranslate();
                  }
                }}>
                <div className={`text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 shadow-lg font-bold cursor-pointer ${status === 'error' ? 'bg-danger hover:bg-red-600' : 'bg-primary hover:bg-primary-hover'}`}>
                  {status === 'error' ? <RefreshCw size={12} /> : <Wand2 size={12} />}
                  {status === 'error' ? (hasCleanUrl ? 'Dịch lại chữ' : 'Thử lại') : 'Dịch'}
                </div>
              </div>
            )}

            {status === 'processing' && (
              <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity z-10" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onCancel(); }}>
                <div className="text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 shadow-lg font-bold cursor-pointer bg-danger hover:bg-red-700">
                  <Square size={10} className="fill-current" /> Dừng
                </div>
              </div>
            )}
          </>
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
  const { fileQueue, currentIndex, setCurrentIndex, pageStatuses, processedUrls, uploadProjectFiles, reorderFiles, progresses } = projectStore;

  const [previews, setPreviews] = useState<Record<number, string>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeTasksRef = useRef<Record<number, { taskId: string, eventSource: EventSource }>>({});
  const deleteTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const importMangaRef = useRef<HTMLInputElement>(null);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // 🚀 STATE MỚI CHO MULTI-SELECT & FAB BAR
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const isSelectionMode = selectedPages.size > 0;


  const [sidebarWidth, setSidebarWidth] = useState(256); // Mặc định 256px
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
        await fetch(`${API_URL}/tasks/${task.taskId}/cancel`, { method: "POST" });
        toast.success(`Đã hủy dịch trang ${fileQueue[pageIndex]?.name}`);
      } catch (err) {
        console.error("Lỗi hủy task:", err);
      }
      delete activeTasksRef.current[pageIndex];
    }
    projectStore.clearProgress(pageIndex);
    projectStore.setPageStatus(pageIndex, "unprocessed");
  };

  const processSinglePage = async (pageIndex: number) => {
    const pageId = projectStore.pageIds[pageIndex];
    if (!pageId) return;

    projectStore.setPageStatus(pageIndex, "processing");

    try {
      const configStore = useConfigStore.getState();

      const res = await fetch(`${API_URL}/pages/${pageId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genre: configStore.genre,
          tone: configStore.tone,
          pronouns: configStore.pronoun,
          glossary: configStore.glossary
        })
      });
      const data = await res.json();

      if (data.task_id) {
        const taskId = data.task_id;

        // ❌ ĐÃ XÓA DÒNG: projectStore.startListeningProgress(...) để tránh mở 2 kết nối đá nhau

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
              progresses: { ...state.progresses, [pageIndex]: { percent: 90, message: "Đang nhờ DeepSeek dịch..." } }
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
              await new Promise(resolve => setTimeout(resolve, 1000));
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
                canvasStore.clearBubbles();
                newBubbles.forEach((b: any) => canvasStore.addBubble(b));
              } else {
                mangaApi.savePageBubbles(pageId, newBubbles).catch(console.error);
              }

              // 🚀 LƯU Ý MŨI TIÊM THÔNG MINH TRƯỚC ĐÓ CỦA SẾP (Kiểm tra chữ Lỗi)
              const hasTranslationError = newBubbles.some((b: any) => (b.text || "").toLowerCase().includes("lỗi"));

              if (hasTranslationError) {
                projectStore.setPageStatus(pageIndex, "error"); // Đánh thẻ Đỏ
                toast.error(`Trang ${pageIndex + 1} bị nghẽn mạng DeepSeek!`);
              } else {
                projectStore.setPageStatus(pageIndex, "completed"); // Xanh tuyệt đối!
              }

              await fetch(`${API_URL}/pages/${pageId}/save-results?clean_url=${encodeURIComponent(result.clean_url)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newBubbles),
              }).catch(err => console.error("Lỗi lưu kết quả vào DB:", err));

              // 🚀 CHỈ KHI CHỮ ĐÃ ĐƯỢC VẼ LÊN HÌNH THÌ MỚI XÓA THANH TIẾN TRÌNH
              setTimeout(() => projectStore.clearProgress(pageIndex), 1000);
            }
          } else if (sseData.state === "FAILURE") {
            eventSource.close();
            delete activeTasksRef.current[pageIndex];
            projectStore.clearProgress(pageIndex);
            projectStore.setPageStatus(pageIndex, "error");
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          delete activeTasksRef.current[pageIndex];
          projectStore.clearProgress(pageIndex);
          projectStore.setPageStatus(pageIndex, "error");
        };
      }
    } catch (error) {
      projectStore.clearProgress(pageIndex);
      projectStore.setPageStatus(pageIndex, "error");
    }
  };

  // 🚀 BẢN VÁ TỐI THƯỢNG: Phân luồng Dịch lại cực kỳ thông minh
  // 🚀 BẢN VÁ TỐI THƯỢNG: Phân luồng Dịch lại cực kỳ thông minh và Chống Race Condition
  const handleRetrySinglePage = async (pageIndex: number) => {
    const state = useProjectStore.getState();
    const pageId = state.pageIds[pageIndex];
    if (!pageId) return;

    // 1. Kiểm tra xem trang này đã qua bàn tay Runpod (có ảnh xóa nền) chưa?
    const hasCleanUrl = !!state.processedUrls[pageIndex];

    if (hasCleanUrl) {
      // 🟢 LUỒNG 1: CÓ ẢNH SẠCH RỒI -> TUYỆT ĐỐI CHỈ GỌI DEEPSEEK
      const loadId = toast.loading("Đang nhờ DeepSeek dịch lại...");
      try {
        const result = await mangaApi.retryTextTranslation(pageId);

        // 🚀 FIX 1: Map lại dữ liệu để đảm bảo chữ Việt được dán đúng vào trường 'text' của Fabric.js
        const updatedBubbles = result.bubbles.map((b: any) => ({
          ...b,
          text: b.vietnamese || b.text
        }));

        const realTimeIndex = useProjectStore.getState().currentIndex;

        if (realTimeIndex === pageIndex) {
          // 🚀 FIX 2: Dùng clearBubbles và addBubble để vẽ lại chữ an toàn tuyệt đối (Không bị crash trắng trang)
          const canvasStore = useCanvasStore.getState();
          canvasStore.clearBubbles();
          updatedBubbles.forEach((b: any) => canvasStore.addBubble(b));
        } else {
          // 🚀 FIX 3 (RACE CONDITION): Nếu sếp đã chuyển sang trang khác, ÉP HỆ THỐNG LƯU KẾT QUẢ MỚI VÀO DB!
          // Đề phòng trường hợp Auto-save của trang cũ vừa ghi đè nhầm.
          mangaApi.savePageBubbles(pageId, updatedBubbles).catch(console.error);
        }

        toast.success("Dịch lại thành công!", { id: loadId });

        // Cập nhật thẻ Xanh/Đỏ
        const hasTranslationError = updatedBubbles.some((b: any) => (b.text || "").toLowerCase().includes("lỗi"));
        if (hasTranslationError) {
          useProjectStore.getState().setPageStatus(pageIndex, "error");
        } else {
          useProjectStore.getState().setPageStatus(pageIndex, "completed");
        }
      } catch (err: any) {
        toast.error(err.message, { id: loadId });
        useProjectStore.getState().setPageStatus(pageIndex, "error");
      }
    } else {
      // 🔴 LUỒNG 2: CHƯA CÓ ẢNH SẠCH -> Buộc phải gọi Runpod cày lại từ đầu
      processSinglePage(pageIndex);
    }
  };

  const handleDeletePage = (index: number) => {
    const file = fileQueue[index];
    const fileName = file.name;

    if (deleteTimeoutsRef.current[fileName]) return;

    if (index === projectStore.currentIndex) {
      const nextIndex = fileQueue.findIndex((f, i) => i !== index && !pendingDeletes.has(f.name));
      projectStore.setCurrentIndex(nextIndex !== -1 ? nextIndex : -1);
    }

    setPendingDeletes(prev => new Set(prev).add(fileName));

    toast((t) => (
      <div className="flex items-center gap-3">
        <span className="text-sm">Đang xóa <b>{fileName}</b>...</span>
        <button
          onClick={() => {
            clearTimeout(deleteTimeoutsRef.current[fileName]);
            delete deleteTimeoutsRef.current[fileName];

            setPendingDeletes(prev => {
              const next = new Set(prev);
              next.delete(fileName);
              return next;
            });

            toast.dismiss(t.id);
            toast.success("Đã hoàn tác! Giữ lại trang.");
          }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
        >
          ↩️ Hoàn tác
        </button>
      </div>
    ), { duration: 5000, id: `delete-${fileName}`, icon: '⏳' });

    deleteTimeoutsRef.current[fileName] = setTimeout(async () => {
      const state = useProjectStore.getState();
      const realIndex = state.fileQueue.findIndex(f => f.name === fileName);

      if (realIndex !== -1) {
        if (state.pageStatuses[realIndex] === 'processing') {
          handleCancelTask(realIndex);
        }
        await state.removePage(realIndex);
      }
      delete deleteTimeoutsRef.current[fileName];

      setPendingDeletes(prev => {
        const next = new Set(prev);
        next.delete(fileName);
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

    // 🚀 BẢN VÁ TỐI THƯỢNG: CHẶN ĐỨNG RACE CONDITION
    if (currentPageId) {
      const currentBubbles = useCanvasStore.getState().bubbles;

      // BÍ QUYẾT: Chỉ Auto-save khi trên màn hình THỰC SỰ CÓ CHỮ.
      // Tuyệt đối không bao giờ lưu mảng rỗng. Điều này chặn đứng 100% việc
      // mạng chưa tải xong (canvas đang rỗng) mà sếp lỡ chuyển trang khiến
      // hệ thống mang mảng rỗng đi xóa sạch Database của sếp.
      if (currentBubbles && currentBubbles.length > 0) {
        mangaApi.savePageBubbles(currentPageId, currentBubbles).catch(console.error);
      }
    }

    // Đồng bộ Canvas với Server trước khi chuyển
    const targetPageId = projectStore.pageIds[index];
    if (currentPageId !== targetPageId) {
      projectStore.setCurrentIndex(index);
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

  // 🚀 FIX: TẠO ID DUY NHẤT AN TOÀN KỂ CẢ KHI ẢNH ĐANG UPLOAD
  const visibleFiles = fileQueue
    .map((file, index) => {
      const pageId = projectStore.pageIds[index];
      return {
        file,
        index,
        // Nếu đã có ID từ Server thì dùng, chưa có thì tự sinh ID tạm thời
        uniqueId: pageId || `temp-${index}-${file.name}`
      };
    })
    .filter(({ file }) => !pendingDeletes.has(file.name));

  const itemIds = visibleFiles.map(f => f.uniqueId);

  const totalPages = visibleFiles.length;
  const completedPages = visibleFiles.filter(({ index }) => pageStatuses[index] === 'completed').length;
  const errorPages = visibleFiles.filter(({ index }) => pageStatuses[index] === 'error').length;
  const processingPages = visibleFiles.filter(({ index }) => pageStatuses[index] === 'processing').length;
  const progressPercent = totalPages === 0 ? 0 : ((completedPages + errorPages) / totalPages) * 100;
  const hasUnprocessed = visibleFiles.some(({ index }) => pageStatuses[index] === 'unprocessed' || pageStatuses[index] === 'error');

  const handleTranslateAll = () => {
    if (visibleFiles.length === 0) return;
    for (const { index } of visibleFiles) {
      if (projectStore.pageStatuses[index] === 'unprocessed' || projectStore.pageStatuses[index] === 'error') {
        processSinglePage(index);
      }
    }
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

        <div className="p-4 border-b border-border bg-panel/50 backdrop-blur-md flex flex-col gap-3">
          {/* ... (Đoạn Header giữ nguyên) ... */}

          {/* HEADER */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-text-main flex items-center gap-2 uppercase tracking-tight">
                <ImageIcon size={18} className="text-primary" /> Dự án Manga
              </h2>
              <p className="text-[10px] text-text-muted mt-1 font-medium">{totalPages} TRANG TẤT CẢ</p>
            </div>

            <div className="flex gap-1.5 items-center">
              {/* Nút Phủ Chọn Tất Cả (Nhanh gọn) */}
              <button
                onClick={() => {
                  if (selectedPages.size === totalPages) {
                    clearSelection();
                  } else {
                    // 🚀 FIX: Dùng uniqueId an toàn thay vì pageIds có thể bị undefined
                    const allIds = visibleFiles.map(f => f.uniqueId);
                    setSelectedPages(new Set(allIds));
                  }
                }}
                className={`p-2 rounded-md cursor-pointer transition-colors ${isSelectionMode && selectedPages.size === totalPages ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'bg-border/40 hover:bg-border text-text-muted hover:text-text-main'}`}
                title="Chọn tất cả"
              >
                <Check size={16} />
              </button>

              <label className="p-2 bg-border/40 hover:bg-border text-text-muted hover:text-text-main rounded-md cursor-pointer transition-colors" title="Tải trang truyện lên">
                <Upload size={16} />
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/jpeg, image/png, image/webp,.manga"
                  onClick={(e) => {
                    (e.target as HTMLInputElement).value = ''; // 🚀 FIX: Reset đường dẫn để có thể up lại cùng 1 file
                  }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0) return;
                    if (files.length > 20) {
                      toast.error("Để đảm bảo tốc độ, chỉ hỗ trợ tải lên tối đa 20 trang mỗi lần!");
                      e.target.value = '';
                      return;
                    }
                    uploadProjectFiles(files.sort((a, b) => a.name.localeCompare(b.name)));
                    e.target.value = ''; // 🚀 FIX: Dọn dẹp sau khi up xong
                  }}
                />
              </label>

              <button
                onClick={() => useToolStore.getState().toggleLeftPanel()}
                className="p-2 bg-border/40 hover:bg-border text-text-muted hover:text-danger rounded-md cursor-pointer transition-colors"
                title="Đóng bảng này"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
          </div>

          {/* THANH TIẾN ĐỘ TỔNG QUAN */}
          <div className="w-full bg-background/50 rounded-lg p-2 border border-border">
            <div className="flex justify-between items-end mb-1">
              <span className="text-[10px] font-bold text-text-muted uppercase">Tiến độ chung</span>
              <span className="text-[10px] font-bold text-primary">{completedPages}/{totalPages}</span>
            </div>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden flex">
              <div className="bg-primary h-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
            </div>
            {(processingPages > 0 || errorPages > 0) && (
              <div className="flex justify-between mt-1.5 text-[9px] font-bold">
                {processingPages > 0 ? <span className="text-amber-400">Đang chạy: {processingPages}</span> : <span></span>}
                {errorPages > 0 && <span className="text-danger">Lỗi: {errorPages}</span>}
              </div>
            )}
          </div>
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
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* NÚT DỊCH TẤT CẢ (Ẩn đi khi đang chọn ảnh) */}
        <div className={`absolute bottom-0 left-0 w-full p-3 bg-sidebar/95 backdrop-blur-md border-t border-border z-10 transition-transform duration-300 ${isSelectionMode ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
          <button
            onClick={handleTranslateAll}
            disabled={!hasUnprocessed}
            className={`w-full justify-center py-2.5 text-sm transition-all shadow-lg ${hasUnprocessed
              ? 'btn-primary shadow-primary/20 hover:scale-[1.02]'
              : 'bg-panel text-text-muted cursor-not-allowed border border-border/50 rounded-md font-medium flex items-center gap-2'
              }`}
          >
            {errorPages > 0 ? <RefreshCw size={16} /> : <Sparkles size={16} />}
            {errorPages > 0 ? `Dịch Lại ${errorPages} Lỗi` : hasUnprocessed ? "Dịch Tất Cả (Batch)" : "Đã dịch xong"}
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
          <span className="text-sm font-semibold text-text-main select-none">Trang đã chọn</span>
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <button
          onClick={clearSelection}
          className="p-2 rounded-xl text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          title="Hủy chọn"
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        {/* NÚT EXPORT VÀ DROPDOWN POPOVER */}
        <div className="relative">
          <button
            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-primary hover:bg-primary-hover active:scale-95 text-white rounded-xl shadow-lg shadow-primary/20 transition-all"
          >
            <Download size={16} strokeWidth={2.5} />
            Tải Xuống...
          </button>

          {/* DROPDOWN MENU TẢI XUỐNG (Thả xuống dưới) */}
          <div
            className={`absolute top-[calc(100%+12px)] right-0 w-64 bg-panel border border-border shadow-2xl rounded-2xl p-1.5 transition-all origin-top-right duration-200 ease-out z-[101]
              ${isExportMenuOpen ? 'opacity-100 scale-100 pointer-events-auto translate-y-0' : 'opacity-0 scale-95 pointer-events-none -translate-y-2'}
            `}
          >
            <div className="px-3 pt-2.5 pb-2 mb-1 border-b border-border">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                Chọn Định Dạng Xuất
              </span>
            </div>

            <button onClick={() => handleExportBatch('psd')} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-main hover:bg-background/80 rounded-xl transition-colors text-left group">
              <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                <Layers size={18} className="text-blue-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold">File PSD (Photoshop)</span>
                <span className="text-[11px] text-text-muted font-medium">Bản dịch được tách lớp Layer</span>
              </div>
            </button>

            <button onClick={() => handleExportBatch('clean')} className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-main hover:bg-background/80 rounded-xl transition-colors text-left group">
              <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                <ImageIcon size={18} className="text-emerald-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold">Ảnh Đã Dịch (JPG)</span>
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