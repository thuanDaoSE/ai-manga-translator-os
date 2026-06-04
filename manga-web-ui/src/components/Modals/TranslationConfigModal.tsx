import React, { useEffect, useState, useRef, memo, useCallback } from 'react';
import { useConfigStore } from '../../store/useConfigStore';
import { 
  X, Database, Users, Save, Plus, Trash2, 
  ArrowRight, UploadCloud, Wand2, Loader2, FileJson, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

interface GlossaryItem { id: string; source: string; target: string; }
interface RelationItem { id: string; speaker: string; listener: string; self_ref: string; target_ref: string; }

// --- COMPONENT CON (Giữ nguyên) ---
const GlossaryRow = memo(({ item, onUpdate, onRemove }: { item: GlossaryItem, onUpdate: (item: GlossaryItem) => void, onRemove: (id: string) => void }) => {
  const [source, setSource] = useState(item.source);
  const [target, setTarget] = useState(item.target);
  const handleBlur = () => { if (source !== item.source || target !== item.target) onUpdate({ ...item, source, target }); };
  return (
    <div className="grid grid-cols-[1fr_1fr_40px] gap-px group bg-background hover:bg-panel/50 transition-colors">
      <input type="text" value={source} onChange={(e) => setSource(e.target.value)} onBlur={handleBlur} placeholder="VD: 螺旋丸" className="w-full bg-transparent border-none text-[12px] font-medium text-text-main px-4 py-2.5 focus:outline-none focus:bg-panel/80 placeholder-text-muted/30" />
      <input type="text" value={target} onChange={(e) => setTarget(e.target.value)} onBlur={handleBlur} placeholder="VD: Rasengan" className="w-full bg-transparent border-none text-[12px] font-medium text-text-main px-4 py-2.5 focus:outline-none focus:bg-panel/80 placeholder-text-muted/30" />
      <div className="flex items-center justify-center">
        <button onClick={() => onRemove(item.id)} className="p-1.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger/10 rounded-md transition-all"><Trash2 size={14} /></button>
      </div>
    </div>
  );
});

const RelationRow = memo(({ item, onUpdate, onRemove }: { item: RelationItem, onUpdate: (item: RelationItem) => void, onRemove: (id: string) => void }) => {
  const [speaker, setSpeaker] = useState(item.speaker);
  const [listener, setListener] = useState(item.listener);
  const [selfRef, setSelfRef] = useState(item.self_ref);
  const [targetRef, setTargetRef] = useState(item.target_ref);
  const handleBlur = () => { if (speaker !== item.speaker || listener !== item.listener || selfRef !== item.self_ref || targetRef !== item.target_ref) onUpdate({ ...item, speaker, listener, self_ref: selfRef, target_ref: targetRef }); };
  return (
    <div className="grid grid-cols-[1.5fr_auto_1.5fr_1fr_1fr_40px] gap-px group bg-background hover:bg-panel/50 transition-colors">
      <input type="text" value={speaker} onChange={e => setSpeaker(e.target.value)} onBlur={handleBlur} placeholder="Naruto" className="w-full bg-transparent border-none text-[12px] font-medium text-text-main px-4 py-2.5 focus:outline-none focus:bg-panel/80 placeholder-text-muted/30" />
      <div className="flex items-center justify-center bg-transparent px-2"><ArrowRight className="text-border" size={14} /></div>
      <input type="text" value={listener} onChange={e => setListener(e.target.value)} onBlur={handleBlur} placeholder="Sasuke" className="w-full bg-transparent border-none text-[12px] font-medium text-text-main px-4 py-2.5 focus:outline-none focus:bg-panel/80 placeholder-text-muted/30" />
      <input type="text" value={selfRef} onChange={e => setSelfRef(e.target.value)} onBlur={handleBlur} placeholder="Tớ" className="w-full bg-transparent border-none text-[12px] font-bold text-primary/80 px-4 py-2.5 focus:outline-none focus:bg-primary/10 placeholder-text-muted/30" />
      <input type="text" value={targetRef} onChange={e => setTargetRef(e.target.value)} onBlur={handleBlur} placeholder="Cậu" className="w-full bg-transparent border-none text-[12px] font-bold text-primary/80 px-4 py-2.5 focus:outline-none focus:bg-primary/10 placeholder-text-muted/30" />
      <div className="flex items-center justify-center">
        <button onClick={() => onRemove(item.id)} className="p-1.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger/10 rounded-md transition-all"><Trash2 size={14} /></button>
      </div>
    </div>
  );
});

export default function TranslationConfigModal() {
  const config = useConfigStore();
  const [activeTab, setActiveTab] = useState<'glossary' | 'relations'>('glossary');
  
  const [glossaryList, setGlossaryList] = useState<GlossaryItem[]>([]);
  const [relationList, setRelationList] = useState<RelationItem[]>([]);
  
  const [isAIExtracting, setIsAIExtracting] = useState(false);
  const [showAIInput, setShowAIInput] = useState(false);
  const [aiInputText, setAiInputText] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. CHẠY USE_EFFECT
  useEffect(() => {
    if (config.isModalOpen) {
      const saved = localStorage.getItem('manga_trans_settings');
      if (saved) {
        try {
          const parsedConf = JSON.parse(saved);
          if (parsedConf.glossary && parsedConf.glossary.trim().startsWith('{')) {
            const parsedData = JSON.parse(parsedConf.glossary);
            setGlossaryList(parsedData.terminology || []);
            setRelationList(parsedData.relational_matrix || []);
          }
        } catch (e) { console.warn("Dữ liệu trống."); }
      }
    }
  }, [config.isModalOpen]);

  // 2. KHAI BÁO TẤT CẢ CÁC HOOKS USE_CALLBACK (TRƯỚC KHI RETURN)
  const handleUpdateGlossary = useCallback((updatedItem: GlossaryItem) => setGlossaryList(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item)), []);
  const removeGlossary = useCallback((id: string) => setGlossaryList(prev => prev.filter(g => g.id !== id)), []);
  const handleUpdateRelation = useCallback((updatedItem: RelationItem) => setRelationList(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item)), []);
  const removeRelation = useCallback((id: string) => setRelationList(prev => prev.filter(r => r.id !== id)), []);

  // 🚀 3. LỆNH RETURN SỚM BẮT BUỘC NẰM Ở ĐÂY (SAU KHI ĐÃ GỌI HẾT HOOKS)
  if (!config.isModalOpen) return null;

  // CÁC HÀM XỬ LÝ SỰ KIỆN THÔNG THƯỜNG
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error(`File quá lớn!`); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.terminology) setGlossaryList(prev => [...prev, ...parsed.terminology.map((t: any) => ({ ...t, id: uuidv4() }))]);
        if (parsed.relational_matrix) setRelationList(prev => [...prev, ...parsed.relational_matrix.map((r: any) => ({ ...r, id: uuidv4() }))]);
        toast.success("Đã nạp dữ liệu JSON thành công!");
      } catch (error) { toast.error("Lỗi đọc file JSON."); }
    };
    reader.readAsText(file); e.target.value = ''; 
  };

  const executeAIExtract = () => {
    if (!aiInputText.trim()) { toast.error("Vui lòng dán văn bản tiếng Nhật trước khi phân tích!"); return; }
    setIsAIExtracting(true);
    const toastId = toast.loading("AI đang phân tích văn bản...");
    setTimeout(() => {
      setGlossaryList(prev => [{ id: uuidv4(), source: "新技", target: "Chiêu mới" }, ...prev]);
      setIsAIExtracting(false);
      setShowAIInput(false);
      setAiInputText("");
      toast.success("Đã hoàn tất trích xuất dữ liệu.", { id: toastId });
    }, 2000);
  };

  const handleSave = () => {
    const cleanGlossary = glossaryList.filter(g => g.source.trim() !== '' && g.target.trim() !== '');
    const cleanRelations = relationList.filter(r => r.speaker.trim() !== '' && r.listener.trim() !== '');
    const exportString = JSON.stringify({ terminology: cleanGlossary, relational_matrix: cleanRelations }, null, 2);
    config.setConfig('glossary', exportString);
    config.saveToLocal();
    toast.success("Đã đồng bộ Cơ sở dữ liệu!", { icon: '💾' });
    config.setModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-in fade-in duration-200">
      <div className="bg-sidebar w-full max-w-4xl max-h-[85vh] rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden text-text-main font-sans">
        
        {/* HEADER & TABS */}
        <div className="flex flex-col border-b border-border bg-panel">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-background border border-border rounded-md shadow-inner">
                <Database className="w-4 h-4 text-text-muted" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-main">Hệ thống Quản trị Từ điển</h2>
                <p className="text-[11px] text-text-muted">Cấu trúc hóa dữ liệu cho thuật toán Aho-Corasick</p>
              </div>
            </div>
            <button onClick={() => config.setModalOpen(false)} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md transition-colors"><X size={16} /></button>
          </div>

          <div className="flex items-center justify-between px-5 bg-background border-t border-border/50">
            <div className="flex gap-4">
              <button onClick={() => setActiveTab('glossary')} className={`flex items-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'glossary' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}>
                <FileJson size={14} /> Thuật ngữ ({glossaryList.length})
              </button>
              <button onClick={() => setActiveTab('relations')} className={`flex items-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'relations' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}>
                <Users size={14} /> Xưng hô ({relationList.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-panel border border-border hover:bg-border text-text-muted hover:text-text-main rounded-md text-[11px] font-semibold transition-colors">
                <UploadCloud size={13} /> Nhập JSON
              </button>
              <div className="w-px h-3 bg-border mx-1"></div>
              
              <button 
                onClick={() => setShowAIInput(!showAIInput)} 
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all border ${showAIInput ? 'bg-primary text-white border-primary' : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20'}`}
              >
                <Wand2 size={13} /> {showAIInput ? 'Đóng AI' : 'AI Phân tích'}
              </button>
            </div>
          </div>
        </div>

        {/* 🚀 KHU VỰC NHẬP LIỆU AI */}
        {showAIInput && (
          <div className="bg-panel border-b border-border p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-[11px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Sparkles size={12} /> Dán văn bản cần phân tích
                </label>
                <textarea 
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  placeholder="Dán toàn bộ chữ tiếng Nhật của 1 chapter vào đây. AI sẽ tự động đọc, nhặt ra các Danh từ riêng, Địa danh, Tên chiêu thức và điền vào bảng bên dưới..."
                  className="w-full h-24 bg-background border border-border rounded-lg p-3 text-[12px] text-text-main resize-none focus:outline-none focus:border-primary/50 transition-colors placeholder-text-muted/40 custom-scrollbar"
                />
              </div>
              <div className="w-48 flex flex-col justify-end">
                <p className="text-[10px] text-text-muted mb-3 leading-relaxed">
                  * Trích xuất tốn <strong>5 Credits</strong> mỗi lần.<br/>
                  * Độ dài tối đa: 10,000 ký tự.
                </p>
                <button 
                  onClick={executeAIExtract}
                  disabled={isAIExtracting || !aiInputText.trim()}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary text-white rounded-lg text-[12px] font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {isAIExtracting ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} 
                  {isAIExtracting ? 'Đang chạy AI...' : 'Bắt đầu quét'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BODY TABS */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">
          {activeTab === 'glossary' && (
            <div className="animate-in fade-in duration-200">
              <div className="grid grid-cols-[1fr_1fr_40px] gap-px bg-border text-[10px] font-bold text-text-muted uppercase tracking-widest sticky top-0 z-10 border-b border-border">
                <div className="bg-panel px-4 py-2">Tiếng Nhật (Key)</div>
                <div className="bg-panel px-4 py-2">Tiếng Việt (Value)</div>
                <div className="bg-panel px-2 py-2 text-center">Xóa</div>
              </div>
              <div className="flex flex-col gap-px bg-border/50">
                {glossaryList.map((item) => <GlossaryRow key={item.id} item={item} onUpdate={handleUpdateGlossary} onRemove={removeGlossary} />)}
              </div>
              <div className="p-4">
                <button onClick={() => setGlossaryList([...glossaryList, { id: uuidv4(), source: '', target: '' }])} className="w-full py-2 border border-dashed border-border hover:border-text-muted bg-panel/30 hover:bg-panel text-text-muted hover:text-text-main rounded-lg flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all">
                  <Plus size={14} /> Thêm dòng mới
                </button>
              </div>
            </div>
          )}

          {activeTab === 'relations' && (
            <div className="animate-in fade-in duration-200">
               <div className="grid grid-cols-[1.5fr_auto_1.5fr_1fr_1fr_40px] gap-px bg-border text-[10px] font-bold text-text-muted uppercase tracking-widest sticky top-0 z-10 border-b border-border">
                <div className="bg-panel px-4 py-2">Người nói (A)</div>
                <div className="bg-panel px-2 py-2"></div>
                <div className="bg-panel px-4 py-2">Người nghe (B)</div>
                <div className="bg-panel px-4 py-2 text-primary">A Tự xưng</div>
                <div className="bg-panel px-4 py-2 text-primary">A Gọi B</div>
                <div className="bg-panel px-2 py-2 text-center">Xóa</div>
              </div>
              <div className="flex flex-col gap-px bg-border/50">
                {relationList.map((item) => <RelationRow key={item.id} item={item} onUpdate={handleUpdateRelation} onRemove={removeRelation} />)}
              </div>
              <div className="p-4">
                <button onClick={() => setRelationList([...relationList, { id: uuidv4(), speaker: '', listener: '', self_ref: '', target_ref: '' }])} className="w-full py-2 border border-dashed border-border hover:border-text-muted bg-panel/30 hover:bg-panel text-text-muted hover:text-text-main rounded-lg flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all">
                  <Plus size={14} /> Thêm quy tắc mới
                </button>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 bg-panel border-t border-border flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">PostgreSQL Synced</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => config.setModalOpen(false)} className="px-4 py-2 rounded-md text-[11px] font-bold text-text-muted hover:text-text-main hover:bg-border transition-colors">Hủy</button>
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[11px] font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all active:scale-95">
              <Save size={14} /> Lưu Cấu Hình
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}