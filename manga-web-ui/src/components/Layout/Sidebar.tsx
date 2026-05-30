import { CheckCircle2, Clock, Image as ImageIcon, Loader2, Upload, GripVertical, Wand2, Sparkles, AlertTriangle, RefreshCw, PanelLeftClose, X, Square } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useEffect, useRef, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import { useConfigStore } from '../../store/useConfigStore';

import toast from 'react-hot-toast';
import { mangaApi } from '../../services/api';

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

// ==========================================
// 1. COMPONENT CON: THẺ TRANG TRUYỆN
// ==========================================
function SortableItem({ id, file, isActive, status, displayImg, progress, onClick, onTranslate, onDelete, onCancel, onRetry }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        onClick={onClick}
        className={`w-full text-left rounded-xl flex items-center gap-2 p-2 transition-colors border group relative cursor-pointer ${
          isDragging ? 'opacity-50 shadow-2xl scale-105 border-primary bg-primary/20 cursor-grabbing' : 
          isActive ? 'bg-primary/10 border-primary/40 shadow-lg' : 
          status === 'error' ? 'bg-danger/5 border-danger/30 hover:bg-danger/10' : 
          'bg-panel/40 border-transparent hover:border-border hover:bg-panel/60'
        }`}
      >
        <GripVertical size={14} className="text-text-muted opacity-50 group-hover:opacity-100 shrink-0" />

        <div className="relative w-12 h-16 shrink-0 rounded-md overflow-hidden border border-border bg-black/40">
          {displayImg ? (
            <img src={displayImg} className={`w-full h-full object-cover ${(status === 'processing' || status === 'error') ? 'blur-[2px] opacity-50 scale-110' : ''}`} alt="thumb" crossOrigin="anonymous" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800"><Loader2 className="animate-spin text-gray-600" size={14} /></div>
          )}
          
          {status === 'processing' && <div className="absolute inset-0 flex items-center justify-center bg-primary/20"><Loader2 className="animate-spin text-white" size={16} /></div>}
          {status === 'completed' && <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5"><CheckCircle2 size={8} className="text-white" /></div>}
          
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-danger/20">
              <AlertTriangle size={18} className="text-danger drop-shadow-md" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 overflow-hidden w-full">
          <span className={`text-[11px] font-bold truncate ${isActive ? 'text-primary' : status === 'error' ? 'text-danger' : 'text-text-main'}`}>{file.name}</span>
          
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

        {/* 🚀 FIXED UX: NÚT CÔNG CỤ (DỊCH LẠI & XÓA) ĐƯỢC CHỐT Ở GÓC TRÊN CÙNG */}
        <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 p-1.5 rounded-lg border border-border shadow-lg z-10 backdrop-blur-sm">
          <button
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            className="p-1.5 text-text-muted hover:text-primary hover:bg-border rounded-md transition-all cursor-pointer hover:scale-110"
            title="Dịch lại (Tự động tối ưu chi phí)"
          >
            <RefreshCw size={15} className={status === 'processing' ? 'animate-spin' : ''} />
          </button>
          <div className="w-px h-4 bg-border/80"></div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/20 rounded-md transition-all cursor-pointer hover:scale-110"
            title="Xóa trang này"
          >
            <X size={15} />
          </button>
        </div>

        {/* 🚀 FIXED UX: NÚT DỊCH / THỬ LẠI CHÍNH ĐƯỢC CHỐT Ở GÓC DƯỚI CÙNG (bottom-2) */}
        {(status === 'unprocessed' || status === 'error') && (
          <div 
            className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onTranslate(); }}
          >
            <div className={`text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 shadow-lg font-bold cursor-pointer ${status === 'error' ? 'bg-danger hover:bg-red-600' : 'bg-primary hover:bg-primary-hover'}`}>
              {status === 'error' ? <RefreshCw size={12} /> : <Wand2 size={12} />} 
              {status === 'error' ? 'Thử lại' : 'Dịch'}
            </div>
          </div>
        )}

        {/* 🚀 FIXED UX: NÚT DỪNG TASK ĐƯỢC CHỐT Ở GÓC DƯỚI CÙNG (bottom-2) */}
        {status === 'processing' && (
          <div 
            className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
          >
            <div className="text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 shadow-lg font-bold cursor-pointer bg-danger hover:bg-red-700">
              <Square size={10} className="fill-current" /> Dừng
            </div>
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
  const { fileQueue, currentIndex, setCurrentIndex, pageStatuses, processedUrls, uploadProjectFiles, reorderFiles, progresses } = projectStore;
  
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeTasksRef = useRef<Record<number, { taskId: string, eventSource: EventSource }>>({});
  const deleteTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const importMangaRef = useRef<HTMLInputElement>(null);

  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // LOGIC IMPORT MANGA
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

  // LOGIC HỦY TASK (DỪNG DỊCH)
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

  // LOGIC XỬ LÝ 1 TRANG (DỊCH FULL)
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
        projectStore.startListeningProgress(pageIndex, taskId);
        const eventSource = new EventSource(`${API_URL}/stream/${taskId}`);
        activeTasksRef.current[pageIndex] = { taskId, eventSource };

        eventSource.onmessage = async (event) => {
          const sseData = JSON.parse(event.data);
          if (sseData.state === "SUCCESS") {
            eventSource.close();
            delete activeTasksRef.current[pageIndex];
            
            let taskData = null;
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
              
              // 🚀 THUẬT TOÁN ĐỊNH VỊ KHÔNG GIAN TÂM ĐỐI XỨNG 100%
              // 🚀 THUẬT TOÁN ĐỊNH VỊ 3.0: BAO PHỦ ĐƯỜNG CHÉO
              const newBubbles = result.data.map((item: any) => {
                // 1. Tính toán Kích thước khung gốc do AI quét
                const origW = item.box_coordinates.x2 - item.box_coordinates.x1;
                const origH = item.box_coordinates.y2 - item.box_coordinates.y1;
                
                // 2. Tìm TÂM ĐIỂM của bong bóng thoại
                const centerX = item.box_coordinates.x1 + (origW / 2);
                const centerY = item.box_coordinates.y1 + (origH / 2);

                // 3. Ép thành hình vuông (Lấy cạnh dài nhất + 20% đệm để chữ Việt có chỗ thở)
                const newSize = Math.max(origW, origH) * 1.2;

                return {
                  id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                  // 4. Lùi tọa độ X, Y lại để khối chữ vuông nằm ngay chính giữa Tâm AI
                  x: centerX - (newSize / 2),
                  y: centerY - (newSize / 2),
                  w: newSize,
                  h: newSize,
                  text: item.vietnamese,
                  fontSize: toolState.fontSize,
                  fontColor: toolState.fontColor,
                  fontFamily: toolState.fontFamily,
                  rotation: 0,
                  sfxClass: "",
                };
              });
              
              if (pageIndex === useProjectStore.getState().currentIndex) {
                const canvasStore = useCanvasStore.getState();
                canvasStore.clearBubbles();
                newBubbles.forEach((b: any) => canvasStore.addBubble(b));
              } else {
                mangaApi.savePageBubbles(pageId, newBubbles).catch(console.error);
              }

              projectStore.setPageStatus(pageIndex, "completed");
              await fetch(`${API_URL}/pages/${pageId}/save-results?clean_url=${encodeURIComponent(result.clean_url)}`, {
                method: "POST", 
                headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify(newBubbles), // 🚀 SỬA CHỖ NÀY (CŨ LÀ result.data)
              });
            }
            setTimeout(() => projectStore.clearProgress(pageIndex), 1000);
            
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

  // LOGIC SMART RETRY (Chỉ dịch lại chữ)
  const handleRetrySinglePage = async (pageIndex: number, currentStatus: string) => {
    const pageId = projectStore.pageIds[pageIndex];
    if (!pageId) return;

    if (currentStatus === 'completed' || currentStatus === 'translating' || currentStatus === 'cleaned') {
      const loadId = toast.loading("Đang gọi DeepSeek dịch lại đống chữ cũ...");
      try {
        const result = await mangaApi.retryTextTranslation(pageId);
        
        if (projectStore.currentIndex === pageIndex) {
          useCanvasStore.getState().setBubbles(result.bubbles);
        }
        
        toast.success("Đã hồi sinh đống chữ dịch lỗi thành công!", { id: loadId });
        setTimeout(() => window.location.reload(), 800);
      } catch (err: any) {
        toast.error(err.message, { id: loadId });
      }
    } else {
      processSinglePage(pageIndex); 
    }
  };

  // LOGIC XÓA (CÓ ĐẾM NGƯỢC VÀ TÀNG HÌNH)
  const handleDeletePage = (index: number) => {
    const file = fileQueue[index];
    const fileName = file.name;

    if (deleteTimeoutsRef.current[fileName]) return;

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

    deleteTimeoutsRef.current[fileName] = setTimeout(() => {
      const state = useProjectStore.getState();
      const realIndex = state.fileQueue.findIndex(f => f.name === fileName);
      
      if (realIndex !== -1) {
        if (state.pageStatuses[realIndex] === 'processing') {
          handleCancelTask(realIndex);
        }
        state.removePage(realIndex);
        toast.success(`Đã xóa vĩnh viễn trang truyện!`);
      }
      delete deleteTimeoutsRef.current[fileName];
      
      setPendingDeletes(prev => {
        const next = new Set(prev);
        next.delete(fileName);
        return next;
      });
    }, 5000);
  }

  // LOGIC KÉO THẢ (SỬ DỤNG PAGE ID LÀM ĐỊNH DANH)
  // 🚀 BẢN VÁ: SỬA LỖI TÌM KIẾM TRÊN OBJECT (RECORD) KHI KÉO THẢ
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const pageIdsObj = projectStore.pageIds as Record<number, string>;
      
      // Tìm khóa (index) dựa trên giá trị (id)
      const oldIndexStr = Object.keys(pageIdsObj).find(key => pageIdsObj[Number(key)] === active.id);
      const newIndexStr = Object.keys(pageIdsObj).find(key => pageIdsObj[Number(key)] === over.id);
      
      if (oldIndexStr !== undefined && newIndexStr !== undefined) {
        reorderFiles(Number(oldIndexStr), Number(newIndexStr));
      }
    }
  };

  const handlePageClick = (index: number) => {
    const currentPageId = projectStore.pageIds[projectStore.currentIndex];
    if (currentPageId) {
      mangaApi.savePageBubbles(currentPageId, useCanvasStore.getState().bubbles).catch(console.error);
    }
    projectStore.setCurrentIndex(index);
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
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [fileQueue, projectStore.processedUrls]);

  // LỌC CÁC FILE KHÔNG BỊ TÀNG HÌNH VÀ TÍNH TOÁN TIẾN ĐỘ
  const visibleFiles = fileQueue
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => !pendingDeletes.has(file.name));

  const itemIds = visibleFiles.map(({ index }) => projectStore.pageIds[index]);

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
    <div className="w-64 bg-sidebar border-r border-border flex flex-col h-full shadow-2xl z-20 shrink-0 select-none relative">
      <div className="p-4 border-b border-border bg-panel/50 backdrop-blur-md flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-main flex items-center gap-2 uppercase tracking-tight">
              <ImageIcon size={18} className="text-primary" /> Dự án Manga
            </h2>
            <p className="text-[10px] text-text-muted mt-1 font-medium">{totalPages} TRANG TẤT CẢ</p>
          </div>
          
          <div className="flex gap-1.5 items-center">
            <label className="p-2 bg-border/40 hover:bg-border text-text-muted hover:text-text-main rounded-md cursor-pointer transition-colors" title="Tải trang truyện lên">
              <Upload size={16} />
              <input 
                type="file" 
                multiple 
                className="hidden" 
                accept="image/jpeg, image/png, image/webp,.manga"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  if (files.length > 20) {
                     toast.error("Để đảm bảo tốc độ, chỉ hỗ trợ tải lên tối đa 20 trang mỗi lần!");
                     e.target.value = '';
                     return;
                  }
                  uploadProjectFiles(files.sort((a, b) => a.name.localeCompare(b.name)));
                }}
              />
            </label>

            <input 
              type="file" 
              accept=".manga" 
              ref={importMangaRef} 
              onChange={handleImportManga} 
              className="hidden" 
            />
            <button 
              onClick={() => importMangaRef.current?.click()}
              className="p-2 bg-border/40 hover:bg-border text-text-muted hover:text-text-main rounded-md cursor-pointer transition-colors"
              title="Khôi phục file (.manga)"
            >
              📂
            </button>

            <button 
              onClick={() => useToolStore.getState().toggleLeftPanel()} 
              className="p-2 bg-border/40 hover:bg-border text-text-muted hover:text-danger rounded-md cursor-pointer transition-colors"
              title="Đóng bảng này"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>

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

      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar pb-20">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {visibleFiles.map(({ file, index }) => {
                const uniquePageId = projectStore.pageIds[index];
                return (
                  <SortableItem
                    // 🚀 THÊM PHẦN BACKUP NÀY ĐỂ REACT KHÔNG KÊU GÀO:
                    key={uniquePageId || `page-${index}-${file.name}`} 
                    id={uniquePageId || `page-${index}`}
                    file={file}
                    isActive={index === currentIndex}
                    status={pageStatuses[index] || 'unprocessed'}
                    displayImg={processedUrls[index] || previews[index]}
                    progress={progresses[index]}
                    onClick={() => handlePageClick(index)}
                    onTranslate={() => processSinglePage(index)} 
                    onDelete={() => handleDeletePage(index)} 
                    onCancel={() => handleCancelTask(index)} 
                    onRetry={() => handleRetrySinglePage(index, pageStatuses[index] || 'unprocessed')}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="absolute bottom-0 left-0 w-full p-3 bg-sidebar/95 backdrop-blur-md border-t border-border z-10">
        <button
          onClick={handleTranslateAll}
          disabled={!hasUnprocessed}
          className={`w-full justify-center py-2.5 text-sm transition-all shadow-lg ${
            hasUnprocessed 
              ? 'btn-primary shadow-primary/20 hover:scale-[1.02]' 
              : 'bg-panel text-text-muted cursor-not-allowed border border-border/50 rounded-md font-medium flex items-center gap-2'
          }`}
        >
          {errorPages > 0 ? <RefreshCw size={16} /> : <Sparkles size={16} />}
          {errorPages > 0 ? `Dịch Lại ${errorPages} Lỗi` : hasUnprocessed ? "Dịch Tất Cả (Batch)" : "Đã dịch xong"}
        </button>
      </div>

      <div className="mt-auto p-3 m-2 bg-background/80 border border-border rounded-lg text-center shadow-inner">
        <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-md mb-3 text-left">
          <Clock size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[9px] text-amber-500/90 font-medium leading-relaxed">
            Dữ liệu tải lên được xử lý tạm thời và sẽ <strong>tự động xóa sau 24h</strong> không tương tác để bảo mật & tiết kiệm tài nguyên.
          </p>
        </div>
        <p className="text-[11px] text-text-muted font-medium mb-2">🤖 Server gồng lỗ chạy Free 100%</p>
      </div>
    </div>
  );
}