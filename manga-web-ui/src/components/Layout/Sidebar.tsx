import { useProjectStore } from '../../store/useProjectStore';
import { useEffect, useRef, useState, useCallback } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreVertical, Trash2, Wand2, RefreshCw, XCircle, CheckCircle2, Clock, Image as ImageIcon, Loader2, Lock, Upload, GripVertical, Sparkles, AlertTriangle, PanelLeftClose, X, Square, Check, Layers, FileImage, Download, Package, ChevronDown, Undo2, Search, Settings2, Globe, Plus, Zap, Gift } from 'lucide-react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import { useConfigStore, VALID_LANGUAGES } from '../../store/useConfigStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useServerStatusStore } from '../../store/useServerStatusStore';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { mangaApi } from '../../services/api';

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

export function getPageGroupKey(filename: string): string {
  const match = filename.match(/^(.*)_part_\d+\.[^.]+$/i);
  return match ? match[1] : filename.split('.')[0] || filename;
}

import { PageCard } from './Sidebar/PageCard';
import { QuotaWidget } from './Sidebar/QuotaWidget';
import { UploadCard } from './Sidebar/UploadCard';
import { BatchActionBar } from './Sidebar/BatchActionBar';


// ==========================================
// 2. COMPONENT CHÍNH: SIDEBAR
// ==========================================
export default function Sidebar() {
  const projectStore = useProjectStore();
  const { fileQueue, currentIndex, setCurrentIndex, pageStatuses, processedUrls, uploadProjectFiles, reorderFiles, progresses, retryCounts } = projectStore;
  const isProcessing = useToolStore((state) => state.isProcessing);
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const systemQuota = useAuthStore((state) => state.systemQuota);
  const hasQuota = (systemQuota?.remaining_pages ?? 300) > 0;
  const currentCredits = user?.isPro ? 999999 : (user?.credits !== undefined ? user.credits : 999999);
  const useGpu = useConfigStore((state) => state.useGpu);
  const checkFirstTimeConfig = () => {
    return true;
  };

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
    if (imageFiles.length > 500) {
      toast.error("Hệ thống hỗ trợ tải lên tối đa 500 trang cho mỗi phiên làm việc!");
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
      const token = useAuthStore.getState().session?.access_token || "";
      // 🚀 Truyền danh sách ID đã chọn lên API (Backend có thể đọc query này để lọc file)
      const selectedIdsParam = Array.from(selectedPages).join(',');
      const url = `${import.meta.env.VITE_API_URL}/api/projects/${projectStore.projectId}/export-batch?export_type=${type}&page_ids=${selectedIdsParam}`;

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

      toast.success("Tải file thành công!", { id: loadingToast });
      clearSelection(); // Reset UI sau khi tải xong
    } catch (error: any) {
      toast.error(`Tải thất bại: ${error.message}`, { id: loadingToast });
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
    if (!hasQuota) {
      toast.error("Hệ thống đã đạt giới hạn 300 trang miễn phí. Vui lòng chờ admin reset!");
      return Promise.resolve();
    }
    return new Promise<void>(async (resolve) => {
      const pageId = projectStore.pageIds[pageIndex];
      if (!pageId) {
        resolve();
        return;
      }

      projectStore.setPageStatus(pageIndex, "processing");

      try {
        const configStore = useConfigStore.getState();
        const serverStatus = useServerStatusStore.getState().serverStatus;
 
        const data = await mangaApi.translatePageById(pageId, {
          genre: configStore.genre,
          tone: configStore.tone,
          pronouns: configStore.pronoun,
          glossary: configStore.glossary,
          targetLanguage: configStore.targetLanguage || "Tiếng Việt",
          sourceLanguage: configStore.sourceLanguage || "auto",
          useGpu: configStore.useGpu,
          client_saw_hot: serverStatus === 'HOT'
        });

        if (data.task_id) {
          const taskId = data.task_id;
          let isDone = false;

          const finishSuccess = async (taskData: any) => {
            if (isDone) return;
            isDone = true;
            try {
              if (activeTasksRef.current[pageIndex]?.eventSource) {
                activeTasksRef.current[pageIndex].eventSource.close();
              }
            } catch (e) {}
            delete activeTasksRef.current[pageIndex];

            if (taskData && taskData.result) {
              const result = taskData.result;
              let cleanBaseUrl = (result.clean_url || '').split('?')[0];
              if (cleanBaseUrl.includes('/workspace/')) {
                cleanBaseUrl = '/workspace/' + cleanBaseUrl.split('/workspace/')[1];
              }
              const fullCleanUrl = `${cleanBaseUrl}?t=${Date.now()}`;
              projectStore.setProcessedUrl(pageIndex, fullCleanUrl);
              projectStore.setOriginalCleanUrl(pageIndex, cleanBaseUrl);

              const toolState = useToolStore.getState();

              let bubblesData = result.data || [];

              // 🚀 BẢN VÁ QUAN TRỌNG: Nếu OCR chỉ có chữ gốc (chưa có bản dịch Tiếng Việt),
              // tự động kích hoạt dịch thuật DeepSeek ngay lập tức!
              const hasJapanese = bubblesData.some((item: any) => (item.japanese || item.text) && (item.japanese || item.text).trim() !== "");
              const isMissingVietnamese = bubblesData.every((item: any) => !item.vietnamese || item.vietnamese.trim() === "");

              if (hasJapanese && isMissingVietnamese) {
                useProjectStore.setState((state: any) => ({
                  progresses: {
                    ...state.progresses,
                    [pageIndex]: { percent: 85, message: "Đang dịch sang Tiếng Việt bằng DeepSeek AI..." }
                  }
                }));

                try {
                  const transRes = await mangaApi.retryTextTranslation(pageId);
                  if (transRes && transRes.bubbles && transRes.bubbles.length > 0) {
                    bubblesData = transRes.bubbles;
                  }
                } catch (transErr) {
                  console.warn("Auto text translation error, using raw bubbles:", transErr);
                }
              }

              const newBubbles = bubblesData.map((item: any) => {
                let x = item.x;
                let y = item.y;
                let w = item.w;
                let h = item.h;

                if ((x === undefined || y === undefined || w === undefined || h === undefined) && item.box_coordinates) {
                  x = item.box_coordinates.x1;
                  y = item.box_coordinates.y1;
                  w = item.box_coordinates.x2 - item.box_coordinates.x1;
                  h = item.box_coordinates.y2 - item.box_coordinates.y1;
                } else if ((x === undefined || y === undefined || w === undefined || h === undefined) && item.rawBox) {
                  x = item.rawBox.x1;
                  y = item.rawBox.y1;
                  w = item.rawBox.x2 - item.rawBox.x1;
                  h = item.rawBox.y2 - item.rawBox.y1;
                }

                x = x !== undefined ? x : 0;
                y = y !== undefined ? y : 0;
                w = w !== undefined ? w : 100;
                h = h !== undefined ? h : 50;

                const viText = item.vietnamese || item.text || item.japanese || "";

                return {
                  id: item.id ? String(item.id) : (Date.now().toString() + Math.random().toString(36).substring(2, 9)),
                  x,
                  y,
                  w,
                  h,
                  text: viText,
                  japanese: item.japanese || "",
                  vietnamese: item.vietnamese || item.text || "",
                  fontSize: item.fontSize || toolState.fontSize || 20,
                  fontColor: item.fontColor || toolState.fontColor || "#000000",
                  fontFamily: item.fontFamily || toolState.fontFamily || "Playpen Sans",
                  rotation: item.rotation !== undefined ? item.rotation : 0,
                  sfxClass: item.sfxClass || "",
                  rawBox: item.box_coordinates || item.rawBox,
                  boxX: item.boxX !== undefined ? item.boxX : x,
                  boxY: item.boxY !== undefined ? item.boxY : y,
                  boxW: item.boxW !== undefined ? item.boxW : w,
                  boxH: item.boxH !== undefined ? item.boxH : h,
                };
              });

              if (pageIndex === useProjectStore.getState().currentIndex) {
                const canvasStore = useCanvasStore.getState();
                canvasStore.setBubbles(newBubbles);
              } else {
                mangaApi.savePageBubbles(pageId, newBubbles).catch(console.error);
              }

              projectStore.setPageStatus(pageIndex, "completed");

              await mangaApi.savePageResults(pageId, result.clean_url, newBubbles)
                .catch(err => console.error("Lỗi lưu kết quả vào DB:", err));

              setTimeout(() => projectStore.clearProgress(pageIndex), 1000);
              useAuthStore.getState().fetchProfile();
            }
            resolve();
          };

          const finishFailure = (msg?: string) => {
            if (isDone) return;
            isDone = true;
            try {
              if (activeTasksRef.current[pageIndex]?.eventSource) {
                activeTasksRef.current[pageIndex].eventSource.close();
              }
            } catch (e) {}
            delete activeTasksRef.current[pageIndex];
            projectStore.clearProgress(pageIndex);
            projectStore.setPageStatus(pageIndex, "error");
            if (msg) toast.error(msg);
            useAuthStore.getState().fetchProfile();
            resolve();
          };

          // Robust polling fallback
          let pollTimer: any = null;
          const startPolling = () => {
            if (pollTimer || isDone) return;
            let attempts = 0;
            const maxAttempts = 120;
            pollTimer = setInterval(async () => {
              if (isDone) {
                clearInterval(pollTimer);
                return;
              }
              attempts++;
              try {
                const res = await fetch(`${API_URL}/task/${taskId}`);
                if (res.ok) {
                  const tData = await res.json();
                  if (tData.progress !== undefined) {
                    useProjectStore.setState((state: any) => ({
                      progresses: {
                        ...state.progresses,
                        [pageIndex]: { percent: tData.progress, message: tData.message || "Đang xử lý..." }
                      }
                    }));
                  }
                  if (tData.state === "SUCCESS" || tData.status === "SUCCESS") {
                    clearInterval(pollTimer);
                    await finishSuccess(tData);
                    return;
                  } else if (tData.state === "FAILURE" || tData.status === "FAILURE") {
                    clearInterval(pollTimer);
                    finishFailure(tData.message || "Lỗi xử lý dịch thuật!");
                    return;
                  }
                }
              } catch (err) {
                console.warn("Polling error:", err);
              }
              if (attempts >= maxAttempts) {
                clearInterval(pollTimer);
                finishFailure(`Quá thời gian chờ xử lý trang ${pageIndex + 1}!`);
              }
            }, 1000);
          };

          // Thử kết nối SSE trước, nếu lỗi thì tự động fallback qua polling
          try {
            const eventSource = new EventSource(`${API_URL}/stream/${taskId}`);
            activeTasksRef.current[pageIndex] = { taskId, eventSource };

            eventSource.onmessage = async (event) => {
              if (isDone) return;
              try {
                const sseData = JSON.parse(event.data);
                useProjectStore.setState((state: any) => ({
                  progresses: {
                    ...state.progresses,
                    [pageIndex]: { percent: sseData.progress, message: sseData.message }
                  }
                }));

                if (sseData.state === "SUCCESS" || sseData.status === "SUCCESS") {
                  eventSource.close();
                  if (sseData.result) {
                    await finishSuccess(sseData);
                  } else {
                    const taskRes = await fetch(`${API_URL}/task/${taskId}`);
                    const taskData = await taskRes.json();
                    await finishSuccess(taskData);
                  }
                } else if (sseData.state === "FAILURE" || sseData.status === "FAILURE") {
                  eventSource.close();
                  finishFailure(sseData.message);
                }
              } catch (e) {
                console.warn("SSE parse error:", e);
              }
            };

            eventSource.onerror = () => {
              // Khi gặp lỗi SSE (ví dụ ERR_QUIC_PROTOCOL_ERROR qua proxy), chuyển sang polling an toàn
              console.warn(`[SSE notice] Stream dropped for task ${taskId}, switching to polling fallback.`);
              try { eventSource.close(); } catch (e) {}
              startPolling();
            };
          } catch (sseErr) {
            console.warn("EventSource init failed, starting polling:", sseErr);
            startPolling();
          }
        } else {
          resolve();
        }
      } catch (error: any) {
        console.error(`[Sidebar] Lỗi dịch trang ${pageIndex}:`, error);
        toast.error(`Lỗi dịch trang ${pageIndex + 1}: ${error?.message || "Lỗi không xác định"}`);
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
    if (!checkFirstTimeConfig()) return;
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
            fontFamily: b.fontFamily || toolState.fontFamily || "Playpen Sans",
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
        const hasTranslationError = updatedBubbles.some((b: any) => {
          const txt = (b.text || "").toLowerCase().trim();
          return txt.startsWith("[lỗi") || txt.includes("[lỗi dịch") || txt.startsWith("[error");
        });
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

  const handleDeletePage = async (index: number) => {
    const state = useProjectStore.getState();
    const file = state.fileQueue[index];
    if (!file) return;

    if (state.pageStatuses[index] === 'processing' || state.pageStatuses[index] === 'waiting') {
      handleCancelTask(index);
    }

    // ⚡ Xóa trang tức thì 0ms, không chờ đếm ngược xác nhận
    await state.removePage(index);
  };

  // 🚀 FIX: TÌM ẢNH BẰNG UNIQUE ID MỚI TRÁNH CRASH KHI KÉO THẢ
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeKey = active.id as string;
    const overKey = over.id as string;

    const activeGroup = groupedMap.get(activeKey);
    const overGroup = groupedMap.get(overKey);
    if (!activeGroup || !overGroup) return;

    const activeIndices = activeGroup.pages.map(p => p.index);
    const overIndices = overGroup.pages.map(p => p.index);

    const allIndices = Array.from({ length: fileQueue.length }, (_, i) => i);
    const remainingIndices = allIndices.filter(i => !activeIndices.includes(i));
    
    const overStartIdx = remainingIndices.indexOf(overIndices[0]);
    const activeWasBefore = activeIndices[0] < overIndices[0];
    const insertPos = activeWasBefore ? overStartIdx + overIndices.length : overStartIdx;

    remainingIndices.splice(insertPos, 0, ...activeIndices);

    // Update the Zustand store using setState
    useProjectStore.setState((state) => {
      const tempArr = state.fileQueue.map((f, i) => ({
        file: f, url: state.processedUrls[i], status: state.pageStatuses[i],
        progress: state.progresses[i], pageId: state.pageIds[i], retryCount: state.retryCounts[i],
        past: state.pastUrls[i], future: state.futureUrls[i]
      }));

      const reorderedTemp = remainingIndices.map(oldIdx => tempArr[oldIdx]);

      const newQueue = reorderedTemp.map(item => item.file);
      const newProcessed: Record<number, string> = {};
      const newStatuses: Record<number, any> = {};
      const newProgresses: Record<number, any> = {};
      const newPageIds: Record<number, string> = {};
      const newRetryCounts: Record<number, number> = {};
      const newPast: Record<number, string[]> = {};
      const newFuture: Record<number, string[]> = {};

      reorderedTemp.forEach((item, i) => {
        if (item.url) newProcessed[i] = item.url;
        if (item.status) newStatuses[i] = item.status;
        if (item.progress) newProgresses[i] = item.progress;
        if (item.pageId) newPageIds[i] = item.pageId;
        if (item.retryCount !== undefined) newRetryCounts[i] = item.retryCount;
        if (item.past) newPast[i] = item.past;
        if (item.future) newFuture[i] = item.future;
      });

      let newCurrentIndex = state.currentIndex;
      const oldActiveFile = state.fileQueue[state.currentIndex];
      const oldActiveUniqueId = oldActiveFile
        ? (state.pageIds[state.currentIndex] || `temp-${state.currentIndex}-${oldActiveFile.name}`)
        : null;

      if (oldActiveUniqueId) {
        const foundIdx = reorderedTemp.findIndex((item, i) => {
          const uid = item.pageId || `temp-${remainingIndices[i]}-${item.file.name}`;
          return uid === oldActiveUniqueId;
        });
        if (foundIdx !== -1) {
          newCurrentIndex = foundIdx;
        }
      }

      return {
        fileQueue: newQueue,
        processedUrls: newProcessed,
        pageStatuses: newStatuses,
        progresses: newProgresses,
        pageIds: newPageIds,
        retryCounts: newRetryCounts,
        pastUrls: newPast,
        futureUrls: newFuture,
        currentIndex: newCurrentIndex
      };
    });
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
    setPreviews(prev => {
      const newPreviews = { ...prev };
      let changed = false;

      fileQueue.forEach((file, index) => {
        if (projectStore.processedUrls[index]) {
          if (newPreviews[index] !== projectStore.processedUrls[index]) {
            if (newPreviews[index] && newPreviews[index].startsWith('blob:')) {
              URL.revokeObjectURL(newPreviews[index]);
            }
            newPreviews[index] = projectStore.processedUrls[index];
            changed = true;
          }
        }
        else if (file.size === 0) {
          const pageId = projectStore.pageIds[index];
          const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
          const serverUrl = `${import.meta.env.VITE_API_URL || ''}/workspace/${projectStore.projectId}/raw/${pageId}.${ext}`;
          if (newPreviews[index] !== serverUrl) {
            newPreviews[index] = serverUrl;
            changed = true;
          }
        }
        else {
          if (!newPreviews[index] || !newPreviews[index].startsWith('blob:')) {
            newPreviews[index] = URL.createObjectURL(file);
            changed = true;
          }
        }
      });

      // Clean up deleted items from previews
      Object.keys(newPreviews).forEach(key => {
        const idx = parseInt(key, 10);
        if (idx >= fileQueue.length) {
          if (newPreviews[idx] && newPreviews[idx].startsWith('blob:')) {
            URL.revokeObjectURL(newPreviews[idx]);
          }
          delete newPreviews[idx];
          changed = true;
        }
      });

      return changed ? newPreviews : prev;
    });
  }, [fileQueue, projectStore.processedUrls, projectStore.pageIds, projectStore.projectId]);

  // ── GROUPING DEFINITIONS ──
  interface GroupedItem {
    key: string;
    displayName: string;
    pages: {
      file: File;
      index: number;
      uniqueId: string;
    }[];
  }

  const groupedItems: GroupedItem[] = [];
  const groupedMap = new Map<string, GroupedItem>();

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

  allProjectFiles.forEach(({ file, index, uniqueId }) => {
    const key = getPageGroupKey(file.name);
    if (!groupedMap.has(key)) {
      const ext = file.name.split('.').pop() || '';
      const displayName = key.includes('.') ? key : `${key}.${ext}`;
      const newItem: GroupedItem = { key, displayName, pages: [] };
      groupedItems.push(newItem);
      groupedMap.set(key, newItem);
    }
    groupedMap.get(key)!.pages.push({ file, index, uniqueId });
  });

  const visibleGroups = groupedItems.filter(group => {
    if (!searchQuery.trim()) return true;
    return group.displayName.toLowerCase().includes(searchQuery.trim().toLowerCase());
  });

  const itemIds = visibleGroups.map(g => g.key);

  const totalPages = allProjectFiles.length;
  const completedPages = allProjectFiles.filter(({ index }) => pageStatuses[index] === 'completed').length;
  const errorPages = allProjectFiles.filter(({ index }) => pageStatuses[index] === 'error').length;
  const processingPages = allProjectFiles.filter(({ index }) => pageStatuses[index] === 'processing').length;
  const waitingPages = allProjectFiles.filter(({ index }) => pageStatuses[index] === 'waiting').length;
  const uploadingPages = allProjectFiles.filter(({ index }) => pageStatuses[index] === 'uploading').length;
  const unprocessedPages = allProjectFiles.filter(({ index }) => pageStatuses[index] === 'unprocessed' || pageStatuses[index] === 'cleaned' || pageStatuses[index] === 'translating').length;
  const progressPercent = totalPages === 0 ? 0 : ((completedPages + errorPages) / totalPages) * 100;
  const hasUnprocessed = allProjectFiles.some(({ index }) => pageStatuses[index] === 'unprocessed' || pageStatuses[index] === 'cleaned' || pageStatuses[index] === 'translating' || pageStatuses[index] === 'error');
  const isAnyProcessingOrWaiting = allProjectFiles.some(({ index }) => pageStatuses[index] === 'processing' || pageStatuses[index] === 'waiting');
  const isAnyUploading = allProjectFiles.some(({ index }) => pageStatuses[index] === 'uploading');

  const visibleFiles = visibleGroups.flatMap(g => g.pages);

  const isAllVisibleSelected = visibleGroups.length > 0 && visibleGroups.every(g => g.pages.every(p => selectedPages.has(p.uniqueId)));
  const isSomeVisibleSelected = visibleGroups.some(g => g.pages.some(p => selectedPages.has(p.uniqueId))) && !isAllVisibleSelected;

  const handleTranslateAll = async () => {
    if (!checkFirstTimeConfig()) return;
    if (visibleFiles.length === 0) return;
    if (!hasQuota) {
      toast.error("Hệ thống đã đạt giới hạn 300 trang miễn phí. Vui lòng chờ admin reset!");
      return;
    }

    // Lọc ra các trang cần dịch
    const pendingIndexes = visibleFiles
      .map(f => f.index)
      .filter(index => projectStore.pageStatuses[index] === 'unprocessed' || projectStore.pageStatuses[index] === 'cleaned' || projectStore.pageStatuses[index] === 'translating' || projectStore.pageStatuses[index] === 'error');

    if (pendingIndexes.length === 0) return;

    // Đánh dấu tất cả trang chờ là "Đang chờ..."
    pendingIndexes.forEach(index => {
      projectStore.setPageStatus(index, "waiting");
    });

    // Chạy với giới hạn đồng thời tối đa là 4 trang để tận dụng tối ưu GPU Tensor Cores & VRAM
    const limit = 4;
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

  const handleCancelAll = async () => {
    let count = 0;
    const allIndices = allProjectFiles.map(f => f.index);
    for (const idx of allIndices) {
      const status = useProjectStore.getState().pageStatuses[idx];
      if (status === 'waiting' || status === 'processing') {
        count++;
        projectStore.clearProgress(idx);
        projectStore.setPageStatus(idx, "unprocessed");
        const task = activeTasksRef.current[idx];
        if (task) {
          try {
            task.eventSource.close();
            mangaApi.cancelTask(task.taskId).catch(console.error);
          } catch (e) {}
          delete activeTasksRef.current[idx];
        }
      }
    }
    if (count > 0) {
      toast.success(`Đã dừng toàn bộ tiến trình dịch (${count} trang)!`);
    }
  };

  const handleTranslateSelected = async () => {
    if (!checkFirstTimeConfig()) return;
    if (selectedPages.size === 0) return;

    // Lấy danh sách index của các trang đã chọn và chưa dịch / lỗi
    const selectedIndexes = visibleFiles
      .filter(({ uniqueId, index }) =>
        selectedPages.has(uniqueId) &&
        (pageStatuses[index] === 'unprocessed' || pageStatuses[index] === 'cleaned' || pageStatuses[index] === 'translating' || pageStatuses[index] === 'error')
      )
      .map(f => f.index);

    if (selectedIndexes.length === 0) return;

    if (!hasQuota) {
      toast.error("Hệ thống đã đạt giới hạn 300 trang miễn phí. Vui lòng chờ admin reset!");
      return;
    }

    // Đánh dấu chờ
    selectedIndexes.forEach(index => projectStore.setPageStatus(index, 'waiting'));
    clearSelection();

    const limit = 4;
    let nextIdx = 0;
    const runNext = async () => {
      if (nextIdx >= selectedIndexes.length) return;
      const index = selectedIndexes[nextIdx++];
      if (useProjectStore.getState().pageStatuses[index] !== 'waiting') { runNext(); return; }
      try { await processSinglePage(index); } catch (err) { console.error('Lỗi dịch selected:', index, err); } finally { runNext(); }
    };
    for (let i = 0; i < Math.min(limit, selectedIndexes.length); i++) { runNext(); }
  };

  const handleCancelSelected = () => {
    let count = 0;
    visibleFiles.forEach(({ uniqueId, index }) => {
      if (selectedPages.has(uniqueId)) {
        const status = useProjectStore.getState().pageStatuses[index];
        if (status === 'waiting' || status === 'processing') {
          count++;
          projectStore.clearProgress(index);
          projectStore.setPageStatus(index, "unprocessed");
          const task = activeTasksRef.current[index];
          if (task) {
            try {
              task.eventSource.close();
              mangaApi.cancelTask(task.taskId).catch(console.error);
            } catch (e) {}
            delete activeTasksRef.current[index];
          }
        }
      }
    });
    if (count > 0) {
      toast.success(`Đã dừng dịch ${count} trang đã chọn!`);
    }
  };

  const handleTranslateGroup = async (group: GroupedItem) => {
    if (!checkFirstTimeConfig()) return;
    const pendingIndexes = group.pages
      .map(p => p.index)
      .filter(idx => pageStatuses[idx] === 'unprocessed' || pageStatuses[idx] === 'cleaned' || pageStatuses[idx] === 'translating' || pageStatuses[idx] === 'error');
    
    if (pendingIndexes.length === 0) return;

    if (!hasQuota) {
      toast.error("Hệ thống đã đạt giới hạn 300 trang miễn phí. Vui lòng chờ admin reset!");
      return;
    }

    pendingIndexes.forEach(idx => projectStore.setPageStatus(idx, 'waiting'));

    const limit = 4;
    let nextIdx = 0;
    const runNext = async () => {
      if (nextIdx >= pendingIndexes.length) return;
      const idx = pendingIndexes[nextIdx++];
      if (useProjectStore.getState().pageStatuses[idx] !== 'waiting') { runNext(); return; }
      try { await processSinglePage(idx); } catch (err) { console.error('Lỗi dịch group:', idx, err); } finally { runNext(); }
    };
    for (let i = 0; i < Math.min(limit, pendingIndexes.length); i++) { runNext(); }
  };

  const handleDeleteGroup = async (group: GroupedItem) => {
    if (group.pages.length === 1) {
      handleDeletePage(group.pages[0].index);
      return;
    }
    
    if (!window.confirm(`Bạn có chắc chắn muốn xóa Webtoon "${group.displayName}"?`)) return;
    
    const state = useProjectStore.getState();
    const pagesToRemove = [...group.pages].sort((a, b) => b.index - a.index);
    
    const activePageInGroup = group.pages.find(p => p.index === state.currentIndex);
    if (activePageInGroup) {
      const nextIndex = state.fileQueue.findIndex((f, i) => {
        const isPart = group.pages.some(p => p.index === i);
        return !isPart;
      });
      projectStore.setCurrentIndex(nextIndex);
    }
    
    for (const p of pagesToRemove) {
      const idx = useProjectStore.getState().fileQueue.findIndex((f, i) => {
        const pageId = state.pageIds[i];
        const uniqueId = pageId || `temp-${i}-${f.name}`;
        return uniqueId === p.uniqueId;
      });
      if (idx !== -1) {
        if (state.pageStatuses[idx] === 'processing') {
          handleCancelTask(idx);
        }
        await state.removePage(idx, true);
      }
    }
    
    toast.success(`Đã xóa Webtoon "${group.displayName}"`);
  };

  const handleCancelGroup = (group: GroupedItem) => {
    group.pages.forEach(p => {
      const status = pageStatuses[p.index];
      if (status === 'processing' || status === 'waiting') {
        handleCancelTask(p.index);
      }
    });
  };

  const handleRetryGroup = (group: GroupedItem) => {
    group.pages.forEach(p => {
      const status = pageStatuses[p.index];
      if (status === 'error' || status === 'completed') {
        handleRetrySinglePage(p.index);
      }
    });
  };

  const toggleGroupSelection = (group: GroupedItem) => {
    const allSelected = group.pages.every(p => selectedPages.has(p.uniqueId));
    setSelectedPages(prev => {
      const next = new Set(prev);
      group.pages.forEach(p => {
        if (allSelected) {
          next.delete(p.uniqueId);
        } else {
          next.add(p.uniqueId);
        }
      });
      return next;
    });
  };

  if (fileQueue.length === 0) return null;

  return (
    <>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="bg-sidebar border-r border-border flex flex-col h-full shadow-2xl z-20 shrink-0 select-none relative"
        style={{ width: `${sidebarWidth}px` }} // 🚀 Bổ sung chiều rộng động
      >
        {/* DRAG OVER OVERLAY */}
        {isDragOver && (
          <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm border-2 border-dashed border-primary z-50 flex flex-col items-center justify-center pointer-events-none transition-all duration-200">
            <Upload className="text-primary animate-bounce mb-2" size={32} />
            <span className="text-sm font-bold text-primary">Thả ảnh tại đây để tải lên</span>
          </div>
        )}

        {/* 🚀 DRAG HANDLE - CỘT MỐC TÀNG HÌNH Ở MÉP PHẢI ĐỂ KÉO */}
        <div
          className="absolute top-0 -right-1.5 w-3 h-full cursor-col-resize z-50 group flex items-center justify-center"
          onMouseDown={startResizing}
        >
          <div className="w-0.5 h-12 bg-transparent group-hover:bg-primary transition-colors rounded-full" />
        </div>

        {/* ── ZONE 1: SLIM HEADER ─────────────────────────── */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2 min-h-[44px]">
          {isSearchOpen ? (
            <div className="flex-1 flex items-center gap-2 relative">
              <Search size={14} className="text-text-muted/50 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm trang..."
                className="flex-1 bg-transparent border-none text-text-main placeholder-text-muted/40 text-xs focus:outline-none font-medium pr-6"
              />
              <button
                onClick={() => {
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }}
                className="absolute right-0 text-text-muted/40 hover:text-text-muted transition-colors cursor-pointer"
                title="Đóng tìm kiếm"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 overflow-hidden">
                <div className="w-1.5 h-4 rounded-full bg-primary/60 shrink-0" />
                <span className="text-[11px] font-extrabold text-text-muted uppercase tracking-wider truncate">
                  DANH SÁCH TRANG ({totalPages}/30)
                </span>
              </div>

              <div className="flex items-center gap-0.5">
                {/* NÚT TÌM KIẾM (ICON KÍNH LÚP) */}
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="p-1.5 text-text-muted hover:bg-border/45 hover:text-primary rounded-lg transition-colors cursor-pointer"
                  title="Tìm kiếm trang"
                >
                  <Search size={15} />
                </button>

                {/* NÚT TẠO DỰ ÁN MỚI */}
                <button
                  onClick={() => {
                    if (window.confirm("Bạn có muốn tạo Dự án mới không? Dự án hiện tại vẫn được lưu trữ và có thể mở lại.")) {
                      useProjectStore.getState().clearProject();
                      toast.success("Đã mở không gian làm việc mới! Hãy tải ảnh lên để bắt đầu.");
                    }
                  }}
                  className="p-1.5 text-text-muted hover:bg-border/45 hover:text-primary rounded-lg transition-colors cursor-pointer"
                  title="Tạo dự án mới"
                >
                  <Plus size={15} />
                </button>

                {/* NÚT ĐÓNG THANH BÊN */}
                <button
                  onClick={() => useToolStore.getState().toggleLeftPanel()}
                  className="p-1.5 text-text-muted hover:bg-border/45 hover:text-danger rounded-lg transition-colors cursor-pointer"
                  title="Đóng thanh bên trái"
                >
                  <PanelLeftClose size={15} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* 🎁 HẠN MỨC 300 TRANG MIỄN PHÍ */}
        <QuotaWidget systemQuota={systemQuota} />

        {/* ── ZONE 2: UPLOAD WIDGET & PROGRESS ── */}
        <UploadCard progressPercent={progressPercent} onFilesSelected={uploadProjectFiles} />

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
              onClick={async () => {
                if (!window.confirm(`Xóa ${selectedPages.size} trang đã chọn?`)) return;
                
                const state = useProjectStore.getState();
                const uids = Array.from(selectedPages);
                
                // Get all indexes to remove
                const indexesToRemove = uids
                  .map(uid => {
                    return state.fileQueue.findIndex((f, i) => {
                      const pageId = state.pageIds[i];
                      return (pageId || `temp-${i}-${f.name}`) === uid;
                    });
                  })
                  .filter(idx => idx !== -1)
                  .sort((a, b) => b - a); // Sort descending

                // Determine if active page is being deleted
                const isActiveDeleted = indexesToRemove.includes(state.currentIndex);
                if (isActiveDeleted) {
                  const nextIndex = state.fileQueue.findIndex((f, i) => !indexesToRemove.includes(i));
                  projectStore.setCurrentIndex(nextIndex);
                }

                // Batch delete directly
                for (const idx of indexesToRemove) {
                  if (state.pageStatuses[idx] === 'processing') {
                    handleCancelTask(idx);
                  }
                  await state.removePage(idx, true);
                }
                
                clearSelection();
                toast.success(`Đã xóa thành công ${uids.length} trang`);
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
                {visibleGroups.map((group) => {
                  const firstPage = group.pages[0];
                  const isGroupActive = group.pages.some(p => p.index === currentIndex);
                  
                  let overallStatus = 'unprocessed';
                  const statuses = group.pages.map(p => pageStatuses[p.index] || 'unprocessed');
                  
                  if (statuses.some(s => s === 'processing')) {
                    overallStatus = 'processing';
                  } else if (statuses.some(s => s === 'uploading')) {
                    overallStatus = 'uploading';
                  } else if (statuses.some(s => s === 'waiting')) {
                    overallStatus = 'waiting';
                  } else if (statuses.some(s => s === 'error')) {
                    overallStatus = 'error';
                  } else if (statuses.every(s => s === 'completed')) {
                    overallStatus = 'completed';
                  } else if (statuses.some(s => s === 'translating')) {
                    overallStatus = 'translating';
                  } else {
                    overallStatus = statuses[0];
                  }
                  
                  const firstIndex = firstPage.index;
                  const displayImg = processedUrls[firstIndex] || previews[firstIndex];
                  
                  const totalInGroup = group.pages.length;
                  const completedInGroup = group.pages.filter(p => pageStatuses[p.index] === 'completed').length;
                  
                  let groupProgressMessage = undefined;
                  if (totalInGroup > 1) {
                    groupProgressMessage = {
                      percent: Math.round((completedInGroup / totalInGroup) * 100),
                      message: "Đang xử lý dịch thuật..."
                    };
                  } else {
                    groupProgressMessage = progresses[firstIndex];
                  }

                  const isSelected = group.pages.every(p => selectedPages.has(p.uniqueId));
                  const isProcessingGroup = group.pages.some(p => p.index === currentIndex && isProcessing);

                  return (
                    <PageCard
                      key={group.key}
                      id={group.key}
                      file={firstPage.file}
                      displayName={group.displayName}
                      pagesCount={totalInGroup}
                      isActive={isGroupActive}
                      status={overallStatus as any}
                      displayImg={displayImg}
                      progress={groupProgressMessage}
                      onClick={() => handlePageClick(firstPage.index)}
                      onTranslate={() => handleTranslateGroup(group)}
                      onDelete={() => handleDeleteGroup(group)}
                      onCancel={() => handleCancelGroup(group)}
                      onRetry={() => handleRetryGroup(group)}
                      isSelected={isSelected}
                      isSelectionMode={isSelectionMode}
                      onToggleSelection={() => toggleGroupSelection(group)}
                      hasCleanUrl={group.pages.some(p => !!processedUrls[p.index])}
                      isProcessing={isProcessingGroup}
                      disabled={isAnyProcessingOrWaiting}
                      retryCount={Math.max(...group.pages.map(p => retryCounts[p.index] || 0))}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* NÚT DỊCH TẤT CẢ (Ẩn đi khi đang chọn ảnh) */}
        <div className={`absolute bottom-0 left-0 w-full p-3 bg-sidebar/95 backdrop-blur-md border-t border-border z-30 transition-transform duration-300 ${isSelectionMode ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
          {isAnyProcessingOrWaiting ? (
            <button
              onClick={handleCancelAll}
              className="w-full relative flex items-center justify-center gap-2 py-2.5 text-sm transition-all shadow-lg rounded-xl font-bold bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 hover:text-rose-300 active:scale-95 cursor-pointer shadow-rose-950/20"
              title="Nhấp để dừng toàn bộ tiến trình dịch hàng loạt"
            >
              <Square size={14} fill="currentColor" className="text-rose-400" />
              <span>Dừng dịch hàng loạt ({processingPages + waitingPages} trang)</span>
            </button>
          ) : isAnyUploading ? (
            <button
              disabled
              className="w-full relative flex items-center justify-center gap-2 py-2.5 text-sm transition-all shadow-md rounded-xl font-bold bg-blue-500/15 border border-blue-500/30 text-blue-400 cursor-wait select-none"
            >
              <Loader2 size={16} className="animate-spin text-blue-400" />
              <span>Đang tải ảnh lên ({uploadingPages} trang)...</span>
            </button>
          ) : (
            <button
              onClick={handleTranslateAll}
              disabled={!hasUnprocessed}
              className={`w-full relative flex items-center justify-center gap-2 py-2.5 text-sm transition-all shadow-lg rounded-xl font-bold
                ${hasUnprocessed
                  ? 'bg-primary hover:bg-primary-hover text-white shadow-lg shadow-indigo-500/20 hover:scale-[1.02] cursor-pointer'
                  : 'bg-panel text-text-muted cursor-not-allowed border border-border/50 font-medium'
                }`}
            >
              {errorPages > 0 ? (
                <RefreshCw size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              <span>
                {errorPages > 0
                  ? t('sidebar.retryError', { count: errorPages })
                  : hasUnprocessed
                    ? t('sidebar.batchTranslate', 'Dịch Tất Cả (Batch)')
                    : t('sidebar.completedAll')}
              </span>
            </button>
          )}
        </div>
      </div>

      <BatchActionBar
        isSelectionMode={isSelectionMode}
        selectedCount={selectedPages.size}
        onClearSelection={clearSelection}
        selectedProcessingCount={visibleFiles.filter(({ uniqueId, index }) =>
          selectedPages.has(uniqueId) &&
          (pageStatuses[index] === 'processing' || pageStatuses[index] === 'waiting')
        ).length}
        onCancelSelected={handleCancelSelected}
        selectedUnprocessedCount={visibleFiles.filter(({ uniqueId, index }) =>
          selectedPages.has(uniqueId) &&
          (pageStatuses[index] === 'unprocessed' || pageStatuses[index] === 'cleaned' || pageStatuses[index] === 'translating' || pageStatuses[index] === 'error')
        ).length}
        hasQuota={hasQuota}
        isAnyProcessingOrWaiting={isAnyProcessingOrWaiting}
        onTranslateSelected={handleTranslateSelected}
        isExportMenuOpen={isExportMenuOpen}
        onToggleExportMenu={() => setIsExportMenuOpen(!isExportMenuOpen)}
        onExportBatch={handleExportBatch}
        t={t}
      />
    </>
  );
}