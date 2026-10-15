import React, { useEffect, useState, useRef, memo, useCallback } from 'react';
import { useConfigStore, VALID_LANGUAGES } from '../../store/useConfigStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { 
  X, Database, Users, Save, Plus, Trash2, 
  ArrowRight, UploadCloud, Download, Wand2, Loader2, FileJson, Sparkles, ChevronDown,
  Globe, Lock, Cpu, Zap, Search, Layers, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { getAuthHeaders } from '../../services/api';
import { useAuthStore } from '../../store/useAuthStore';

interface GlossaryItem { id: string; source: string; target: string; }
interface RelationItem { id: string; speaker: string; listener: string; self_ref: string; target_ref: string; }

// --- COMPONENT CON THUẬT NGỮ (GLOSSARY) ---
const GlossaryRow = memo(({ item, index, onUpdate, onRemove }: { item: GlossaryItem, index: number, onUpdate: (item: GlossaryItem) => void, onRemove: (id: string) => void }) => {
  const { t } = useTranslation();
  const [source, setSource] = useState(item.source);
  const [target, setTarget] = useState(item.target);
  const handleBlur = () => { if (source !== item.source || target !== item.target) onUpdate({ ...item, source, target }); };
  return (
    <div className="flex items-center gap-3 bg-panel/30 hover:bg-panel/60 p-2.5 rounded-xl border border-border/40 transition-all duration-200 group">
      <div className="text-[10px] font-black text-text-muted w-6 text-center select-none">{String(index + 1).padStart(2, '0')}</div>
      <div className="flex-1 relative">
        <input 
          type="text" 
          value={source} 
          onChange={(e) => setSource(e.target.value)} 
          onBlur={handleBlur} 
          placeholder={t('configModal.sourceJapanesePlaceholder')} 
          className="w-full bg-background/50 border border-border rounded-lg text-xs font-semibold text-text-main px-3 py-2 focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder-text-muted/30" 
        />
      </div>
      <div className="text-text-muted flex items-center justify-center select-none font-bold">➔</div>
      <div className="flex-1 relative">
        <input 
          type="text" 
          value={target} 
          onChange={(e) => setTarget(e.target.value)} 
          onBlur={handleBlur} 
          placeholder={t('configModal.targetVietnamesePlaceholder')} 
          className="w-full bg-background/50 border border-border rounded-lg text-xs font-semibold text-text-main px-3 py-2 focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder-text-muted/30" 
        />
      </div>
      <button 
        type="button"
        onClick={() => onRemove(item.id)} 
        className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all cursor-pointer"
        title={t('configModal.deleteRow')}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
});

// --- COMPONENT CON XƯNG HÔ (RELATIONS) ---
const RelationRow = memo(({ item, index, onUpdate, onRemove }: { item: RelationItem, index: number, onUpdate: (item: RelationItem) => void, onRemove: (id: string) => void }) => {
  const { t } = useTranslation();
  const [speaker, setSpeaker] = useState(item.speaker);
  const [listener, setListener] = useState(item.listener);
  const [selfRef, setSelfRef] = useState(item.self_ref);
  const [targetRef, setTargetRef] = useState(item.target_ref);
  const handleBlur = () => { if (speaker !== item.speaker || listener !== item.listener || selfRef !== item.self_ref || targetRef !== item.target_ref) onUpdate({ ...item, speaker, listener, self_ref: selfRef, target_ref: targetRef }); };
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 bg-panel/30 hover:bg-panel/60 p-3 rounded-xl border border-border/40 transition-all duration-200 group">
      {/* Row Index */}
      <div className="hidden md:block text-[10px] font-black text-text-muted w-6 text-center select-none">{String(index + 1).padStart(2, '0')}</div>
      
      {/* Speaker and Listener */}
      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input 
          type="text" 
          value={speaker} 
          onChange={e => setSpeaker(e.target.value)} 
          onBlur={handleBlur} 
          placeholder={t('configModal.charAPlaceholder')} 
          className="w-full bg-background/50 border border-border rounded-lg text-xs font-semibold text-text-main px-3 py-2 focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder-text-muted/30" 
        />
        <div className="flex items-center justify-center text-text-muted select-none"><ArrowRight size={13} /></div>
        <input 
          type="text" 
          value={listener} 
          onChange={e => setListener(e.target.value)} 
          onBlur={handleBlur} 
          placeholder={t('configModal.charBPlaceholder')} 
          className="w-full bg-background/50 border border-border rounded-lg text-xs font-semibold text-text-main px-3 py-2 focus:border-primary/50 focus:bg-background focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder-text-muted/30" 
        />
      </div>

      <div className="hidden md:block w-px h-5 bg-border/40"></div>

      {/* Pronouns */}
      <div className="w-full md:w-64 grid grid-cols-2 gap-2">
        <div>
          <input 
            type="text" 
            value={selfRef} 
            onChange={e => setSelfRef(e.target.value)} 
            onBlur={handleBlur} 
            placeholder={t('configModal.selfRefPlaceholder')} 
            className="w-full bg-background/50 border border-border rounded-lg text-xs font-bold text-primary px-3 py-2 focus:border-primary focus:bg-background focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder-text-muted/30" 
          />
        </div>
        <div>
          <input 
            type="text" 
            value={targetRef} 
            onChange={e => setTargetRef(e.target.value)} 
            onBlur={handleBlur} 
            placeholder={t('configModal.targetRefPlaceholder')} 
            className="w-full bg-background/50 border border-border rounded-lg text-xs font-bold text-primary px-3 py-2 focus:border-primary focus:bg-background focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder-text-muted/30" 
          />
        </div>
      </div>

      {/* Delete button */}
      <div className="flex items-center justify-end">
        <button 
          type="button"
          onClick={() => onRemove(item.id)} 
          className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all cursor-pointer w-full md:w-auto flex justify-center border border-border/30 md:border-none"
          title={t('configModal.deleteRow')}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
});

export default function TranslationConfigModal() {
  const { t } = useTranslation();
  const config = useConfigStore();
  const { user } = useAuthStore();
  const isPro = user?.isPro || false;
  const [activeTab, setActiveTab] = useState<'glossary' | 'relations'>('glossary');
  
  const [glossaryList, setGlossaryList] = useState<GlossaryItem[]>([]);
  const [relationList, setRelationList] = useState<RelationItem[]>([]);
  
  const [isAIExtracting, setIsAIExtracting] = useState(false);
  const [showAIInput, setShowAIInput] = useState(false);
  const [aiInputText, setAiInputText] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tempSourceLang, setTempSourceLang] = useState(config.sourceLanguage || 'auto');
  const [tempUseGpu, setTempUseGpu] = useState(config.useGpu);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  const sourceLanguages = [
    { code: 'auto', name: '✨ Tự động nhận diện (DeepSeek Auto)' },
    { code: 'ja', name: 'Tiếng Nhật' },
    { code: 'en', name: 'Tiếng Anh' },
    { code: 'zh', name: 'Tiếng Trung' },
    { code: 'ko', name: 'Tiếng Hàn' },
  ];

  // Sync temp states when isModalOpen becomes true
  useEffect(() => {
    if (config.isModalOpen) {
      setTempSourceLang(config.sourceLanguage || 'auto');
      setTempUseGpu(config.useGpu);
    }
  }, [config.isModalOpen, config.sourceLanguage, config.useGpu]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. CHẠY USE_EFFECT ĐỌC DỮ LIỆU CŨ
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

  const handleGrabCurrentPageText = () => {
    const bubbles = useCanvasStore.getState().bubbles || [];
    const japaneseTexts = bubbles
      .map(b => (b.japanese || b.text || '').trim())
      .filter(t => t.length > 0);
      
    if (japaneseTexts.length === 0) {
      toast.error("Không tìm thấy thoại tiếng Nhật nào ở trang hiện tại!");
      return;
    }
    
    const joinedText = japaneseTexts.join('\n');
    setAiInputText(joinedText);
    toast.success(`Đã tự động lấy ${japaneseTexts.length} dòng thoại từ trang hiện tại!`);
  };

  // CÁC HÀM XỬ LÝ SỰ KIỆN THÔNG THƯỜNG
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error(t('configModal.fileTooLargeError')); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.terminology) setGlossaryList(prev => [...prev, ...parsed.terminology.map((t: any) => ({ ...t, id: uuidv4() }))]);
        if (parsed.relational_matrix) setRelationList(prev => [...prev, ...parsed.relational_matrix.map((r: any) => ({ ...r, id: uuidv4() }))]);
        toast.success(t('configModal.importJsonSuccess'));
      } catch (error) { toast.error(t('configModal.importJsonError')); }
    };
    reader.readAsText(file); e.target.value = ''; 
  };

  // HÀM XUẤT FILE JSON ĐỘC QUYỀN
  const handleExportJSON = () => {
    const cleanGlossary = glossaryList.filter(g => g.source.trim() !== '' && g.target.trim() !== '');
    const cleanRelations = relationList.filter(r => r.speaker.trim() !== '' && r.listener.trim() !== '');
    const dataObj = { terminology: cleanGlossary, relational_matrix: cleanRelations };
    
    const fileData = JSON.stringify(dataObj, null, 2);
    const blob = new Blob([fileData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `DeepKoma_Glossary_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(t('configModal.exportJsonSuccess'));
  };

  const executeAIExtract = async () => {
    if (!aiInputText.trim()) { toast.error(t('configModal.aiInputEmptyError')); return; }
    setIsAIExtracting(true);
    const toastId = toast.loading(t('configModal.aiExtractingLoading'));
    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const authHeaders = await getAuthHeaders(false);
      const response = await fetch(`${baseUrl}/api/translation/ai-extract`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: aiInputText })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error: ${response.status}`);
      }
      const data = await response.json();
      const newGlossary = (data.terminology || []).map((t: any) => ({
        id: uuidv4(),
        source: t.source || "",
        target: t.target || ""
      }));
      const newRelations = (data.relational_matrix || []).map((r: any) => ({
        id: uuidv4(),
        speaker: r.speaker || "",
        listener: r.listener || "",
        self_ref: r.self_ref || "",
        target_ref: r.target_ref || ""
      }));
      setGlossaryList(prev => [...newGlossary, ...prev]);
      setRelationList(prev => [...newRelations, ...prev]);
      setIsAIExtracting(false);
      setShowAIInput(false);
      setAiInputText("");
      toast.success(t('configModal.aiExtractSuccess'), { id: toastId });
      await useAuthStore.getState().fetchProfile();
    } catch (err: any) {
      console.error(err);
      setIsAIExtracting(false);
      toast.error(err.message || "Lỗi kết nối hoặc xử lý AI.", { id: toastId });
    }
  };

  const handleSave = () => {
    const cleanGlossary = glossaryList.filter(g => g.source.trim() !== '' && g.target.trim() !== '');
    const cleanRelations = relationList.filter(r => r.speaker.trim() !== '' && r.listener.trim() !== '');
    const exportString = JSON.stringify({ terminology: cleanGlossary, relational_matrix: cleanRelations }, null, 2);
    config.setConfig('glossary', exportString);
    config.setConfig('sourceLanguage', 'auto');
    config.setUseGpu(true);
    config.saveToLocal();
    localStorage.setItem('has_configured_translation', 'true');
    toast.success(t('configModal.saveConfigSuccess'));
    config.setModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-in fade-in duration-200">
      <div className="bg-panel w-full max-w-4xl max-h-[85vh] rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden text-text-main font-sans">
        
        {/* HEADER & TABS */}
        <div className="flex flex-col border-b border-border bg-panel">
          <div className="flex items-center justify-between px-6 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 bg-background border border-border rounded-xl shadow-inner">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-[13px] font-black uppercase tracking-wider text-text-main leading-tight">{t('configModal.title')}</h2>
                <p className="text-[10px] text-text-muted mt-0.5">{t('configModal.subtitle')}</p>
              </div>
            </div>

            {/* Tự động nhận diện đa ngữ sang Tiếng Việt */}
            <div className="flex items-center gap-3.5">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900/60 border border-white/[0.06] rounded-xl select-none whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[9px] font-bold tracking-wider bg-white/[0.08] text-white/80 px-1 py-0.5 rounded font-mono uppercase leading-none select-none">
                  AUTO AI
                </span>
                <span className="text-[11px] text-white/95 font-bold tracking-wide select-none">
                  Tự động đa ngữ (Nhật, Hàn, Trung, Anh) ➔ Tiếng Việt
                </span>
              </div>

                {/* Icon mũi tên chuyển đổi */}
                <div className="flex items-center justify-center text-white/20 select-none px-0.5">
                  <ArrowRight size={10} />
                </div>

                {/* Đích (Bị khóa - Tiếng Việt) */}
                <div 
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.02] border border-white/[0.03] rounded-lg text-white/40 text-[11px] font-semibold select-none cursor-not-allowed group relative"
                >
                  <span className="text-[9px] font-bold tracking-wider bg-white/[0.04] text-white/40 px-1 py-0.5 rounded font-mono leading-none select-none">
                    VI
                  </span>
                  <span className="text-[11px] text-white/40 tracking-wide select-none">Tiếng Việt</span>
                  <Lock size={9} className="text-white/20 group-hover:text-primary transition-colors" />

                  {/* Tooltip giải thích */}
                  <div className="absolute right-0 top-full mt-2.5 w-48 p-2 bg-[#141416] border border-white/[0.08] rounded-xl shadow-2xl backdrop-blur-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-200 z-[230] text-left normal-case tracking-normal">
                    <div className="text-[10px] text-white/60 leading-relaxed font-normal flex flex-col gap-0.5">
                      <span className="text-white font-bold flex items-center gap-1">
                        <Lock size={10} className="text-primary" /> Ngôn ngữ mặc định
                      </span>
                      <span>Hệ thống tối ưu dịch thuật sang tiếng Việt.</span>
                    </div>
                  </div>
                </div>
              </div>
              <button onClick={() => config.setModalOpen(false)} className="p-2 text-text-muted hover:text-text-main hover:bg-border/50 rounded-xl transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 bg-background border-t border-border/50">
            <div className="flex gap-4">
              <button onClick={() => setActiveTab('glossary')} className={`flex items-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${activeTab === 'glossary' ? 'border-primary text-primary font-black' : 'border-transparent text-text-muted hover:text-text-main'}`}>
                <FileJson size={14} /> {t('configModal.glossaryTab', { count: glossaryList.length })}
              </button>
              <button onClick={() => setActiveTab('relations')} className={`flex items-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${activeTab === 'relations' ? 'border-primary text-primary font-black' : 'border-transparent text-text-muted hover:text-text-main'}`}>
                <Users size={14} /> {t('configModal.relationsTab', { count: relationList.length })}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-panel border border-border hover:bg-border/60 hover:text-text-main text-text-muted rounded-xl text-[11px] font-semibold transition-all cursor-pointer">
                <UploadCloud size={13} /> {t('configModal.importJson')}
              </button>
              <button onClick={handleExportJSON} className="flex items-center gap-1.5 px-3 py-1.5 bg-panel border border-border hover:bg-border/60 hover:text-text-main text-text-muted rounded-xl text-[11px] font-semibold transition-all cursor-pointer">
                <Download size={13} /> {t('configModal.exportJson')}
              </button>
              <div className="w-px h-3 bg-border mx-1"></div>
              
              <button 
                onClick={() => setShowAIInput(!showAIInput)} 
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all border cursor-pointer active:scale-95 shadow-sm ${
                  showAIInput 
                    ? 'bg-primary text-white border-primary shadow-primary/20' 
                    : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 hover:border-primary/40'
                }`}
              >
                <Sparkles size={13} className={showAIInput ? 'animate-pulse' : ''} /> {showAIInput ? t('configModal.closeAi') : t('configModal.aiAnalysis')}
              </button>
            </div>
          </div>
        </div>

        {/* 🚀 KHU VỰC NHẬP LIỆU AI */}
        {showAIInput && (
          <div className="bg-panel border-b border-border p-5 animate-in slide-in-from-top-3 duration-200">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-primary uppercase tracking-widest flex items-center gap-1">
                    <Sparkles size={12} /> {t('configModal.aiInputTitle')}
                  </label>
                  <button
                    type="button"
                    onClick={handleGrabCurrentPageText}
                    className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 border border-primary/25 rounded-lg text-[10px] font-bold text-primary transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  >
                    <Wand2 size={11} /> Lấy text thoại từ trang hiện tại
                  </button>
                </div>
                <textarea 
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  placeholder={t('configModal.aiJapanesePlaceholder')}
                  className="w-full h-24 bg-background border border-border rounded-xl p-3.5 text-xs text-text-main resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all placeholder-text-muted/40 custom-scrollbar font-medium"
                />
              </div>
              <div className="w-full md:w-52 flex flex-col justify-end gap-2.5">
                <p className="text-[10px] text-text-muted leading-relaxed">
                  {t('configModal.aiInputDesc1')}<br/>
                  {t('configModal.aiInputDesc2')}
                </p>
                <button 
                  onClick={executeAIExtract}
                  disabled={isAIExtracting || !aiInputText.trim()}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary text-white rounded-xl text-[12px] font-bold hover:bg-primary/95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20 cursor-pointer"
                >
                  {isAIExtracting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} 
                  {isAIExtracting ? "Đang trích xuất..." : "Bắt đầu AI phân tích"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BODY TABS */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-background p-5 flex flex-col gap-4">
          {glossaryList.length === 0 && relationList.length === 0 ? (
            <div className="animate-in fade-in duration-300 flex flex-col md:flex-row gap-5 h-full max-h-full items-stretch">
              {/* Cột trái: AI Phân Tích */}
              <div className="flex-1 bg-panel/30 border border-primary/20 rounded-3xl p-6 flex flex-col justify-between gap-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                      <span className="text-xs font-black uppercase tracking-widest text-primary">Tự động phân tích bằng AI</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleGrabCurrentPageText}
                      className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/25 rounded-xl text-[10px] font-bold text-primary transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    >
                      <Wand2 size={12} /> Tự động lấy text trang hiện tại
                    </button>
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <textarea
                      value={aiInputText}
                      onChange={(e) => setAiInputText(e.target.value)}
                      placeholder="Nhập/dán đoạn thoại tiếng Nhật vào đây hoặc click nút ở góc trên để AI tự động trích xuất các nhân vật, thuật ngữ..."
                      className="w-full h-32 bg-background border border-border rounded-2xl p-4 text-xs text-text-main resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all placeholder-text-muted/30 custom-scrollbar font-medium"
                    />
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={executeAIExtract}
                  disabled={isAIExtracting || !aiInputText.trim()}
                  className="w-full py-3.5 bg-primary hover:bg-primary/95 text-white rounded-2xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                >
                  {isAIExtracting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {isAIExtracting ? "Đang trích xuất thuật ngữ..." : "Bắt đầu quét thuật ngữ & vai vế bằng AI"}
                </button>
              </div>

              {/* Cột phải: Thao tác khác */}
              <div className="w-full md:w-80 flex flex-col gap-4">
                {/* Thêm thủ công */}
                <div className="bg-panel/20 border border-border/50 rounded-3xl p-5 flex flex-col gap-4 flex-1 justify-between">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">Nhập liệu thủ công</span>
                    <p className="text-[10px] text-text-muted leading-relaxed">Nếu bạn đã có danh sách thuật ngữ hoặc bảng xưng hô, hãy tự tạo nhanh tại đây.</p>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('glossary');
                        setGlossaryList([{ id: uuidv4(), source: '', target: '' }]);
                      }}
                      className="w-full py-2.5 bg-background border border-border hover:border-primary/40 text-text-main hover:text-primary rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                    >
                      <Plus size={14} /> Bắt đầu thêm thuật ngữ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('relations');
                        setRelationList([{ id: uuidv4(), speaker: '', listener: '', self_ref: '', target_ref: '' }]);
                      }}
                      className="w-full py-2.5 bg-background border border-border hover:border-primary/40 text-text-main hover:text-primary rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                    >
                      <Plus size={14} /> Bắt đầu thêm quy tắc xưng hô
                    </button>
                  </div>
                </div>
                
                {/* Nhập file */}
                <div className="bg-panel/20 border border-border/50 rounded-3xl p-4 flex flex-col gap-2.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">Nhập từ file backup</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 bg-background border border-border hover:bg-border/60 text-text-muted hover:text-text-main rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <UploadCloud size={14} /> Tải lên file từ điển (.json)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'glossary' && (
                <div className="animate-in fade-in duration-200">
                  {glossaryList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-panel border border-border flex items-center justify-center text-text-muted/50 mb-4 shadow-inner">
                        <FileJson size={24} className="text-primary" />
                      </div>
                      <h3 className="text-xs font-bold text-text-main uppercase tracking-wider">{t('configModal.emptyGlossaryTitle')}</h3>
                      <p className="text-[11px] text-text-muted mt-1.5 max-w-[320px] leading-relaxed">
                        {t('configModal.emptyGlossaryDesc')}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 mb-4">
                      {glossaryList.map((item, index) => (
                        <GlossaryRow key={item.id} item={item} index={index} onUpdate={handleUpdateGlossary} onRemove={removeGlossary} />
                      ))}
                    </div>
                  )}
                  
                  <button onClick={() => setGlossaryList([...glossaryList, { id: uuidv4(), source: '', target: '' }])} className="w-full py-3.5 border border-dashed border-border hover:border-primary/50 bg-panel/10 hover:bg-panel/30 text-text-muted hover:text-primary rounded-xl flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer">
                    <Plus size={14} /> {t('configModal.addNewRow')}
                  </button>
                </div>
              )}

              {activeTab === 'relations' && (
                <div className="animate-in fade-in duration-200">
                  {relationList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-panel border border-border flex items-center justify-center text-text-muted/50 mb-4 shadow-inner">
                        <Users size={24} className="text-primary" />
                      </div>
                      <h3 className="text-xs font-bold text-text-main uppercase tracking-wider">{t('configModal.emptyRelationsTitle')}</h3>
                      <p className="text-[11px] text-text-muted mt-1.5 max-w-[320px] leading-relaxed">
                        {t('configModal.emptyRelationsDesc')}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 mb-4">
                      {/* Bảng chỉ dẫn xưng hô nhân vật */}
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-[11px] text-primary leading-relaxed font-semibold">
                        <strong>{t('configModal.guideTitle')}</strong> {t('configModal.guideDesc')}
                      </div>
                      
                      {relationList.map((item, index) => (
                        <RelationRow key={item.id} item={item} index={index} onUpdate={handleUpdateRelation} onRemove={removeRelation} />
                      ))}
                    </div>
                  )}
                  
                  <button onClick={() => setRelationList([...relationList, { id: uuidv4(), speaker: '', listener: '', self_ref: '', target_ref: '' }])} className="w-full py-3.5 border border-dashed border-border hover:border-primary/50 bg-panel/10 hover:bg-panel/30 text-text-muted hover:text-primary rounded-xl flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer">
                    <Plus size={14} /> {t('configModal.addNewRule')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 bg-panel border-t border-border flex justify-end items-center gap-2">
          <button onClick={() => config.setModalOpen(false)} className="px-4 py-2 rounded-xl text-[11px] font-bold text-text-muted hover:text-text-main hover:bg-border/60 transition-colors cursor-pointer">{t('configModal.cancel')}</button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[11px] font-bold text-white bg-primary hover:bg-primary/95 shadow-md shadow-primary/20 transition-all active:scale-95 cursor-pointer">
            <Save size={14} /> {t('configModal.saveConfig')}
          </button>
        </div>
      </div>
    </div>
  );
}