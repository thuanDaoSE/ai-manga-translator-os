import { CheckCircle2, Clock, Image as ImageIcon, Loader2, Upload, GripVertical } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useEffect, useState } from 'react';
import { mangaApi } from '../../services/api';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// COMPONENT CON: Thẻ bài kéo thả
function SortableItem({ id, file, isActive, status, displayImg, onClick }: any) {
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
        className={`w-full text-left rounded-xl flex items-center gap-2 p-2 transition-colors border group ${
          isDragging ? 'opacity-50 shadow-2xl scale-105 border-primary bg-primary/20 cursor-grabbing' : 
          isActive ? 'bg-primary/10 border-primary/40 shadow-lg' : 'bg-panel/40 border-transparent hover:border-border hover:bg-panel/60 cursor-grab'
        }`}
      >
        <GripVertical size={14} className="text-text-muted opacity-50 group-hover:opacity-100 shrink-0" />

        <div className="relative w-12 h-16 shrink-0 rounded-md overflow-hidden border border-border bg-black/40">
          {displayImg ? (
            <img src={displayImg} className={`w-full h-full object-cover ${status === 'processing' ? 'blur-[2px] opacity-50 scale-110' : ''}`} alt="thumb" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800"><Loader2 className="animate-spin text-gray-600" size={14} /></div>
          )}
          {status === 'processing' && <div className="absolute inset-0 flex items-center justify-center bg-primary/20"><Loader2 className="animate-spin text-white" size={16} /></div>}
          {status === 'translated' && <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5"><CheckCircle2 size={8} className="text-white" /></div>}
        </div>

        <div className="flex flex-col gap-1 overflow-hidden">
          <span className={`text-[11px] font-bold truncate ${isActive ? 'text-primary' : 'text-text-main'}`}>{file.name}</span>
          {status === 'unprocessed' && <span className="flex items-center gap-1 text-[9px] text-text-muted font-bold uppercase"><Clock size={10} /> Đợi dịch</span>}
          {status === 'processing' && <span className="flex items-center gap-1 text-[9px] text-amber-400 font-black uppercase animate-pulse">Đang quét AI...</span>}
          {status === 'translated' && <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-black uppercase">Hoàn tất</span>}
        </div>
      </button>
    </div>
  );
}

// COMPONENT CHÍNH: Bảng điều khiển Sidebar
export default function Sidebar() {
  const { fileQueue, currentIndex, setCurrentIndex, pageStatuses, processedUrls, setFiles, reorderFiles } = useProjectStore();
  const [previews, setPreviews] = useState<Record<number, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      // 🚀 TÌM VỊ TRÍ THEO TÊN FILE THAY VÌ SỐ THỨ TỰ (Chống lỗi animation)
      const oldIndex = fileQueue.findIndex(f => f.name === active.id);
      const newIndex = fileQueue.findIndex(f => f.name === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderFiles(oldIndex, newIndex);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name));
      setFiles(files);
      files.forEach(file => mangaApi.uploadRaw(file));
    }
  };

  useEffect(() => {
    const newPreviews: Record<number, string> = {};
    fileQueue.forEach((file, index) => newPreviews[index] = URL.createObjectURL(file));
    setPreviews(newPreviews);
    return () => Object.values(newPreviews).forEach(url => URL.revokeObjectURL(url));
  }, [fileQueue]);

  if (fileQueue.length === 0) return null;

  // 🚀 DÙNG TÊN FILE LÀM ID CHO DANH SÁCH DND-KIT
  const itemIds = fileQueue.map(file => file.name);

  return (
    <div className="w-64 bg-sidebar border-r border-border flex flex-col h-full shadow-2xl z-20 shrink-0 select-none">
      <div className="p-4 border-b border-border bg-panel/50 backdrop-blur-md flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-text-main flex items-center gap-2 uppercase tracking-tight">
            <ImageIcon size={18} className="text-primary" /> Dự án Manga
          </h2>
          <p className="text-[10px] text-text-muted mt-1 font-medium">{fileQueue.length} TRANG</p>
        </div>
        <label className="p-2 bg-border/40 hover:bg-border text-text-muted hover:text-text-main rounded-md cursor-pointer transition-colors">
          <Upload size={16} />
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {fileQueue.map((file, index) => (
                <SortableItem
                  key={file.name} // 🚀 Khóa duy nhất
                  id={file.name}  // 🚀 ID Duy nhất
                  file={file}
                  isActive={index === currentIndex}
                  status={pageStatuses[index] || 'unprocessed'}
                  displayImg={processedUrls[index] || previews[index]}
                  onClick={() => setCurrentIndex(index)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}