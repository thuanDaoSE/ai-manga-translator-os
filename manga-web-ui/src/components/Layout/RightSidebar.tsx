import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sliders, Bot, AlignLeft as ListIcon,
  Type, MoveVertical, Settings2, Wand2,
  MessageSquareDashed, ArrowRight, RefreshCcw, Sparkles,
  MessageCircle, Check, Globe, MousePointer2, ChevronDown, Zap,
  Trash2, PanelRightClose, Minus, Plus, Upload, AlignCenter, AlignLeft, AlignRight, AlignJustify
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useConfigStore } from '../../store/useConfigStore'; // 🚀 Bổ sung kho Cấu hình
import { useProjectStore } from '../../store/useProjectStore'; // 🚀 Bổ sung kho Dự án
import { mangaApi } from '../../services/api';
import { loadAllSavedFonts } from '../../utils/fontManager';

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
        {activeTab === 'design' && <DesignInspector activeId={activeBubbleId} />}
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

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 mt-6 first:mt-2">
      <span className="font-bold text-[10px] uppercase tracking-[0.2em] text-text-muted">
        {title}
      </span>
      <div className="flex-1 h-[1px] bg-gradient-to-r from-border to-transparent ml-4" />
    </div>
  );
}

// --- 1. TAB DESIGN ---
function DesignInspector({ activeId }: { activeId: string | null }) {
  const toolStore = useToolStore();
  const { bubbles, updateBubble } = useCanvasStore();

  const [serverFonts, setServerFonts] = useState<string[]>([]);
  const [customFonts, setCustomFonts] = useState<string[]>([]);

  // QUẢN LÝ DROPDOWN FONT
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const fontDropdownRef = useRef<HTMLDivElement>(null);

  // ĐÓNG MENU KHI CLICK RA NGOÀI
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(event.target as Node)) {
        setIsFontDropdownOpen(false);
      }
    };
    if (isFontDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFontDropdownOpen]);

  useEffect(() => {
    mangaApi.getFonts().then(data => {
      if (data.fonts) setServerFonts(data.fonts.map((f: string) => f.replace(/\.[^/.]+$/, "")));
    }).catch(() => { });
    loadAllSavedFonts().then(fonts => setCustomFonts(fonts)).catch(() => { });
  }, []);

  const activeBubble = activeId ? bubbles.find(b => b.id === activeId) : null;
  const isGlobal = !activeId || !activeBubble;

  const currentFont = isGlobal ? toolStore.fontFamily : (activeBubble.fontFamily || toolStore.fontFamily);
  const currentSize = isGlobal ? toolStore.fontSize : (activeBubble.fontSize || toolStore.fontSize);
  const currentColor = isGlobal ? toolStore.fontColor : (activeBubble.fontColor || toolStore.fontColor);

  const handleFontChange = (newFont: string) => {
    if (isGlobal) toolStore.setFontFamily(newFont);
    else if (activeId) updateBubble(activeId, { fontFamily: newFont });
  };

  const handleSizeChange = (newSize: number) => {
    if (isGlobal) toolStore.setFontSize(newSize);
    else if (activeId) updateBubble(activeId, { fontSize: newSize });
  };

  const handleColorChange = (newColor: string) => {
    if (isGlobal) toolStore.setFontColor(newColor);
    else if (activeId) updateBubble(activeId, { fontColor: newColor });
  };

  const handleMassApply = () => {
    if (bubbles.length === 0) return toast.error("Chưa có ô thoại nào trên ảnh!");
    bubbles.forEach(b => {
      updateBubble(b.id, {
        fontFamily: toolStore.fontFamily,
        fontSize: toolStore.fontSize,
        fontColor: toolStore.fontColor
      });
    });
    toast.success(`Đã đồng bộ diện mạo cho ${bubbles.length} ô chữ!`);
  };

  return (
    <div className="flex flex-col pb-8 animate-in fade-in slide-in-from-right-4 duration-500 ease-out">

      {/* BANNER NGỮ CẢNH */}
      <div className="px-4 pt-5 pb-2">
        {isGlobal ? (
          <div className="relative p-[1px] rounded-2xl bg-gradient-to-b from-purple-500/40 via-purple-500/10 to-transparent group overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-[40px] pointer-events-none" />
            <div className="relative bg-panel/90 backdrop-blur-xl rounded-[15px] p-4 flex flex-col gap-4 shadow-inner">
              <div className="flex items-start gap-3 relative z-10">
                <div className="p-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400 shrink-0 mt-0.5">
                  <Globe size={16} />
                </div>
                <div>
                  <h3 className="text-[12px] font-extrabold text-purple-400 uppercase tracking-wider drop-shadow-sm">
                    Cài Đặt Mặc Định
                  </h3>
                  <p className="text-[10.5px] text-text-muted mt-1 leading-relaxed">
                    Được áp dụng cho tất cả chữ tạo mới hoặc AI dịch từ bây giờ.
                  </p>
                </div>
              </div>
              <button
                onClick={handleMassApply}
                className="relative w-full py-2.5 rounded-xl font-bold text-[11px] text-white flex items-center justify-center gap-2 transition-all duration-300 overflow-hidden group/btn bg-purple-600 hover:bg-purple-500 active:scale-[0.97] shadow-md"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-[-100%] group-hover/btn:translate-y-[100%] transition-transform duration-700 ease-in-out" />
                <Sparkles size={14} className="relative z-10" />
                <span className="relative z-10 tracking-wide">Đồng bộ tất cả Text</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative p-[1px] rounded-2xl bg-gradient-to-b from-emerald-500/40 via-teal-500/10 to-transparent overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/20 rounded-full blur-[30px] pointer-events-none" />
            <div className="relative bg-panel/90 backdrop-blur-xl rounded-[15px] p-3.5 flex items-start gap-3 shadow-inner">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 shrink-0 mt-0.5">
                <MousePointer2 size={16} />
              </div>
              <div>
                <h3 className="text-[12px] font-extrabold text-emerald-400 uppercase tracking-wider">
                  Thiết Kế Cục Bộ
                </h3>
                <p className="text-[10px] text-text-muted mt-1 leading-relaxed">
                  Chỉ thay đổi thông số cho bong bóng thoại đang được chọn.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <SectionHeader title="Typography Matrix" />

      <div className="px-5 py-2 space-y-4">

        {/* Ô CHỌN FONT VÀ NÚT TẢI FONT */}
        <div className="flex items-center gap-2">

          {/* CUSTOM FONT DROPDOWN BẢN PRO */}
          <div className="relative flex-1" ref={fontDropdownRef}>
            {/* TRIGGER BUTTON */}
            <div
              onClick={() => setIsFontDropdownOpen(!isFontDropdownOpen)}
              className={`flex items-center bg-background border rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-300 ${isFontDropdownOpen ? 'border-primary ring-1 ring-primary/50' : 'border-border hover:border-primary/50'
                }`}
            >
              <Type size={14} className={`mr-2.5 shrink-0 transition-colors ${isFontDropdownOpen ? 'text-primary' : 'text-text-muted'}`} />

              {/* Hiển thị tên font bằng CHÍNH FONT ĐÓ */}
              <span
                className="flex-1 text-[13px] text-text-main truncate"
                style={{ fontFamily: currentFont }}
              >
                {currentFont.replace(/['"]/g, '').split(',')[0]}
              </span>

              <ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform duration-300 ${isFontDropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* DROPDOWN MENU */}
            <div
              className={`absolute top-[calc(100%+8px)] left-0 w-full bg-panel border border-border shadow-2xl rounded-xl overflow-hidden z-[100] transition-all duration-200 origin-top ${isFontDropdownOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
                }`}
            >
              <div className="max-h-[240px] overflow-y-auto custom-scrollbar py-1">

                {/* NHÓM FONT CÀI ĐẶT (CUSTOM) */}
                {customFonts.length > 0 && (
                  <div>
                    <div className="sticky top-0 bg-panel/95 backdrop-blur-sm px-3 py-1.5 text-[9px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5 z-10 border-b border-border/50">
                      <span>⭐</span> Font Tự Cài
                    </div>
                    {customFonts.map((f, i) => (
                      <div
                        key={`c-${i}`}
                        onClick={() => { handleFontChange(f); setIsFontDropdownOpen(false); }}
                        className={`px-4 py-2.5 cursor-pointer flex items-center justify-between transition-colors ${currentFont === f ? 'bg-primary/10 text-primary' : 'text-text-main hover:bg-background/80'}`}
                      >
                        <span className="text-[14px] truncate" style={{ fontFamily: f }}>{f}</span>
                        {currentFont === f && <Check size={14} className="text-primary shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}

                {/* NHÓM FONT HỆ THỐNG */}
                {serverFonts.length > 0 && (
                  <div>
                    <div className="sticky top-0 bg-panel/95 backdrop-blur-sm px-3 py-1.5 text-[9px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5 z-10 border-b border-border/50">
                      <span>☁️</span> Font Đám Mây
                    </div>
                    {serverFonts.map((f, i) => (
                      <div
                        key={`s-${i}`}
                        onClick={() => { handleFontChange(f); setIsFontDropdownOpen(false); }}
                        className={`px-4 py-2.5 cursor-pointer flex items-center justify-between transition-colors ${currentFont === f ? 'bg-primary/10 text-primary' : 'text-text-main hover:bg-background/80'}`}
                      >
                        <span className="text-[14px] truncate" style={{ fontFamily: f }}>{f}</span>
                        {currentFont === f && <Check size={14} className="text-primary shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}

                {/* NHÓM MẶC ĐỊNH */}
                <div>
                  <div className="sticky top-0 bg-panel/95 backdrop-blur-sm px-3 py-1.5 text-[9px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5 z-10 border-b border-border/50">
                    <span>📱</span> Mặc Định
                  </div>
                  {[
                    { name: 'Comic Neue', val: "'Comic Neue', cursive" },
                    { name: 'Arial', val: "Arial, sans-serif" }
                  ].map((f) => (
                    <div
                      key={f.name}
                      onClick={() => { handleFontChange(f.val); setIsFontDropdownOpen(false); }}
                      className={`px-4 py-2.5 cursor-pointer flex items-center justify-between transition-colors ${currentFont === f.val ? 'bg-primary/10 text-primary' : 'text-text-main hover:bg-background/80'}`}
                    >
                      <span className="text-[14px] truncate" style={{ fontFamily: f.val }}>{f.name}</span>
                      {currentFont === f.val && <Check size={14} className="text-primary shrink-0" />}
                    </div>
                  ))}
                </div>

              </div>
            </div>
          </div>

          {/* NÚT TẢI FONT LÊN ĐƯỢC CHUYỂN VỀ ĐÂY */}
          <input
            type="file"
            id="font-upload-input-sidebar"
            accept=".ttf,.otf"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                toast.loading("Đang tải font lên Server...", { id: "uploadFont" });
                await mangaApi.uploadFont(file);
                toast.success("Thêm Font thành công! Bấm F5 để tải lại Web nhé.", { id: "uploadFont" });
              } catch (error: any) {
                toast.error(error.message || "Lỗi tải font", { id: "uploadFont" });
              }
            }}
          />
          <button
            onClick={() => document.getElementById('font-upload-input-sidebar')?.click()}
            className="flex items-center justify-center p-2.5 h-[34px] bg-background border border-border hover:border-primary/50 hover:text-primary text-text-muted rounded-xl transition-all cursor-pointer shadow-sm shrink-0"
            title="Tải font chữ mới (.ttf, .otf) lên"
          >
            <Upload size={14} />
          </button>

        </div>

        <div className="flex gap-3">
          {/* UI MỚI: STEPPER ĐIỀU CHỈNH FONT SIZE TỐI ƯU UX */}
          <div className="flex items-center bg-background border border-border rounded-xl focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50 transition-all group w-1/2 overflow-hidden h-[34px]">
            <span className="text-text-muted text-[10px] uppercase tracking-wider font-bold pl-3 pr-1 group-focus-within:text-primary transition-colors select-none">
              Size
            </span>

            <div className="flex flex-1 items-center justify-end h-full">
              {/* Nút Giảm */}
              <button
                onClick={() => handleSizeChange(Math.max(8, currentSize - 2))}
                className="h-full px-2.5 flex items-center justify-center text-text-muted hover:text-white hover:bg-border/60 transition-colors cursor-pointer active:bg-border"
                title="Giảm cỡ chữ (-2)"
              >
                <Minus size={12} strokeWidth={3} />
              </button>

              {/* Ô Nhập Số */}
              <input
                type="number"
                value={currentSize}
                onChange={(e) => handleSizeChange(Number(e.target.value))}
                className="bg-transparent w-8 outline-none text-text-main font-mono text-[13px] text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />

              {/* Nút Tăng */}
              <button
                onClick={() => handleSizeChange(Math.min(150, currentSize + 2))}
                className="h-full px-2.5 flex items-center justify-center text-text-muted hover:text-white hover:bg-border/60 transition-colors cursor-pointer active:bg-border"
                title="Tăng cỡ chữ (+2)"
              >
                <Plus size={12} strokeWidth={3} />
              </button>
            </div>
          </div>

          <div className="flex items-center bg-panel border border-border rounded-xl px-3 py-2 w-1/2 opacity-60 cursor-not-allowed">
            <MoveVertical size={13} className="text-text-muted mr-2 shrink-0" />
            <input type="text" value="Auto" className="bg-transparent w-full outline-none text-text-muted font-mono text-[12px]" disabled title="Tính năng Line-height đang phát triển" />
          </div>
        </div>
      </div>
      {/* 🚀 BỘ NÚT CĂN LỀ */}
      <div className="px-5 py-2 mb-2">
        <div className="flex items-center justify-between p-2 bg-background border border-border rounded-xl">
          <span className="text-text-muted font-bold text-[11px] tracking-wide pl-2">Căn lề (Align)</span>
          <div className="flex items-center gap-1 bg-panel p-1 rounded-lg border border-border/50">
            {/* Căn Trái */}
            <button
              onClick={() => activeId && updateBubble(activeId, { textAlign: 'left' })}
              className={`p-1.5 rounded-md transition-colors ${activeBubble?.textAlign === 'left' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border'}`}
              title="Căn trái"
            >
              <AlignLeft size={14} />
            </button>
            {/* Căn Giữa (Mặc định) */}
            <button
              onClick={() => activeId && updateBubble(activeId, { textAlign: 'center' })}
              className={`p-1.5 rounded-md transition-colors ${(!activeBubble?.textAlign || activeBubble?.textAlign === 'center') ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border'}`}
              title="Căn giữa"
            >
              <AlignCenter size={14} />
            </button>
            {/* Căn Phải */}
            <button
              onClick={() => activeId && updateBubble(activeId, { textAlign: 'right' })}
              className={`p-1.5 rounded-md transition-colors ${activeBubble?.textAlign === 'right' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border'}`}
              title="Căn phải"
            >
              <AlignRight size={14} />
            </button>
            {/* Căn Đều */}
            <button
              onClick={() => activeId && updateBubble(activeId, { textAlign: 'justify' })}
              className={`p-1.5 rounded-md transition-colors ${activeBubble?.textAlign === 'justify' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-border'}`}
              title="Căn đều 2 bên"
            >
              <AlignJustify size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* (Giữ nguyên mục Visual Appearance cũ ở bên dưới) */}

      <SectionHeader title="Visual Appearance" />

      <div className="px-5 py-2">
        <div className="flex items-center justify-between p-3 bg-background border border-border rounded-xl transition-colors">
          <span className="text-text-muted font-bold text-[11px] tracking-wide">Màu chữ (Fill)</span>
          <div className="flex items-center gap-3">
            <div className="relative w-7 h-7 rounded-full overflow-hidden border-2 border-border shadow-inner group cursor-pointer hover:scale-110 transition-transform">
              <input
                type="color"
                value={currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer"
              />
            </div>
            <input
              type="text"
              value={currentColor.toUpperCase()}
              readOnly
              className="bg-transparent w-16 text-right outline-none font-mono text-text-main text-[12px] uppercase tracking-wider"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- 2. TAB DIALOGUE LIST TÍCH HỢP AI TRỢ LÝ ---
function DialogueListTab({ activeId }: { activeId: string | null }) {
  const { bubbles, setActiveBubble, removeBubble, updateBubble } = useCanvasStore();
  const setConfigModalOpen = useConfigStore(state => state.setModalOpen);
  const itemRefs = useRef(new Map());

  // 🚀 STATE MỚI: Trí nhớ xem thẻ thoại nào đang mở bảng AI
  const [expandedAIBubbleId, setExpandedAIBubbleId] = useState<string | null>(null);

  // Cuộn đến thẻ thoại đang chọn
  useEffect(() => {
    if (activeId) {
      const node = itemRefs.current.get(activeId);
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeId]);

  // 🚀 TÍNH NĂNG 1: NÚT COPY
  const handleCopy = (text: string, type: string) => {
    if (!text) return toast.error(`Trống không! Không có chữ ${type} để copy.`);
    navigator.clipboard.writeText(text);
    toast.success(`Đã copy câu tiếng ${type} vào khay nhớ tạm!`, { icon: '📋' });
  };

  // 🚀 TÍNH NĂNG 2: NÚT DỊCH LẠI (Dùng chung bộ não Copilot cho nhanh)
  const handleRetryTranslation = async (e: React.MouseEvent, bubble: any) => {
    e.stopPropagation();
    const loadId = toast.loading("Đang nhờ AI dịch lại câu này...");
    try {
      const payload = {
        text: bubble.text || "",
        japanese: bubble.japanese || "",
        action: "natural", // Mặc định dịch lại bằng văn phong tự nhiên
        custom_prompt: ""
      };
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/copilot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Lỗi API");
      const data = await response.json();
      updateBubble(bubble.id, { text: data.result }); // Cập nhật ngay lên hình
      toast.success("Dịch lại thành công!", { id: loadId });
    } catch (err) {
      toast.error("Lỗi mạng khi dịch lại!", { id: loadId });
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-500 ease-out pb-20">

      {/* 🚀 TÍNH NĂNG 3: NÚT MỞ CẤU HÌNH GỌN GÀNG TRÊN HEADER */}
      <div className="p-4 bg-panel/90 backdrop-blur-md sticky top-0 z-10 border-b border-border shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListIcon size={14} className="text-text-muted" />
          <h2 className="text-[10px] font-bold text-text-muted tracking-[0.2em] uppercase">Kịch bản thoại</h2>
        </div>
        <button
          onClick={() => setConfigModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-lg transition-colors text-[10px] font-bold uppercase tracking-wider cursor-pointer"
          title="Mở bảng cấu hình Prompt cho AI"
        >
          <Settings2 size={12} /> Cấu hình AI
        </button>
      </div>

      <div className="flex-1 p-3 space-y-3">
        {bubbles.map((bubble, i) => {
          const isSelected = activeId === bubble.id;
          const isAIExpanded = expandedAIBubbleId === bubble.id;

          return (
            <div
              key={bubble.id}
              ref={(node) => { if (node) itemRefs.current.set(bubble.id, node); }}
              onClick={() => setActiveBubble(bubble.id)}
              className={`group relative p-3 rounded-xl cursor-pointer transition-all duration-300 ease-out border overflow-hidden ${isSelected
                ? 'bg-primary/10 border-primary/50 shadow-sm translate-x-1'
                : 'bg-background border-border hover:bg-border/50 hover:-translate-y-[1px]'
                }`}
            >
              {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-sm" />}

              {/* PHẦN HEADER CỦA TỪNG BUBBLE */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <MessageCircle size={14} className={isSelected ? 'text-primary' : 'text-text-muted group-hover:text-text-main transition-colors'} />
                  <span className={`text-[9px] font-bold uppercase tracking-[0.15em] ${isSelected ? 'text-primary' : 'text-text-muted'}`}>
                    Hội thoại {String(i + 1).padStart(2, '0')}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {/* 🚀 THANH CÔNG CỤ ẨN (CHỈ HIỆN KHI HOVER HOẶC CHỌN) */}
                  <div className={`flex items-center gap-1 transition-opacity duration-200 ${isSelected || isAIExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button onClick={(e) => { e.stopPropagation(); handleCopy((bubble as any).japanese, 'Nhật'); }} className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Copy Tiếng Nhật gốc">
                      <span className="text-[9px] font-black uppercase">JP</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleCopy(bubble.text, 'Việt'); }} className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Copy Tiếng Việt đã dịch">
                      <span className="text-[9px] font-black uppercase">VN</span>
                    </button>

                    <div className="w-px h-3 bg-border mx-0.5" />

                    <button onClick={(e) => handleRetryTranslation(e, bubble)} className="p-1.5 text-text-muted hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors" title="Dịch lại ngay">
                      <RefreshCcw size={12} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setExpandedAIBubbleId(isAIExpanded ? null : bubble.id); }} className={`p-1.5 rounded-md transition-colors ${isAIExpanded ? 'text-amber-500 bg-amber-500/10 shadow-sm' : 'text-text-muted hover:text-amber-500 hover:bg-amber-500/10'}`} title="Hỏi Trợ lý AI về câu này">
                      <Wand2 size={12} />
                    </button>
                  </div>

                  <div className="w-px h-3 bg-border mx-1" />

                  <button
                    onClick={(e) => { e.stopPropagation(); removeBubble(bubble.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-md transition-all duration-200"
                    title="Xóa ô thoại này"
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* NỘI DUNG CHỮ */}
              <div className="space-y-2 pl-1 relative z-10">
                <p className="text-[10px] text-text-muted font-medium line-clamp-2 leading-relaxed bg-panel/50 p-2 rounded-md border border-border">
                  {(bubble as any).japanese || "Đang chờ chữ..."}
                </p>
                <p className={`text-[12px] leading-snug tracking-wide ${isSelected ? 'text-text-main font-bold' : 'text-text-main'}`}>
                  {bubble.text || "Đang chờ dịch..."}
                </p>
              </div>

              {/* 🚀 TÍNH NĂNG 4: AI NỘI TUYẾN (THẢ XUỐNG KHI BẤM NÚT WAND) */}
              {isAIExpanded && (
                <div className="mt-3 pt-3 border-t border-border/50 animate-in slide-in-from-top-2 fade-in duration-300" onClick={e => e.stopPropagation()}>
                  <InlineAIAssistant bubble={bubble} onClose={() => setExpandedAIBubbleId(null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 🚀 COMPONENT AI NỘI TUYẾN MỚI TINH
function InlineAIAssistant({ bubble, onClose }: { bubble: any, onClose: () => void }) {
  const [instruction, setInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const updateBubble = useCanvasStore(state => state.updateBubble);

  const handleRealAI = async (type: string) => {
    setAiLoading(true); setAiResult('');
    try {
      const payload = {
        text: bubble.text || "",
        japanese: bubble.japanese || "",
        action: type,
        custom_prompt: type === 'custom' ? instruction : ""
      };

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/copilot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("API Lỗi");
      const data = await response.json();
      setAiResult(data.result);
      if (type === 'custom') setInstruction('');
    } catch (error) {
      setAiResult("❌ Lỗi kết nối AI!");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="bg-panel/80 backdrop-blur-sm border border-border rounded-xl p-3 shadow-inner cursor-default">
      <div className="flex items-center gap-1.5 mb-3">
        <Bot size={14} className="text-amber-500" />
        <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">Trợ lý AI</span>
      </div>

      {/* Các nút thao tác nhanh siêu nhỏ */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { id: 'aggressive', label: 'Hầm hố', icon: '🤬', color: 'hover:border-red-500/50 hover:bg-red-500/10' },
          { id: 'natural', label: 'Tự nhiên', icon: '🍃', color: 'hover:border-green-500/50 hover:bg-green-500/10' },
          { id: 'shorten', label: 'Rút gọn', icon: '✂️', color: 'hover:border-blue-500/50 hover:bg-blue-500/10' },
          { id: 'explain', label: 'Giải nghĩa', icon: '🧐', color: 'hover:border-amber-500/50 hover:bg-amber-500/10 text-amber-500' }
        ].map(btn => (
          <button
            key={btn.id}
            onClick={() => handleRealAI(btn.id)}
            className={`px-2 py-1.5 text-[10px] font-semibold bg-background border border-border text-text-main rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${btn.color}`}
          >
            <span>{btn.icon}</span> <span>{btn.label}</span>
          </button>
        ))}
      </div>

      {/* Ô nhập lệnh tùy chỉnh */}
      <div className="relative mb-3">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRealAI('custom'); }}
          placeholder="Bảo AI sửa câu này thành..."
          className="w-full bg-background border border-border rounded-lg py-2 pl-2.5 pr-8 text-[11px] text-text-main placeholder-text-muted focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none"
        />
        <button
          onClick={() => handleRealAI('custom')}
          disabled={!instruction.trim() || aiLoading}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-amber-500 disabled:opacity-30 cursor-pointer transition-colors"
        >
          <ArrowRight size={12} />
        </button>
      </div>

      {/* Khung kết quả thả xuống */}
      {(aiLoading || aiResult) && (
        <div className="mt-2 pt-2 border-t border-border/50">
          {aiLoading ? (
            <div className="flex items-center gap-2 text-[10px] text-amber-500/80 p-2 font-medium">
              <RefreshCcw size={12} className="animate-spin" /> Đang thảo luận với AI...
            </div>
          ) : (
            <div className="space-y-2 animate-in fade-in">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-[11px] text-text-main font-medium leading-relaxed">
                {aiResult}
              </div>
              <button
                onClick={() => { updateBubble(bubble.id, { text: aiResult }); setAiResult(''); onClose(); }}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold text-[10px] rounded-lg cursor-pointer transition-all active:scale-[0.98] shadow-sm"
              >
                <Check size={12} strokeWidth={3} /> Đổi chữ trên hình luôn!
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

