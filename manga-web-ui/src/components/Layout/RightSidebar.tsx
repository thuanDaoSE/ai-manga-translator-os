import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sliders, Bot, AlignLeft as ListIcon, Type, MoveVertical, Settings2, Wand2,
  MessageSquareDashed, ArrowRight, RefreshCcw, Sparkles, MessageCircle, Check,
  Globe, MousePointer2, ChevronDown, Zap, Trash2, PanelRightClose, Minus, Plus,
  Upload, AlignCenter, AlignLeft, AlignRight, AlignJustify,
  Copy, MoreVertical, MessageSquareText, PaintBucket, PenTool, Layers, X, Lock, Unlock// <-- 🚀 3 ICON MỚI BỔ SUNG
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useConfigStore } from '../../store/useConfigStore'; // 🚀 Bổ sung kho Cấu hình
import { useProjectStore } from '../../store/useProjectStore'; // 🚀 Bổ sung kho Dự án
import { mangaApi } from '../../services/api';
import { loadAllSavedFonts } from '../../utils/fontManager';

// ==========================================
// MICRO-COMPONENTS CHO DESIGN INSPECTOR
// ==========================================
const SectionHeader = ({ title }: { title: string }) => (
  <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-3 mt-4">
    {title}
  </h3>
);

const GlassPanel = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-background border border-border rounded-lg p-1 flex items-center shadow-sm ${className}`}>
    {children}
  </div>
);

// 🚀 Đã xóa tab 'ai', chỉ còn 2 tab cho đỡ chật chỗ
type TabType = 'design' | 'dialogue';

export default function RightSidebar() {
  const [activeTab, setActiveTab] = useState<TabType>('design');

  const { activeBubbleId } = useCanvasStore();
  const toolStore = useToolStore();

  // ==========================================
  // LOGIC KÉO GIÃN RIGHT SIDEBAR
  // ==========================================
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizing = useRef(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = '';
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing.current) {
      let newWidth = document.body.clientWidth - e.clientX;
      if (newWidth < 260) newWidth = 260;
      if (newWidth > 600) newWidth = 600;
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
  // ==========================================

  if (!toolStore.showRightPanel) return null;

  return (
    <aside
      className="h-full bg-sidebar border-l border-border flex flex-col text-text-main font-sans text-xs select-none shadow-2xl relative z-40 transition-all shrink-0"
      style={{ width: `${sidebarWidth}px` }}
    >

      {/* DRAG HANDLE */}
      <div
        className="absolute top-0 -left-1.5 w-3 h-full cursor-col-resize z-50 group flex items-center justify-center"
        onMouseDown={startResizing}
      >
        <div className="w-1 h-12 bg-border group-hover:bg-primary transition-all duration-300 rounded-full" />
      </div>

      {/* HEADER TABS VÀ NÚT ĐÓNG */}
      <div className="flex items-center px-2 py-2 border-b border-border bg-panel/50 shrink-0 gap-1 relative overflow-hidden">
        {/* Nhóm Tabs */}
        <div className="flex-1 flex items-center gap-1">
          <TabButton icon={<Sliders size={15} />} label="Design" isActive={activeTab === 'design'} onClick={() => setActiveTab('design')} />
          <TabButton icon={<ListIcon size={15} />} label="Script" isActive={activeTab === 'dialogue'} onClick={() => setActiveTab('dialogue')} />
        </div>

        {/* Nút Đóng Right Sidebar */}
        <div className="w-px h-8 bg-border/80 mx-1 shrink-0" />
        <button
          onClick={() => toolStore.toggleRightPanel()}
          className="p-2 shrink-0 bg-border/40 hover:bg-border text-text-muted hover:text-danger rounded-md cursor-pointer transition-colors"
          title="Đóng bảng công cụ (Thu gọn màn hình)"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* NỘI DUNG CUỘN */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-sidebar">
        {/* 🚀 ĐÃ ĐỔI SANG BẢN FIGMA STYLE MỚI */}
        {activeTab === 'design' && <DesignInspectorTab activeId={activeBubbleId} />}
        {activeTab === 'dialogue' && <DialogueListTab activeId={activeBubbleId} />}
      </div>

    </aside>
  );
}

// ==========================================
// CÁC THÀNH PHẦN PHỤ TRỢ (COMPONENTS)
// ==========================================

function TabButton({ icon, label, isActive, onClick }: { icon: any, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-1 flex flex-col items-center justify-center py-2.5 rounded-lg transition-all duration-300 ease-out cursor-pointer group overflow-hidden ${isActive
        ? 'text-primary'
        : 'text-text-muted hover:text-text-main hover:bg-border/50'
        }`}
    >
      {isActive && (
        <div className="absolute inset-0 bg-primary/10 rounded-lg">
          <div className="absolute bottom-0 left-[20%] right-[20%] h-[2px] bg-primary rounded-t-full shadow-sm" />
        </div>
      )}
      <div className={`relative z-10 transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-sm' : 'group-hover:scale-110'}`}>
        {icon}
      </div>
      <span className="text-[9px] mt-1.5 font-bold tracking-[0.1em] uppercase opacity-90 relative z-10">
        {label}
      </span>
    </button>
  );
}

// function SectionHeader({ title }: { title: string }) {
//   return (
//     <div className="flex items-center justify-between px-5 py-3 mt-6 first:mt-2">
//       <span className="font-bold text-[10px] uppercase tracking-[0.2em] text-text-muted">
//         {title}
//       </span>
//       <div className="flex-1 h-[1px] bg-gradient-to-r from-border to-transparent ml-4" />
//     </div>
//   );
// }


// --- 2. TAB DIALOGUE LIST TÍCH HỢP AI TRỢ LÝ (UX CHUẨN MỰC) ---
function DialogueListTab({ activeId }: { activeId: string | null }) {
  const { bubbles, setActiveBubble, removeBubble, updateBubble } = useCanvasStore();
  const setConfigModalOpen = useConfigStore(state => state.setModalOpen);
  const itemRefs = useRef(new Map());

  const [expandedAIBubbleId, setExpandedAIBubbleId] = useState<string | null>(null);

  // 🚀 STATE MỚI: Quản lý chế độ sắp xếp
  const [sortMode, setSortMode] = useState<'reading_order' | 'length'>('reading_order');

  useEffect(() => {
    if (activeId) {
      const node = itemRefs.current.get(activeId);
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeId]);

  const handleCopy = (text: string, type: string) => {
    if (!text) return toast.error(`Trống không! Không có chữ ${type} để copy.`);
    navigator.clipboard.writeText(text);
    toast.success(`Đã copy câu tiếng ${type} vào khay nhớ tạm!`, { icon: '📋' });
  };

  const handleRetryTranslation = async (e: React.MouseEvent, bubble: any) => {
    e.stopPropagation();
    const loadId = toast.loading("Đang nhờ AI dịch lại câu này...");
    try {
      const payload = { text: bubble.text || "", japanese: bubble.japanese || "", action: "natural", custom_prompt: "" };
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/copilot/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Lỗi API");
      const data = await response.json();
      updateBubble(bubble.id, { text: data.result });
      toast.success("Dịch lại thành công!", { id: loadId });
    } catch (err) { toast.error("Lỗi mạng khi dịch lại!", { id: loadId }); }
  };

  // ==========================================================
  // 🚀 MA THUẬT SẮP XẾP: LỌC RÁC HOẶC ĐỌC THEO NGỮ CẢNH MANGA
  // ==========================================================
  const sortedBubbles = [...bubbles].sort((a, b) => {
    if (sortMode === 'length') {
      // Sắp xếp theo độ dài (ngắn lên trước) để sếp dễ dọn rác OCR
      const lenA = (a.japanese || a.text || '').length;
      const lenB = (b.japanese || b.text || '').length;
      return lenA - lenB;
    } else {
      // Sắp xếp theo thứ tự đọc Manga (Trên -> Dưới, Phải -> Trái)
      const yTolerance = 50; // Khung sai số 50px để xác định "cùng 1 dòng"
      const yDiff = a.y - b.y;

      // Nếu 2 ô thoại chênh lệch Y quá 50px -> Khác dòng -> Ô nào ở trên (Y nhỏ hơn) lên trước
      if (Math.abs(yDiff) > yTolerance) {
        return yDiff;
      }
      // Nếu 2 ô thoại nằm ngang nhau (cùng dòng) -> Ô bên PHẢI (X lớn hơn) lên trước
      return b.x - a.x;
    }
  });

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-500 ease-out pb-20">

      {/* 🚀 HEADER STICKY (Giữ nguyên bối cảnh) */}
      <div className="p-4 bg-panel/90 backdrop-blur-md sticky top-0 z-30 border-b border-border shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListIcon size={14} className="text-text-muted" />
            <h2 className="text-[10px] font-bold text-text-muted tracking-[0.2em] uppercase">Kịch bản thoại</h2>
          </div>
          <button
            onClick={() => setConfigModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg transition-all duration-300 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
          >
            <Settings2 size={12} /> Cấu hình AI
          </button>
        </div>

        {/* 🚀 THANH CÔNG CỤ SẮP XẾP (SORT TABS) */}
        <div className="flex bg-background border border-border p-1 rounded-lg">
          <button
            onClick={() => setSortMode('reading_order')}
            className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${sortMode === 'reading_order' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border/50'}`}
          >
            Theo Ngữ cảnh
          </button>
          <button
            onClick={() => setSortMode('length')}
            className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-1 ${sortMode === 'length' ? 'bg-amber-500 text-amber-950 shadow-sm' : 'text-text-muted hover:text-amber-500 hover:bg-amber-500/10'}`}
            title="Đẩy các đoạn text ngắn (nghi ngờ là rác OCR) lên trên cùng để dễ xóa"
          >
            <Zap size={10} /> Dọn Rác OCR
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 space-y-4">
        {/* 🚀 Render mảng ĐÃ ĐƯỢC SẮP XẾP (sortedBubbles) thay vì mảng gốc */}
        {sortedBubbles.map((bubble, i) => {
          const isSelected = activeId === bubble.id;
          const isAIExpanded = expandedAIBubbleId === bubble.id;

          return (
            <div
              key={bubble.id}
              ref={(node) => { if (node) itemRefs.current.set(bubble.id, node); }}
              onClick={() => setActiveBubble(bubble.id)}
              className={`
                group relative flex flex-col p-4 transition-all duration-300 ease-out rounded-2xl border text-left cursor-pointer
                ${isSelected
                  ? 'bg-panel border-primary/40 ring-4 ring-primary/10 shadow-lg transform scale-[1.01] z-20'
                  : 'bg-background border-border shadow-sm hover:shadow-md hover:border-border/80 hover:scale-[1.005]'
                }
              `}
            >
              {/* ... (GIỮ NGUYÊN TOÀN BỘ NỘI DUNG BÊN TRONG CỦA THẺ THOẠI) ... */}
              {/* Lưu ý: Nếu copy đè, sếp nhớ copy cả phần ruột <div absolute top-3 right-3... tới hết InlineAIAssistant nhé */}
              {/* 🚀 PROGRESSIVE DISCLOSURE: Thanh công cụ nổi tàng hình, giải quyết Fitts's Law bằng p-2 */}
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-panel/95 backdrop-blur-sm p-1 rounded-xl border border-border shadow-md z-30">
                <button onClick={(e) => { e.stopPropagation(); handleCopy((bubble as any).japanese, 'Nhật'); }} className="p-2 text-text-muted hover:text-text-main hover:bg-background rounded-lg transition-colors" title="Copy Tiếng Nhật">
                  <span className="text-[10px] font-black uppercase">JP</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleCopy(bubble.text, 'Việt'); }} className="p-2 text-text-muted hover:text-text-main hover:bg-background rounded-lg transition-colors" title="Copy Tiếng Việt">
                  <span className="text-[10px] font-black uppercase">VN</span>
                </button>
                <div className="w-[1px] h-4 bg-border mx-1" />
                <button onClick={(e) => handleRetryTranslation(e, bubble)} className="p-2 text-text-muted hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Dịch lại ngay">
                  <RefreshCcw size={15} />
                </button>
                <div className="w-[1px] h-4 bg-border mx-1" />
                <button onClick={(e) => { e.stopPropagation(); removeBubble(bubble.id); }} className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors" title="Xóa ô thoại">
                  <Trash2 size={15} />
                </button>
              </div>

              {/* Phân cấp thông tin (Hierarchy): Header */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-background border border-border shadow-inner">
                  <MessageSquareText className="w-3.5 h-3.5 text-text-muted" />
                </div>
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-[0.15em]">
                  Thoại {String(i + 1).padStart(2, '0')}
                </span>
              </div>

              {/* Nội dung tĩnh: Tiếng Nhật (Màu chìm, không tranh giành thị giác) */}
              <div className="mb-3 pl-9">
                <p className="text-xs font-medium text-text-muted/70 font-sans leading-relaxed tracking-wide select-text">
                  {(bubble as any).japanese || "Đang chờ dữ liệu..."}
                </p>
              </div>

              {/* Nội dung động: Khung dịch Tiếng Việt (Màu nổi, tương tác cao) */}
              <div className="pl-9 mb-4">
                <textarea
                  value={bubble.text || ""}
                  onChange={(e) => updateBubble(bubble.id, { text: e.target.value })}
                  className="w-full resize-none bg-transparent text-[13px] font-semibold text-text-main placeholder-text-muted/40 focus:outline-none focus:ring-0 p-0 m-0 leading-relaxed custom-scrollbar"
                  rows={Math.max(2, (bubble.text || "").split('\n').length)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* 🚀 NÚT AI MỚI: Rõ ràng, có Label, tiết diện bấm siêu lớn */}
              <div className="pl-9 flex">
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedAIBubbleId(isAIExpanded ? null : bubble.id); }}
                  className={`
                    inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-bold transition-all duration-300 shadow-sm
                    ${isAIExpanded
                      ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                      : 'bg-panel text-text-muted border border-border hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/20'
                    }
                  `}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAIExpanded ? 'animate-pulse' : ''}`} />
                  Trợ lý AI Ngữ cảnh
                </button>
              </div>

              {/* 🚀 CHỐNG LAYOUT THRASHING: Hiệu ứng mở rộng bằng CSS Grid */}
              <div
                className={`grid transition-all duration-300 ease-in-out pl-9 ${isAIExpanded ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'
                  }`}
              >
                <div className="overflow-hidden">
                  {isAIExpanded && <InlineAIAssistant bubble={bubble} onClose={() => setExpandedAIBubbleId(null)} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- 3. TAB DESIGN (FIGMA-STYLE INSPECTOR) ---
function DesignInspectorTab({ activeId }: { activeId: string | null }) {
  const { bubbles, updateBubble } = useCanvasStore();
  const toolStore = useToolStore();

  // ===============================
  // 🚀 BẢN VÁ: CHỐNG MẤT FOCUS KHI BẤM SIDEBAR
  // ===============================
  const containerRef = useRef<HTMLDivElement>(null);
  const [effectiveId, setEffectiveId] = useState(activeId);

  useEffect(() => {
    if (activeId) {
      setEffectiveId(activeId);
    } else {
      // Khi Canvas mất focus, delay 50ms để xem chuột có đang nằm trong Sidebar không. 
      // Nếu có, KIÊN QUYẾT GIỮ LẠI ID ĐANG SỬA!
      setTimeout(() => {
        if (!containerRef.current?.contains(document.activeElement)) {
          setEffectiveId(null);
        }
      }, 50);
    }
  }, [activeId]);

  // Bắt sự kiện click ra nền ngoài cùng để thoát chế độ Local
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!useCanvasStore.getState().activeBubbleId) {
          setEffectiveId(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeBubble = effectiveId ? bubbles.find(b => b.id === effectiveId) : null;
  const isGlobal = !activeBubble;

  // =====================================
  // 🚀 LẤY DỮ LIỆU (Đọc từ Bubble hoặc Mặc định Global)
  // =====================================
  const currentFontFamily = activeBubble?.fontFamily || toolStore.fontFamily || 'Wild Words';
  const currentFontSize = activeBubble?.fontSize || toolStore.fontSize || 18;
  const currentTextAlign = activeBubble?.textAlign || toolStore.textAlign || 'center';
  const currentFillColor = activeBubble?.fontColor || toolStore.fontColor || '#000000';
  const currentOutlineWidth = activeBubble?.outlineWidth ?? toolStore.outlineWidth ?? 0;
  const currentOutlineColor = activeBubble?.outlineColor || toolStore.outlineColor || '#ffffff';
  const currentHasShadow = activeBubble?.hasShadow ?? toolStore.hasShadow ?? false;

  // =====================================
  // 🚀 HÀM CẬP NHẬT TRẠNG THÁI THÔNG MINH
  // =====================================
  // =====================================
  // 🚀 HÀM CẬP NHẬT TRẠNG THÁI THÔNG MINH
  // =====================================
  const handleUpdate = (key: string, value: any) => {
    if (effectiveId) {
      // 🟢 CHẾ ĐỘ LOCAL: Đang chọn cục nào thì sửa cục đó (kể cả khóa nút vẫn cho phép sửa thủ công)
      updateBubble(effectiveId, { [key]: value });
    } else {
      // 🔵 CHẾ ĐỘ GLOBAL: SỬA TOÀN BỘ ẢNH!
      useToolStore.setState({ [key]: value });

      const allBubbles = useCanvasStore.getState().bubbles;
      allBubbles.forEach((bubble) => {
        // 🚀 BẢN VÁ TỐI THƯỢNG: TUYỆT ĐỐI KHÔNG ĐỤNG VÀO NHỮNG Ô THOẠI ĐÃ BỊ KHÓA!
        if (!bubble.isLocked) {
          updateBubble(bubble.id, { [key]: value });
        }
      });
    }
  };

  const alignments = [
    { id: 'left', icon: AlignLeft },
    { id: 'center', icon: AlignCenter },
    { id: 'right', icon: AlignRight },
    { id: 'justify', icon: AlignJustify }
  ];

  return (
    <div ref={containerRef} className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-500 pb-20 bg-sidebar text-text-main">
      <div className="p-4 space-y-2">

        {/* ========================================================= */}
        {/* 🚀 CONTEXT BANNER ĐƯỢC NÂNG CẤP UX TỐI ĐA */}
        {/* ========================================================= */}
        <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border shadow-sm transition-colors duration-300 ${isGlobal ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-md ${isGlobal ? 'bg-primary/20' : 'bg-emerald-500/20'}`}>
              {isGlobal ? <Globe className="w-4 h-4" /> : <MousePointer2 className="w-4 h-4" />}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider leading-none mb-1">
                {isGlobal ? 'Cấu hình chung' : 'Đang sửa 1 Ô thoại'}
              </span>
              <span className="text-[9px] font-medium opacity-70 leading-none">
                {isGlobal ? 'Áp dụng cho toàn bộ ảnh' : 'Chỉ sửa ô đang chọn'}
              </span>
            </div>
          </div>

          {/* NÚT "BỎ CHỌN" CỰC KỲ TƯỜNG MINH */}
          {/* ===================================== */}
          {/* CỤM NÚT CÔNG CỤ (CHỈ HIỆN KHI Ở CHẾ ĐỘ LOCAL) */}
          {/* ===================================== */}
          {!isGlobal && (
            <div className="flex items-center gap-1.5">

              {/* 🚀 NÚT KHÓA MỚI */}
              <button
                onClick={() => handleUpdate('isLocked', !activeBubble?.isLocked)}
                className={`flex items-center justify-center p-1.5 rounded-md transition-all cursor-pointer shadow-sm border ${activeBubble?.isLocked
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 border-amber-500/30'
                  : 'bg-background hover:bg-border text-text-muted border-border'
                  }`}
                title={activeBubble?.isLocked ? "Mở khóa ô thoại" : "Khóa cứng (Bảo vệ khỏi thay đổi Global)"}
              >
                {activeBubble?.isLocked ? <Lock size={12} strokeWidth={3} /> : <Unlock size={12} />}
              </button>

              {/* NÚT "BỎ CHỌN" CŨ */}
              <button
                onClick={() => {
                  useCanvasStore.getState().setActiveBubble(null);
                  setEffectiveId(null);
                }}
                className="flex items-center gap-1 px-2 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-600 rounded-md transition-colors cursor-pointer active:scale-95 shadow-sm border border-emerald-500/30"
                title="Bỏ chọn để quay về Cấu hình chung"
              >
                <span className="text-[9px] font-bold uppercase">Bỏ chọn</span>
                <X size={12} strokeWidth={3} />
              </button>
            </div>
          )}
        </div>

        {/* ==================== SECTION: TYPOGRAPHY ==================== */}
        <section>
          <SectionHeader title="Typography" />

          <div className="space-y-2">
            {/* Dropdown Chọn Font */}
            <div className="relative group">
              <select
                value={currentFontFamily}
                onChange={(e) => handleUpdate('fontFamily', e.target.value)}
                className="w-full appearance-none bg-background border border-border rounded-lg py-2 pl-3 pr-8 text-[12px] font-bold text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all shadow-sm cursor-pointer"
              >
                <option value="Wild Words">Wild Words</option>
                <option value="Anime Ace">Anime Ace</option>
                <option value="CC Astro City">CC Astro City</option>
                <option value="Komika Axis">Komika Axis</option>
                <option value="Arial">Arial</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>

            {/* Dãy nút Căn lề & Kích thước */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-background border border-border rounded-lg shadow-sm px-2 py-1.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50 transition-all">
                <Type className="w-3.5 h-3.5 text-text-muted mr-2" />
                <input
                  type="number"
                  min="6" max="144"
                  value={currentFontSize}
                  onChange={(e) => handleUpdate('fontSize', Number(e.target.value))}
                  className="w-full bg-transparent text-[13px] font-bold text-text-main focus:outline-none"
                />
              </div>

              {/* Native Grouped Alignment Toggle */}
              <GlassPanel className="gap-0.5 shrink-0">
                {alignments.map((align) => (
                  <button
                    key={align.id}
                    onClick={() => handleUpdate('textAlign', align.id)}
                    className={`p-1.5 rounded-md transition-all ${currentTextAlign === align.id ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border/50'}`}
                    title={`Căn ${align.id}`}
                  >
                    <align.icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </GlassPanel>
            </div>
          </div>
        </section>

        {/* ĐƯỜNG KẺ NGANG */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent my-4"></div>

        {/* ==================== SECTION: MANGA EFFECTS ==================== */}
        <section>
          <SectionHeader title="Hiệu ứng (Effects)" />

          <div className="space-y-1">
            {/* DÒNG 1: MÀU CHỮ (FILL) */}
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-panel transition-colors group cursor-pointer border border-transparent hover:border-border">
              <div className="flex items-center gap-3">
                <PaintBucket className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                <span className="text-[12px] font-semibold text-text-muted group-hover:text-text-main transition-colors">Màu chữ (Fill)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-text-muted uppercase">{currentFillColor}</span>
                <label className="relative w-5 h-5 rounded-[6px] border border-border shadow-sm cursor-pointer overflow-hidden hover:scale-110 transition-transform">
                  <input type="color" value={currentFillColor} onChange={(e) => handleUpdate('fontColor', e.target.value)} className="absolute -top-2 -left-2 w-10 h-10 opacity-0 cursor-pointer" />
                  <div className="w-full h-full" style={{ backgroundColor: currentFillColor }} />
                </label>
              </div>
            </div>

            {/* DÒNG 2: VIỀN CHỮ (STROKE) */}
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-panel transition-colors group cursor-pointer border border-transparent hover:border-border">
              <div className="flex items-center gap-3">
                <PenTool className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                <span className="text-[12px] font-semibold text-text-muted group-hover:text-text-main transition-colors">Viền chữ (Stroke)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-background border border-border rounded-md px-1.5 py-0.5 w-12 shadow-sm focus-within:border-primary transition-colors">
                  <input type="number" min="0" max="10" step="0.5" value={currentOutlineWidth} onChange={(e) => handleUpdate('outlineWidth', Number(e.target.value))} className="w-full bg-transparent text-[11px] text-center font-mono font-bold text-text-main focus:outline-none" />
                </div>
                <label className="relative w-5 h-5 rounded-[6px] border border-border shadow-sm cursor-pointer overflow-hidden hover:scale-110 transition-transform">
                  <input type="color" value={currentOutlineColor} onChange={(e) => handleUpdate('outlineColor', e.target.value)} className="absolute -top-2 -left-2 w-10 h-10 opacity-0 cursor-pointer" />
                  <div className="w-full h-full" style={{ backgroundColor: currentOutlineColor }} />
                </label>
              </div>
            </div>

            {/* DÒNG 3: ĐỔ BÓNG (DROP SHADOW) */}
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-panel transition-colors group cursor-pointer border border-transparent hover:border-border" onClick={() => handleUpdate('hasShadow', !currentHasShadow)}>
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                <span className="text-[12px] font-semibold text-text-muted group-hover:text-text-main transition-colors">Đổ bóng (Shadow)</span>
              </div>
              <button role="switch" aria-checked={currentHasShadow} className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${currentHasShadow ? 'bg-primary' : 'bg-border'}`}>
                <span aria-hidden="true" className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${currentHasShadow ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

// 🚀 COMPONENT AI NỘI TUYẾN MỚI (CHỐNG NGỘP THỞ, THIẾT KẾ DẠNG THOUGHT-BUBBLE)
function InlineAIAssistant({ bubble, onClose }: { bubble: any, onClose: () => void }) {
  const [instruction, setInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const updateBubble = useCanvasStore(state => state.updateBubble);

  const handleRealAI = async (type: string) => {
    setAiLoading(true); setAiResult('');
    try {
      const payload = { text: bubble.text || "", japanese: bubble.japanese || "", action: type, custom_prompt: type === 'custom' ? instruction : "" };
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/copilot/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("API Lỗi");
      const data = await response.json();
      setAiResult(data.result);
      if (type === 'custom') setInstruction('');
    } catch (error) { setAiResult("❌ Lỗi kết nối AI!"); }
    finally { setAiLoading(false); }
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-amber-500/5 to-background border border-amber-500/20 shadow-inner" onClick={e => e.stopPropagation()}>

      {/* Header của Panel AI */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-500/10 border-b border-amber-500/10">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-widest">
          <Bot size={12} /> Phân tích Ngữ cảnh
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Nút gợi ý (Suggestion Chips) */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'natural', label: 'Tự nhiên hơn' },
            { id: 'aggressive', label: 'Hầm hố hơn' },
            { id: 'shorten', label: 'Rút gọn câu' },
            { id: 'explain', label: 'Giải nghĩa Kanji' }
          ].map(btn => (
            <button
              key={btn.id}
              onClick={() => handleRealAI(btn.id)}
              className="px-2.5 py-1 text-[10px] font-bold bg-background border border-border text-text-muted rounded-full hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/30 transition-all shadow-sm"
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Ô nhập Prompt tùy chỉnh (Có focus ring) */}
        <div className="relative flex items-center">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRealAI('custom'); }}
            placeholder="Chỉ thị riêng cho AI..."
            className="w-full bg-background border border-border rounded-lg py-2 pl-3 pr-10 text-[11px] text-text-main placeholder-text-muted focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all shadow-sm"
          />
          <button
            onClick={() => handleRealAI('custom')}
            disabled={!instruction.trim() || aiLoading}
            className="absolute right-1.5 p-1.5 bg-amber-500/10 text-amber-500 rounded-md hover:bg-amber-500 hover:text-amber-950 disabled:opacity-30 disabled:hover:bg-amber-500/10 disabled:hover:text-amber-500 transition-colors"
          >
            {aiLoading ? <RefreshCcw size={12} className="animate-spin" /> : <ArrowRight size={12} />}
          </button>
        </div>

        {/* Trả kết quả (Animation mượt mà) */}
        {(aiLoading || aiResult) && (
          <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
            {aiLoading ? (
              <div className="flex items-center gap-2 text-[10px] text-amber-500/80 font-medium px-1">
                <RefreshCcw size={12} className="animate-spin" /> Đang thảo luận với DeepSeek...
              </div>
            ) : (
              <div className="space-y-2">
                <div className="bg-background/80 border border-amber-500/20 rounded-lg p-3 text-[12px] text-text-main font-medium leading-relaxed shadow-sm">
                  {aiResult}
                </div>
                <button
                  onClick={() => { updateBubble(bubble.id, { text: aiResult }); setAiResult(''); onClose(); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold text-[11px] uppercase tracking-wider rounded-lg transition-transform active:scale-[0.98] shadow-md"
                >
                  <Check size={14} strokeWidth={3} /> Áp dụng vào ảnh
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

