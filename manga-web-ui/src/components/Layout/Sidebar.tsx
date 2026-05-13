import { CheckCircle2, Clock, Image as ImageIcon, Loader2, Upload, GripVertical, Wand2, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useEffect, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import { useConfigStore } from '../../store/useConfigStore';


const API_URL = `${import.meta.env.VITE_API_URL}/api`;
// COMPONENT CON: Thẻ bài kéo thả
function SortableItem({ id, file, isActive, status, displayImg, progress, onClick, onTranslate }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <button
        onClick={onClick}
        className={`w-full text-left rounded-xl flex items-center gap-2 p-2 transition-colors border group relative ${
          isDragging ? 'opacity-50 shadow-2xl scale-105 border-primary bg-primary/20 cursor-grabbing' : 
          isActive ? 'bg-primary/10 border-primary/40 shadow-lg' : 
          status === 'error' ? 'bg-danger/5 border-danger/30 hover:bg-danger/10' : // 🚀 Trạng thái lỗi nền đỏ nhạt
          'bg-panel/40 border-transparent hover:border-border hover:bg-panel/60 cursor-grab'
        }`}
      >
        <GripVertical size={14} className="text-text-muted opacity-50 group-hover:opacity-100 shrink-0" />

        <div className="relative w-12 h-16 shrink-0 rounded-md overflow-hidden border border-border bg-black/40">
          {displayImg ? (
            <img src={displayImg} className={`w-full h-full object-cover ${(status === 'processing' || status === 'error') ? 'blur-[2px] opacity-50 scale-110' : ''}`} alt="thumb" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800"><Loader2 className="animate-spin text-gray-600" size={14} /></div>
          )}
          
          {status === 'processing' && <div className="absolute inset-0 flex items-center justify-center bg-primary/20"><Loader2 className="animate-spin text-white" size={16} /></div>}
          {status === 'translated' && <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5"><CheckCircle2 size={8} className="text-white" /></div>}
          
          {/* 🚀 Icon cảnh báo nếu lỗi */}
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
          
          {status === 'translated' && <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-black uppercase">Hoàn tất</span>}
          
          {/* 🚀 Thông báo lỗi bằng chữ */}
          {status === 'error' && <span className="flex items-center gap-1 text-[9px] text-danger font-black uppercase"><AlertTriangle size={10} /> Dịch thất bại</span>}
        </div>

        {/* Nút Hover Dịch / Thử lại */}
        {(status === 'unprocessed' || status === 'error') && (
          <div 
            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onTranslate(); }}
          >
            <div className={`text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1 shadow-lg font-bold cursor-pointer ${status === 'error' ? 'bg-danger hover:bg-red-600' : 'bg-primary hover:bg-primary-hover'}`}>
              {status === 'error' ? <RefreshCw size={12} /> : <Wand2 size={12} />} 
              {status === 'error' ? 'Thử lại' : 'Dịch'}
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

export default function Sidebar() {
  const projectStore = useProjectStore();
  const { fileQueue, currentIndex, setCurrentIndex, pageStatuses, processedUrls, uploadProjectFiles, reorderFiles, progresses } = projectStore;
  const { saveBubblesForPage, loadBubblesForPage } = useCanvasStore();
  const [previews, setPreviews] = useState<Record<number, string>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Tính toán Tiến trình tổng (Global Progress)
  const totalPages = fileQueue.length;
  const completedPages = fileQueue.filter((_, i) => pageStatuses[i] === 'translated').length;
  const errorPages = fileQueue.filter((_, i) => pageStatuses[i] === 'error').length;
  const processingPages = fileQueue.filter((_, i) => pageStatuses[i] === 'processing').length;
  const progressPercent = totalPages === 0 ? 0 : ((completedPages + errorPages) / totalPages) * 100;

  const processSinglePage = async (pageIndex: number) => {
    const pageId = projectStore.pageIds[pageIndex];
    if (!pageId) return;

    projectStore.setPageStatus(pageIndex, "processing");

    try {
      // 🚀 LẤY CẤU HÌNH TỪ POPUP VÀ GỬI XUỐNG BACKEND
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

        eventSource.onmessage = async (event) => {
          const sseData = JSON.parse(event.data);
          if (sseData.state === "SUCCESS") {
            eventSource.close();
            const taskRes = await fetch(`${API_URL}/task/${taskId}`);
            const taskData = await taskRes.json();

            if (taskData.result) {
              const result = taskData.result;
              projectStore.setProcessedUrl(pageIndex, result.clean_url);

              const toolState = useToolStore.getState();
              const newBubbles = result.data.map((item: any) => ({
                id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                x: item.box_coordinates.x1,
                y: item.box_coordinates.y1,
                w: item.box_coordinates.x2 - item.box_coordinates.x1,
                h: item.box_coordinates.y2 - item.box_coordinates.y1,
                text: item.vietnamese,
                fontSize: toolState.fontSize,
                fontColor: toolState.fontColor,
                fontFamily: toolState.fontFamily,
                rotation: 0,
                sfxClass: "",
              }));

              if (pageIndex === useProjectStore.getState().currentIndex) {
                const canvasStore = useCanvasStore.getState();
                canvasStore.clearBubbles();
                newBubbles.forEach((b: any) => canvasStore.addBubble(b));
              } else {
                useCanvasStore.getState().setBubblesForSpecificPage(pageIndex, newBubbles);
              }

              await fetch(`${API_URL}/pages/${pageId}/save-results?clean_url=${encodeURIComponent(result.clean_url)}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.data),
              });
            }
            setTimeout(() => projectStore.clearProgress(pageIndex), 1000);
          } else if (sseData.state === "FAILURE") {
            eventSource.close();
            projectStore.clearProgress(pageIndex);
            projectStore.setPageStatus(pageIndex, "error"); // 🚀 Bắt lỗi thông minh
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
          projectStore.clearProgress(pageIndex);
          projectStore.setPageStatus(pageIndex, "error"); // 🚀 Bắt lỗi mạng
        };
      }
    } catch (error) {
      projectStore.clearProgress(pageIndex);
      projectStore.setPageStatus(pageIndex, "error"); // 🚀 Bắt lỗi API sập
    }
  };

  const handleTranslateAll = () => {
    if (fileQueue.length === 0) return;
    for (let i = 0; i < fileQueue.length; i++) {
      // 🚀 Chỉ quét các trang chưa xử lý hoặc đã bị lỗi để dịch lại
      if (projectStore.pageStatuses[i] === 'unprocessed' || projectStore.pageStatuses[i] === 'error') {
        processSinglePage(i);
      }
    }
  };

  const handlePageClick = (index: number) => {
    if (currentIndex === index) return;
    if (currentIndex !== -1) saveBubblesForPage(currentIndex);
    setCurrentIndex(index);
    loadBubblesForPage(index);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fileQueue.findIndex(f => f.name === active.id);
      const newIndex = fileQueue.findIndex(f => f.name === over.id);
      if (oldIndex !== -1 && newIndex !== -1) reorderFiles(oldIndex, newIndex);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name));
      uploadProjectFiles(files);
    }
  };

  useEffect(() => {
    const newPreviews: Record<number, string> = {};
    fileQueue.forEach((file, index) => newPreviews[index] = URL.createObjectURL(file));
    setPreviews(newPreviews);
    return () => Object.values(newPreviews).forEach(url => URL.revokeObjectURL(url));
  }, [fileQueue]);

  if (fileQueue.length === 0) return null;

  const itemIds = fileQueue.map(file => file.name);
  const hasUnprocessed = fileQueue.some((_, i) => pageStatuses[i] === 'unprocessed' || pageStatuses[i] === 'error');

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
          <label className="p-2 bg-border/40 hover:bg-border text-text-muted hover:text-text-main rounded-md cursor-pointer transition-colors">
            <Upload size={16} />
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
        </div>

        {/* 🚀 THANH TIẾN TRÌNH TỔNG (GLOBAL PROGRESS) */}
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
              {fileQueue.map((file, index) => (
                <SortableItem
                  key={file.name} 
                  id={file.name}  
                  file={file}
                  isActive={index === currentIndex}
                  status={pageStatuses[index] || 'unprocessed'}
                  displayImg={processedUrls[index] || previews[index]}
                  progress={progresses[index]}
                  onClick={() => handlePageClick(index)}
                  onTranslate={() => processSinglePage(index)} 
                />
              ))}
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
    </div>
  );
}