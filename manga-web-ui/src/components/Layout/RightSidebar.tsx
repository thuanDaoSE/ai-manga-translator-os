import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sliders, Bot, AlignLeft as ListIcon, Type, MoveVertical, Settings2, Wand2,
  MessageSquareDashed, ArrowRight, RefreshCcw, Sparkles, MessageCircle, Check,
  Globe, MousePointer2, ChevronDown, Zap, Trash2, PanelRightClose, Minus, Plus,
  Upload, AlignCenter, AlignLeft, AlignRight, AlignJustify,
  Copy, MoreVertical, MessageSquareText, PaintBucket, PenTool,
  Layers, X, Lock, Unlock, Diamond, Square, Triangle// <-- 🚀 3 ICON MỚI BỔ SUNG
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useConfigStore } from '../../store/useConfigStore'; // 🚀 Bổ sung kho Cấu hình
import { useProjectStore } from '../../store/useProjectStore'; // 🚀 Bổ sung kho Dự án
import { mangaApi } from '../../services/api';
import { useAuthStore } from '../../store/useAuthStore';
import LensModal from '../Modals/LensModal';
import { AdvancedTranslateModal } from '../Modals/AdvancedTranslateModal';
import { useTranslation } from 'react-i18next';
import { RedrawPromptInput } from '../Editor/RedrawPromptInput';

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
  const { t } = useTranslation();
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

  const scanModal = toolStore.scanModal;
  const isRedrawActive = toolStore.activeMode === 'redraw' && !!toolStore.actionPosition;

  if (!toolStore.showRightPanel && !scanModal?.isOpen && !isRedrawActive) return null;

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

      {scanModal?.isOpen ? (
        <LensModal />
      ) : isRedrawActive ? (
        <RedrawPromptInput
          inSidebar
          isProcessing={toolStore.isProcessing}
          onCancel={() => {
            if (toolStore.redrawCancelHandler) toolStore.redrawCancelHandler();
          }}
          onSubmit={async (prompts) => {
            if (toolStore.redrawSubmitHandler) await toolStore.redrawSubmitHandler(prompts);
          }}
        />
      ) : (
        <>
          {/* HEADER TABS VÀ NÚT ĐÓNG */}
          <div className="flex items-center px-2 py-2 border-b border-border bg-panel/50 shrink-0 gap-1 relative overflow-hidden">
            {/* Nhóm Tabs */}
            <div className="flex-1 flex items-center gap-1">
              <TabButton icon={<Sliders size={15} />} label={t('rightSidebar.tabDesign', 'Design')} isActive={activeTab === 'design'} onClick={() => setActiveTab('design')} />
              <TabButton icon={<ListIcon size={15} />} label={t('rightSidebar.tabScript', 'Script')} isActive={activeTab === 'dialogue'} onClick={() => setActiveTab('dialogue')} />
            </div>

            {/* Nút Đóng Right Sidebar */}
            <div className="w-px h-8 bg-border/80 mx-1 shrink-0" />
            <button
              onClick={() => toolStore.toggleRightPanel()}
              className="p-2 shrink-0 bg-border/40 hover:bg-border text-text-muted hover:text-danger rounded-md cursor-pointer transition-colors"
              title={t('layerPanel.closePanel')}
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
        </>
      )}

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
  const { t } = useTranslation();
  const { bubbles, setActiveBubble, removeBubble, updateBubble } = useCanvasStore();
  const setConfigModalOpen = useConfigStore(state => state.setModalOpen);
  const itemRefs = useRef(new Map());

  const [expandedAIBubbleId, setExpandedAIBubbleId] = useState<string | null>(null);

  // 🚀 STATE MỚI: Quản lý chế độ sắp xếp
  const [sortMode, setSortMode] = useState<'reading_order' | 'length'>('reading_order');
  
  const [isAdvancedModalOpen, setIsAdvancedModalOpen] = useState(false);

  const handleAdvancedRetry = async (localPrompt: string) => {
    const pageId = useProjectStore.getState().pageIds[useProjectStore.getState().currentIndex];
    if (!pageId) return toast.error(t('rightSidebar.pageNotFound'));
    
    const loadId = toast.loading(t('rightSidebar.translatingAdvancedLoading'));
    useToolStore.getState().setIsProcessing(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/pages/${pageId}/retry-text-translation`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().session?.access_token || ""}`
        },
        body: JSON.stringify({ local_prompt: localPrompt })
      });
      if (!response.ok) throw new Error("Lỗi API dịch lại");
      const result = await response.json();
      
      const updatedBubbles = result.bubbles.map((b: any) => ({
        ...b,
        text: b.vietnamese || b.text
      }));
      
      const canvasStore = useCanvasStore.getState();
      canvasStore.setBubbles(updatedBubbles);
      
      toast.success(t('rightSidebar.translatingAdvancedSuccess'), { id: loadId });
    } catch (err: any) {
      toast.error(err.message || t('rightSidebar.translatingAdvancedError'), { id: loadId });
    } finally {
      useToolStore.getState().setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (activeId) {
      const node = itemRefs.current.get(activeId);
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeId]);

  const handleCopy = (text: string, type: string) => {
    if (!text) return toast.error(t('rightSidebar.copyEmpty', { type }));
    navigator.clipboard.writeText(text);
    toast.success(t('rightSidebar.copySuccess', { type }), { icon: '📋' });
  };

  const handleRetryTranslation = async (e: React.MouseEvent, bubble: any) => {
    e.stopPropagation();
    const loadId = toast.loading(t('rightSidebar.translatingSingleLoading'));
    try {
      const payload = { text: bubble.text || "", japanese: bubble.japanese || "", action: "natural", custom_prompt: "" };
      const data = await mangaApi.copilotChat(payload);
      updateBubble(bubble.id, { text: data.result });
      toast.success(t('rightSidebar.translatingSingleSuccess'), { id: loadId });
    } catch (err) { toast.error(t('rightSidebar.translatingSingleError'), { id: loadId }); }
  };

  // ==========================================================
  // 🚀 MA THUẬT SẮP XẾP: LỌC RÁC HOẶC ĐỌC THEO NGỮ CẢNH MANGA
  // ==========================================================
  const sortedBubbles = [...bubbles].sort((a, b) => {
    if (sortMode === 'length') {
      const lenA = (a.japanese || a.text || '').length;
      const lenB = (b.japanese || b.text || '').length;
      return lenA - lenB;
    } else {
      const yTolerance = 50; // Khung sai số 50px để xác định "cùng 1 dòng"
      const yDiff = a.y - b.y;

      if (Math.abs(yDiff) > yTolerance) {
        return yDiff;
      }
      return b.x - a.x;
    }
  });

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-500 ease-out pb-20">
      
      <AdvancedTranslateModal
        isOpen={isAdvancedModalOpen}
        onClose={() => setIsAdvancedModalOpen(false)}
        onConfirm={handleAdvancedRetry}
      />

      {/* 🚀 HEADER STICKY (Giữ nguyên bối cảnh) */}
      <div className="p-4 bg-panel/90 backdrop-blur-md sticky top-0 z-30 border-b border-border shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListIcon size={14} className="text-text-muted" />
            <h2 className="text-[10px] font-bold text-text-muted tracking-[0.2em] uppercase">{t('rightSidebar.dialogueScript')}</h2>
          </div>
          
          <button
            onClick={() => setIsAdvancedModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg transition-all duration-300 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
          >
            <Sparkles size={12} /> {t('rightSidebar.advancedTranslation')}
          </button>
        </div>

        {/* 🚀 THANH CÔNG CỤ SẮP XẾP (SORT TABS) */}
        <div className="flex bg-background border border-border p-1 rounded-lg">
          <button
            onClick={() => setSortMode('reading_order')}
            className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${sortMode === 'reading_order' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border/50'}`}
          >
            {t('rightSidebar.sortContext')}
          </button>
          <button
            onClick={() => setSortMode('length')}
            className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-1 ${sortMode === 'length' ? 'bg-amber-500 text-amber-950 shadow-sm' : 'text-text-muted hover:text-amber-500 hover:bg-amber-500/10'}`}
            title={t('rightSidebar.sortOcrCleanTooltip')}
          >
            <Zap size={10} /> {t('rightSidebar.sortOcrClean')}
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 space-y-2"> {/* 🚀 Giảm space-y từ 4 xuống 2 */}
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
                group relative flex flex-col p-3 transition-all duration-200 ease-out rounded-xl border text-left cursor-pointer
                ${isSelected
                  ? (bubble.isLocked 
                      ? 'bg-amber-500/10 border-amber-500/40 ring-2 ring-amber-500/20 shadow-md z-20' // 🚀 MÀU VÀNG NẾU ĐANG CHỌN & BỊ KHÓA
                      : 'bg-panel border-primary/40 ring-2 ring-primary/10 shadow-md z-20') // MÀU XANH NẾU ĐANG CHỌN & KHÔNG KHÓA
                  : (bubble.isLocked 
                      ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/40 hover:shadow-sm' // 🚀 MÀU VÀNG NHẠT NẾU BỊ KHÓA & KHÔNG ĐƯỢC CHỌN
                      : 'bg-background/80 border-border/50 hover:bg-background hover:border-border hover:shadow-sm')
                }
              `}
            >
              {/* ========================================================= */}
              {/* THANH CÔNG CỤ NỔI */}
              {/* ========================================================= */}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-panel/95 backdrop-blur-sm p-1 rounded-lg border border-border shadow-md z-30">
                <button onClick={(e) => handleRetryTranslation(e, bubble)} className="p-1.5 text-text-muted hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors" title="Dịch lại ngay">
                  <RefreshCcw size={12} />
                </button>
                <div className="w-[1px] h-3 bg-border mx-1" />
                <button onClick={(e) => { e.stopPropagation(); removeBubble(bubble.id); }} className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors" title="Xóa ô thoại">
                  <Trash2 size={12} />
                </button>
              </div>

              {/* ========================================================= */}
              {/* HEADER: CỘT TRÁI (SỐ + COPY + KHÓA) & CỘT PHẢI (TIẾNG NHẬT) */}
              {/* ========================================================= */}
              <div className="flex items-start gap-3 mb-2 pr-14">
                {/* CỘT TRÁI: Nhóm Số thứ tự, Nút Copy và Ổ Khóa */}
                <div className="flex flex-col items-center gap-1.5 shrink-0 mt-0.5">
                  {/* Số thứ tự (Đổi sang màu vàng nếu bị khóa) */}
                  <div className={`flex items-center justify-center w-6 h-6 rounded-md shadow-inner text-[9px] font-bold transition-colors
                    ${bubble.isLocked 
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-600' 
                      : 'bg-background border border-border text-text-muted'}`
                  }>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  
                  {/* 🚀 HIỂN THỊ ICON Ổ KHÓA NẾU BỊ KHÓA */}
                  {bubble.isLocked && (
                    <div title="Ô thoại này đã được bảo vệ Style" className="animate-in zoom-in duration-300">
                      <Lock size={12} strokeWidth={3} className="text-amber-500 drop-shadow-sm" />
                    </div>
                  )}

                  {/* Nút Copy nằm gọn gàng, an toàn ở lề trái */}
                  {(bubble as any).japanese && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleCopy((bubble as any).japanese, 'Nhật'); }} 
                      className="p-1 text-text-muted hover:text-primary hover:bg-primary/10 rounded-md transition-all opacity-40 group-hover:opacity-100 cursor-pointer" 
                      title="Copy Tiếng Nhật để tra từ điển"
                    >
                      <Copy size={12} />
                    </button>
                  )}
                </div>
                
                {/* CỘT PHẢI: Tiếng Nhật */}
<p className="text-[11px] font-medium text-text-muted/80 font-sans leading-relaxed tracking-wide select-text pt-1 break-words whitespace-pre-wrap">
  {(bubble as any).japanese || "Đang chờ dữ liệu..."}
</p>
              </div>

              {/* ========================================================= */}
              {/* KHUNG DỊCH TIẾNG VIỆT (TỰ ĐỘNG CO GIÃN) */}
              {/* ========================================================= */}
              <div className="pl-9 relative">
                
                {/* THANH CHỈ THỊ (INDICATOR) - Đổi sang màu Cam nếu khóa */}
                <div className={`absolute left-0 top-0 bottom-0 w-[2px] rounded-r-sm transition-all duration-300 
                  ${isSelected ? (bubble.isLocked ? 'bg-amber-500' : 'bg-primary') : 'bg-transparent'}
                `} />

                {/* KHUNG INPUT NHỎ GỌN HƠN */}
                <div className={`relative p-2.5 rounded-lg border transition-all duration-300 
                  ${isSelected 
                    ? (bubble.isLocked ? 'bg-background border-amber-500/40 shadow-inner ring-1 ring-amber-500/20' : 'bg-background border-primary/40 shadow-inner ring-1 ring-primary/10') 
                    : 'bg-background/40 border-border/50 hover:border-border hover:bg-background/60'
                  }`}
                >
                  <textarea
                    ref={(el) => {
                      if (el) {
                        el.style.height = 'auto'; 
                        el.style.height = `${el.scrollHeight}px`; 
                      }
                    }}
                    value={bubble.text || ""}
                    onChange={(e) => updateBubble(bubble.id, { text: e.target.value })}
                    onFocus={() => setActiveBubble(bubble.id)}
                    className="w-full resize-none bg-transparent text-[13px] font-semibold text-text-main placeholder-text-muted/40 focus:outline-none focus:ring-0 p-0 m-0 leading-relaxed overflow-hidden"
                    rows={1}
                  />
                  
                  {/* ICON BÚT CHÌ (Hoặc Ổ khóa phụ mờ mờ) */}
                  <div className={`absolute bottom-2 right-2 transition-opacity duration-300 ${isSelected ? 'opacity-100' : 'opacity-0'}`}>
                    {bubble.isLocked 
                      ? <Lock className="w-3.5 h-3.5 text-amber-500/50" /> 
                      : <PenTool className="w-3.5 h-3.5 text-primary/50" />
                    }
                  </div>
                </div>
              </div>

              {/* ========================================================= */}
              {/* NÚT TRỢ LÝ AI (TÀNG HÌNH) */}
              {/* ========================================================= */}
              <div 
                className={`pl-9 flex transition-all duration-300 ease-out overflow-hidden
                  ${isSelected || isAIExpanded ? 'opacity-100 max-h-20 mt-2' : 'opacity-0 max-h-0 pointer-events-none'}
                `}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedAIBubbleId(isAIExpanded ? null : bubble.id); }}
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-300 shadow-sm
                    ${isAIExpanded
                      ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                      : 'bg-background text-text-muted border border-border hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/20'
                    }
                  `}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAIExpanded ? 'animate-pulse' : ''}`} />
                  Trợ lý AI
                </button>
              </div>

              {/* 🚀 CHỐNG LAYOUT THRASHING: Hiệu ứng mở rộng bằng CSS Grid */}
              <div
                className={`grid transition-all duration-300 ease-in-out pl-9 ${isAIExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'
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
  const { t } = useTranslation();
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
  const currentFontSize = activeBubble?.fontSize || toolStore.fontSize || 20;
  const currentTextAlign = activeBubble?.textAlign || toolStore.textAlign || 'center';
  const currentFillColor = activeBubble?.fontColor || toolStore.fontColor || '#000000';
  const currentOutlineWidth = activeBubble?.outlineWidth ?? toolStore.outlineWidth ?? 0;
  const currentOutlineColor = activeBubble?.outlineColor || toolStore.outlineColor || '#ffffff';
  const currentHasShadow = activeBubble?.hasShadow ?? toolStore.hasShadow ?? false;

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
      const bubblesToUpdate = allBubbles.filter(bubble => !bubble.isLocked);
      if (bubblesToUpdate.length > 0) {
        // Chỉ lưu lịch sử 1 lần duy nhất trước vòng lặp
        useCanvasStore.getState().saveHistory();
        bubblesToUpdate.forEach((bubble) => {
          updateBubble(bubble.id, { [key]: value }, true);
        });
      }
    }
  };

  // =====================================
  // 🚀 LĂN CHUỘT ĐỂ ĐIỀU CHỈNH CỠ CHỮ NHANH
  // =====================================
  const fontSizeContainerRef = useRef<HTMLDivElement>(null);
  const handleUpdateRef = useRef(handleUpdate);
  handleUpdateRef.current = handleUpdate;

  const currentFontSizeRef = useRef(currentFontSize);
  currentFontSizeRef.current = currentFontSize;

  useEffect(() => {
    const el = fontSizeContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Cuộn lên (deltaY < 0) -> tăng cỡ chữ, cuộn xuống (deltaY > 0) -> giảm cỡ chữ
      // Giữ Shift để đổi bước nhảy (5px thay vì 1px)
      const step = e.shiftKey ? 5 : 1;
      const direction = e.deltaY < 0 ? 1 : -1;
      const newSize = Math.max(6, Math.min(144, currentFontSizeRef.current + direction * step));
      handleUpdateRef.current('fontSize', newSize);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // =====================================
  // 🚀 CHÈN THÊM LOGIC TẠO DÁNG CHỮ Ở ĐÂY
  // =====================================
  const applyTextShape = (shape: 'diamond' | 'block' | 'pyramid' | 'funnel') => {
    if (!effectiveId) return;

    const currentBubble = bubbles.find(b => b.id === effectiveId);
    if (!currentBubble || !currentBubble.text) return;

    const words = currentBubble.text.replace(/\n/g, ' ').split(' ').filter(w => w.trim() !== '');
    const totalWords = words.length;
    if (totalWords <= 2) return;

    let newText = '';

    if (shape === 'diamond') {
      const lines = [];
      if (totalWords <= 4) {
        lines.push(words.slice(0, 1).join(' '));
        lines.push(words.slice(1, totalWords - 1).join(' '));
        lines.push(words.slice(totalWords - 1).join(' '));
      } else {
        const chunk = Math.ceil(totalWords / 4);
        lines.push(words.slice(0, chunk - 1).join(' '));
        lines.push(words.slice(chunk - 1, chunk * 2).join(' '));
        lines.push(words.slice(chunk * 2, chunk * 3 + 1).join(' '));
        lines.push(words.slice(chunk * 3 + 1).join(' '));
      }
      newText = lines.filter(l => l.trim() !== '').join('\n');
    }
    else if (shape === 'block') {
      const idealWordsPerLine = Math.ceil(Math.sqrt(totalWords));
      for (let i = 0; i < totalWords; i += idealWordsPerLine) {
        newText += words.slice(i, i + idealWordsPerLine).join(' ') + '\n';
      }
      newText = newText.trim();
    }
    else if (shape === 'pyramid') {
      const lines = [];
      let currentWordIndex = 0;
      let wordsInCurrentLine = 1;
      while (currentWordIndex < totalWords) {
        lines.push(words.slice(currentWordIndex, currentWordIndex + wordsInCurrentLine).join(' '));
        currentWordIndex += wordsInCurrentLine;
        wordsInCurrentLine++;
      }
      newText = lines.join('\n');
    }
    else if (shape === 'funnel') {
      const lines = [];
      let currentWordIndex = 0;
      let wordsInCurrentLine = Math.ceil(Math.sqrt(totalWords * 2));
      while (currentWordIndex < totalWords && wordsInCurrentLine > 0) {
        lines.push(words.slice(currentWordIndex, currentWordIndex + wordsInCurrentLine).join(' '));
        currentWordIndex += wordsInCurrentLine;
        wordsInCurrentLine--;
      }
      if (currentWordIndex < totalWords) {
        lines[lines.length - 1] += ' ' + words.slice(currentWordIndex).join(' ');
      }
      newText = lines.join('\n');
    }

    updateBubble(effectiveId, { text: newText });
  };
  // =====================================

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
        {/* 🚀 CONTEXT BANNER & NÚT ĐỒNG BỘ (ĐƯỢC THIẾT KẾ LẠI CHUẨN UX) */}
        {/* ========================================================= */}
        <div className="space-y-2 mb-4">
          
          {/* 1. KHỐI BANNER CHÍNH */}
          <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border shadow-sm transition-colors duration-300 ${isGlobal ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-md ${isGlobal ? 'bg-primary/20' : 'bg-emerald-500/20'}`}>
                {isGlobal ? <Globe className="w-4 h-4" /> : <MousePointer2 className="w-4 h-4" />}
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider leading-none mb-1">
                  {isGlobal ? t('rightSidebar.globalConfig') : t('rightSidebar.editingSingleBubble')}
                </span>
                <span className="text-[9px] font-medium opacity-70 leading-none">
                  {isGlobal ? t('rightSidebar.globalConfigDesc') : t('rightSidebar.editingSingleBubbleDesc')}
                </span>
              </div>
            </div>

            {/* CÁC NÚT BÊN PHẢI BANNER */}
            <div className="flex items-center gap-1.5">
              {isGlobal ? (
                /* NÚT RESET (CHỈ HIỆN Ở GLOBAL) */
                <button
                  onClick={() => {
                    useToolStore.setState({
                      fontFamily: 'Comic Neue', fontSize: 20, textAlign: 'center',
                      fontColor: '#000000', outlineWidth: 5, outlineColor: '#ffffff', hasShadow: false
                    });
                  }}
                  className="flex items-center justify-center p-2 bg-primary/10 hover:bg-primary/30 text-primary rounded-lg transition-colors cursor-pointer active:scale-95 shadow-sm border border-primary/20"
                  title={t('rightSidebar.resetTooltip')}
                >
                  <RefreshCcw size={14} strokeWidth={2.5} />
                </button>
              ) : (
                /* NÚT LOCAL: KHÓA VÀ BỎ CHỌN (CHỈ HIỆN KHI BẤM VÀO 1 Ô THOẠI) */
                <>
                  <button
                    onClick={() => handleUpdate('isLocked', !activeBubble?.isLocked)}
                    className={`flex items-center justify-center p-1.5 rounded-md transition-all cursor-pointer shadow-sm border ${activeBubble?.isLocked
                      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 border-amber-500/30'
                      : 'bg-background hover:bg-border text-text-muted border-border'
                      }`}
                    title={activeBubble?.isLocked ? t('rightSidebar.unlockBubble') : t('rightSidebar.lockBubble')}
                  >
                    {activeBubble?.isLocked ? <Lock size={12} strokeWidth={3} /> : <Unlock size={12} />}
                  </button>

                  <button
                    onClick={() => {
                      useCanvasStore.getState().setActiveBubble(null);
                      setEffectiveId(null);
                    }}
                    className="flex items-center gap-1 px-2 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-600 rounded-md transition-colors cursor-pointer active:scale-95 shadow-sm border border-emerald-500/30"
                    title={t('rightSidebar.deselectTooltip')}
                  >
                    <span className="text-[9px] font-bold uppercase">{t('rightSidebar.deselectBtn')}</span>
                    <X size={12} strokeWidth={3} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 2. 🚀 NÚT "ÁP DỤNG TOÀN TRANG" ĐƯỢC TÁCH RIÊNG (FULL WIDTH) */}
          {isGlobal && (
            <button
              onClick={() => {
                const toolState = useToolStore.getState();
                const allBubbles = useCanvasStore.getState().bubbles;
                let count = 0;
                
                allBubbles.forEach((bubble) => {
                  if (!bubble.isLocked) {
                    useCanvasStore.getState().updateBubble(bubble.id, {
                      fontFamily: toolState.fontFamily,
                      fontSize: toolState.fontSize,
                      textAlign: toolState.textAlign as any,
                      fontColor: toolState.fontColor,
                      outlineWidth: toolState.outlineWidth,
                      outlineColor: toolState.outlineColor,
                      hasShadow: toolState.hasShadow
                    });
                    count++;
                  }
                });
                
                if (count > 0) {
                  toast.success(t('rightSidebar.applySuccess', { count }), { icon: '✨' });
                } else {
                  toast.error(t('rightSidebar.applyNoBubbles'));
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl transition-all cursor-pointer active:scale-[0.98] shadow-md font-bold group"
            >
              <PaintBucket size={14} strokeWidth={2.5} className="group-hover:animate-bounce" />
              <span className="text-[11px] uppercase tracking-widest">{t('rightSidebar.syncAllBtn')}</span>
            </button>
          )}
        </div>

        {/* ========================================================= */}
        {/* 🚀 KHU VỰC PREVIEW TEXT (XEM TRƯỚC) */}
        {/* ========================================================= */}
        <section className="mt-2 mb-2">
          <SectionHeader title={t('rightSidebar.previewTitle')} />
          <div className="relative w-full h-28 bg-[#1a1a1a] border border-border/80 rounded-xl overflow-hidden flex items-center justify-center p-4 shadow-inner">
            {/* Nền Caro (Checkerboard) */}
            <div 
              className="absolute inset-0 opacity-20 pointer-events-none" 
              style={{ 
                backgroundImage: 'repeating-linear-gradient(45deg, #404040 25%, transparent 25%, transparent 75%, #404040 75%, #404040), repeating-linear-gradient(45deg, #404040 25%, #1a1a1a 25%, #1a1a1a 75%, #404040 75%, #404040)', 
                backgroundPosition: '0 0, 8px 8px', 
                backgroundSize: '16px 16px' 
              }}
            />
            {/* Vùng chứa chữ Preview (ĐÃ DÙNG SVG ĐỂ KHỬ GAI VÀ CẮT CHỮ THÔNG MINH) */}
            <div className="relative z-10 w-full h-full flex items-center justify-center overflow-hidden pointer-events-none">
              <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                <text
                  x="50%"
                  y="50%"
                  dominantBaseline="middle"
                  textAnchor="middle"
                  fill={currentFillColor}
                  stroke={currentOutlineColor}
                  strokeWidth={currentOutlineWidth}
                  strokeLinejoin="round"    /* Khử gai triệt để */
                  paintOrder="stroke fill"  /* Ép viền chui xuống dưới ruột chữ */
                  style={{
                    fontFamily: currentFontFamily,
                    fontSize: `${Math.min(currentFontSize, 28)}px`,
                    fontWeight: 800,
                    textShadow: currentHasShadow ? '3px 3px 6px rgba(0,0,0,0.8)' : 'none',
                  }}
                >
                  {/* 🚀 BÍ QUYẾT 3: Cắt chữ thông minh (Lấy dòng 1, tối đa 20 ký tự) */}
                  {activeBubble?.text 
                    ? (activeBubble.text.split('\n')[0].length > 20 
                        ? activeBubble.text.split('\n')[0].slice(0, 20) + '...' 
                        : activeBubble.text.split('\n')[0]) 
                    : 'DeepKoma Preview'}
                </text>
              </svg>
            </div>
          </div>
        </section>

        {/* ==================== SECTION: TYPOGRAPHY ==================== */}
        <section>
          <SectionHeader title={t('rightSidebar.typographyTitle')} />

          <div className="space-y-2">
            {/* Dropdown Chọn Font */}
            {/* Dropdown Chọn Font (Phân nhóm chuyên nghiệp) */}
            <div className="relative group">
              <select
                value={currentFontFamily}
                onChange={(e) => handleUpdate('fontFamily', e.target.value)}
                className="w-full appearance-none bg-background border border-border rounded-lg py-2 pl-3 pr-8 text-[12px] font-bold text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all shadow-sm cursor-pointer"
              >
                <optgroup label={t('rightSidebar.fontGroupDialogue')}>
                  <option value="Playpen Sans">Playpen Sans</option>
                  <option value="Itim">Itim</option>
                  <option value="Be Vietnam Pro">Be Vietnam Pro</option>
                </optgroup>
                <optgroup label={t('rightSidebar.fontGroupMonologue')}>
                  <option value="Patrick Hand">Patrick Hand</option>
                  <option value="Playwrite VN">Playwrite VN</option>
                  <option value="Caveat">Caveat</option>
                </optgroup>
                <optgroup label={t('rightSidebar.fontGroupShouting')}>
                  <option value="Bangers">Bangers</option>
                  <option value="Bungee">Bungee</option>
                  <option value="Sedgwick Ave Display">Sedgwick Ave Display</option>
                </optgroup>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>

            {/* Dãy nút Căn lề & Kích thước */}
            <div className="flex items-center gap-2">
              <div
                ref={fontSizeContainerRef}
                className="flex-1 flex items-center bg-background border border-border rounded-lg shadow-sm px-2 py-1.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50 transition-all cursor-ns-resize"
                title={t('rightSidebar.fontSizeWheelTooltip', 'Cuộn chuột tại đây để tăng/giảm cỡ chữ nhanh (Giữ Shift để đổi bước nhảy)')}
              >
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
                    title={t('rightSidebar.alignTooltip', { align: align.id })}
                  >
                    <align.icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </GlassPanel>
            </div>
          </div>
          {!isGlobal && (
            <div className="mt-4 pt-3 border-t border-border/50">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2 block">{t('rightSidebar.textShapeTitle')}</span>
              <div className="grid grid-cols-4 gap-2">
                <button onClick={() => applyTextShape('diamond')} className="p-2 bg-background border border-border rounded-lg hover:bg-primary/10 hover:border-primary/30 flex flex-col items-center gap-1.5 transition-all group" title={t('rightSidebar.shapeDiamond')}>
                  <Diamond size={16} className="text-text-muted group-hover:text-primary" />
                  <div className="flex flex-col gap-[2px] items-center">
                    <div className="w-2 h-[2px] bg-text-muted/60 rounded-full"></div>
                    <div className="w-4 h-[2px] bg-text-muted/60 rounded-full"></div>
                    <div className="w-4 h-[2px] bg-text-muted/60 rounded-full"></div>
                    <div className="w-2 h-[2px] bg-text-muted/60 rounded-full"></div>
                  </div>
                </button>
                <button onClick={() => applyTextShape('block')} className="p-2 bg-background border border-border rounded-lg hover:bg-primary/10 hover:border-primary/30 flex flex-col items-center gap-1.5 transition-all group" title={t('rightSidebar.shapeBlock')}>
                  <Square size={16} className="text-text-muted group-hover:text-primary" />
                  <div className="flex flex-col gap-[2px] items-center">
                    <div className="w-4 h-[2px] bg-text-muted/60 rounded-full"></div>
                    <div className="w-4 h-[2px] bg-text-muted/60 rounded-full"></div>
                    <div className="w-4 h-[2px] bg-text-muted/60 rounded-full"></div>
                    <div className="w-4 h-[2px] bg-text-muted/60 rounded-full"></div>
                  </div>
                </button>
                <button onClick={() => applyTextShape('pyramid')} className="p-2 bg-background border border-border rounded-lg hover:bg-primary/10 hover:border-primary/30 flex flex-col items-center gap-1.5 transition-all group" title={t('rightSidebar.shapePyramid')}>
                  <Triangle size={16} className="text-text-muted group-hover:text-primary" />
                  <div className="flex flex-col gap-[2px] items-center">
                    <div className="w-2 h-[2px] bg-text-muted/60 rounded-full"></div>
                    <div className="w-3.5 h-[2px] bg-text-muted/60 rounded-full"></div>
                    <div className="w-5 h-[2px] bg-text-muted/60 rounded-full"></div>
                  </div>
                </button>
                <button onClick={() => applyTextShape('funnel')} className="p-2 bg-background border border-border rounded-lg hover:bg-primary/10 hover:border-primary/30 flex flex-col items-center gap-1.5 transition-all group" title={t('rightSidebar.shapeFunnel')}>
                  <Triangle size={16} className="text-text-muted group-hover:text-primary rotate-180" />
                  <div className="flex flex-col gap-[2px] items-center">
                    <div className="w-5 h-[2px] bg-text-muted/60 rounded-full"></div>
                    <div className="w-3.5 h-[2px] bg-text-muted/60 rounded-full"></div>
                    <div className="w-2 h-[2px] bg-text-muted/60 rounded-full"></div>
                  </div>
                </button>
              </div>
            </div>
          )}
          {/* ===================================== */}

        </section>

        {/* ĐƯỜNG KẺ NGANG */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent my-4"></div>

        {/* ==================== SECTION: MANGA EFFECTS ==================== */}
        <section>
          <SectionHeader title={t('rightSidebar.effectsTitle')} />

          <div className="space-y-1">
            {/* DÒNG 1: MÀU CHỮ (FILL) */}
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-panel transition-colors group cursor-pointer border border-transparent hover:border-border">
              <div className="flex items-center gap-3">
                <PaintBucket className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                <span className="text-[12px] font-semibold text-text-muted group-hover:text-text-main transition-colors">{t('rightSidebar.fillColor')}</span>
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
                <span className="text-[12px] font-semibold text-text-muted group-hover:text-text-main transition-colors">{t('rightSidebar.strokeColor')}</span>
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
                <span className="text-[12px] font-semibold text-text-muted group-hover:text-text-main transition-colors">{t('rightSidebar.shadowEffect')}</span>
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
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const updateBubble = useCanvasStore(state => state.updateBubble);

  const handleRealAI = async (type: string) => {
    setAiLoading(true); setAiResult('');
    try {
      const payload = { text: bubble.text || "", japanese: bubble.japanese || "", action: type, custom_prompt: type === 'custom' ? instruction : "" };
      const data = await mangaApi.copilotChat(payload);
      setAiResult(data.result);
      if (type === 'custom') setInstruction('');
    } catch (error) { setAiResult(t('rightSidebar.aiError')); }
    finally { setAiLoading(false); }
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-amber-500/5 to-background border border-amber-500/20 shadow-inner" onClick={(e: React.MouseEvent) => e.stopPropagation()}>

      {/* Header của Panel AI */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-500/10 border-b border-amber-500/10">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-widest">
          <Bot size={12} /> {t('rightSidebar.aiCopilotTitle')}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Nút gợi ý (Suggestion Chips) */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'natural', label: t('rightSidebar.aiSuggestionNatural') },
            { id: 'aggressive', label: t('rightSidebar.aiSuggestionAggressive') },
            { id: 'shorten', label: t('rightSidebar.aiSuggestionShorten') },
            { id: 'explain', label: t('rightSidebar.aiSuggestionKanji') }
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
            placeholder={t('rightSidebar.aiInputPlaceholder')}
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
                <RefreshCcw size={12} className="animate-spin" /> {t('rightSidebar.aiDiscussing')}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="bg-background/80 border border-amber-500/20 rounded-lg p-3 text-[12px] text-text-main font-medium leading-relaxed shadow-sm">
                  {aiResult}
                </div>
                <button
                  onClick={() => { updateBubble(bubble.id, { text: aiResult }); setAiResult(''); onClose();
                
                  const { user, deductLocalCredits } = useAuthStore.getState();
                    if (!user?.isPro) {
                      deductLocalCredits(1); // Trừ 1 credit trên UI
                      mangaApi.deductCredits(1).catch(e => console.error("Lỗi trừ tiền:", e)); // Gọi Backend trừ tiền thật
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold text-[11px] uppercase tracking-wider rounded-lg transition-transform active:scale-[0.98] shadow-sm"
                >
                  <Check size={14} strokeWidth={3} /> {t('rightSidebar.aiApplyBtn')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

