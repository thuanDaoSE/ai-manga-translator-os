import { toJpeg } from "html-to-image";
import { Undo2, Redo2, PanelLeft, PanelRight, Settings, Download, ZoomIn, ZoomOut, Eye, Save, FolderOpen, Wand2 } from "lucide-react";
import toast from 'react-hot-toast';
import { useToolStore } from "../../store/useToolStore";
import { useProjectStore } from "../../store/useProjectStore";
import { useCanvasStore } from "../../store/useCanvasStore";
import { useConfigStore } from "../../store/useConfigStore";

export default function Topbar() {
  const { showLeftPanel, showRightPanel, toggleLeftPanel, toggleRightPanel, currentZoom, setZoom, isComparing, setIsComparing } = useToolStore();
  const projectStore = useProjectStore();
  const canvasStore = useCanvasStore();
  const configStore = useConfigStore();
  const { undo, redo } = useCanvasStore.temporal.getState();

  // (Giữ lại hàm handleExport, handleSaveManga, handleLoadManga như cũ, bạn tự giữ nguyên phần logic export nhé)
  const handleExport = async () => { /* Giữ nguyên code xuất ảnh */ };
  const handleSaveManga = () => { /* Giữ nguyên code lưu project */ };
  const handleLoadManga = (e: any) => { /* Giữ nguyên code mở project */ };

  return (
    <div className="bg-panel px-4 py-2.5 flex items-center justify-between border-b border-border z-10 shadow-sm relative">
      
      {/* TRÁI: Logo và Điều hướng */}
      <div className="flex items-center gap-3">
        <button onClick={toggleLeftPanel} className={`p-1.5 rounded-md transition-colors ${!showLeftPanel ? "text-text-muted hover:bg-border" : "bg-primary/20 text-primary"}`} title="Ẩn/Hiện Sidebar">
          <PanelLeft size={18} />
        </button>
        <div className="flex items-center gap-2 select-none">
          <div className="bg-primary/20 p-1.5 rounded-lg border border-primary/30">
            <Wand2 size={16} className="text-primary" />
          </div>
          <span className="font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-text-muted">MangaAI Studio</span>
        </div>
        <button onClick={() => configStore.setModalOpen(true)} className="btn-ghost p-1.5 ml-2" title="Cài đặt Ngữ cảnh">
          <Settings size={18} />
        </button>
      </div>

      {/* GIỮA: Nút So Sánh (Né vùng làm việc) */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
        <button
          onMouseDown={() => setIsComparing(true)}
          onMouseUp={() => setIsComparing(false)}
          onMouseLeave={() => setIsComparing(false)}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all select-none font-bold text-xs shadow-inner cursor-pointer
            ${isComparing ? 'bg-primary text-white border-primary' : 'bg-background text-text-muted border-border hover:bg-border hover:text-text-main'}
          `}
          title="Giữ phím [\\] để xem nhanh"
        >
          <Eye size={16} /> {isComparing ? "Đang xem ảnh gốc" : "Xem ảnh gốc [ \\ ]"}
        </button>
      </div>

      {/* PHẢI: Zoom, Undo, Xuất file */}
      <div className="flex items-center gap-1">
        <button onClick={() => undo()} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md"><Undo2 size={18} /></button>
        <button onClick={() => redo()} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md"><Redo2 size={18} /></button>
        
        <div className="w-px h-5 bg-border mx-2"></div>
        
        <button onClick={() => setZoom(currentZoom - 0.1)} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md"><ZoomOut size={18} /></button>
        <span className="w-12 text-center font-bold text-xs text-text-main">{Math.round(currentZoom * 100)}%</span>
        <button onClick={() => setZoom(currentZoom + 0.1)} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md"><ZoomIn size={18} /></button>
        
        <div className="w-px h-5 bg-border mx-2"></div>

        <label className="btn-ghost p-1.5 cursor-pointer" title="Mở File"><FolderOpen size={18} /><input type="file" accept=".manga" className="hidden" onChange={handleLoadManga} /></label>
        <button onClick={handleSaveManga} className="btn-ghost p-1.5" title="Lưu Project"><Save size={18} /></button>
        <button onClick={toggleRightPanel} className={`p-1.5 rounded-md ml-1 ${!showRightPanel ? "text-text-muted hover:bg-border" : "bg-primary/20 text-primary"}`}><PanelRight size={18} /></button>
        <button onClick={handleExport} className="btn-primary py-1.5 px-3 ml-2 text-xs"><Download size={16} /> Xuất ảnh</button>
      </div>
    </div>
  );
}