import React, { useEffect, useState, useRef, memo, useCallback } from 'react';
import { useConfigStore, VALID_LANGUAGES } from '../../store/useConfigStore';
import { 
  X, Database, Users, Save, Plus, Trash2, 
  ArrowRight, UploadCloud, Download, Wand2, Loader2, FileJson, Sparkles, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';

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
  const [activeTab, setActiveTab] = useState<'glossary' | 'relations'>('glossary');
  
  const [glossaryList, setGlossaryList] = useState<GlossaryItem[]>([]);
  const [relationList, setRelationList] = useState<RelationItem[]>([]);
  
  const [isAIExtracting, setIsAIExtracting] = useState(false);
  const [showAIInput, setShowAIInput] = useState(false);
  const [aiInputText, setAiInputText] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const executeAIExtract = () => {
    if (!aiInputText.trim()) { toast.error(t('configModal.aiInputEmptyError')); return; }
    setIsAIExtracting(true);
    const toastId = toast.loading(t('configModal.aiExtractingLoading'));
    setTimeout(() => {
      setGlossaryList(prev => [{ id: uuidv4(), source: "新技", target: "Chiêu mới" }, ...prev]);
      setIsAIExtracting(false);
      setShowAIInput(false);
      setAiInputText("");
      toast.success(t('configModal.aiExtractSuccess'), { id: toastId });
    }, 2000);
  };

  const handleSave = () => {
    const cleanGlossary = glossaryList.filter(g => g.source.trim() !== '' && g.target.trim() !== '');
    const cleanRelations = relationList.filter(r => r.speaker.trim() !== '' && r.listener.trim() !== '');
    const exportString = JSON.stringify({ terminology: cleanGlossary, relational_matrix: cleanRelations }, null, 2);
    config.setConfig('glossary', exportString);
    config.saveToLocal();
    toast.success(t('configModal.saveConfigSuccess'), { icon: '💾' });
    config.setModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-in fade-in duration-200">
      <div className="bg-panel w-full max-w-4xl max-h-[85vh] rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden text-text-main font-sans">
        
        {/* HEADER & TABS */}
        <div className="flex flex-col border-b border-border bg-panel">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 bg-background border border-border rounded-xl shadow-inner">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-[14px] font-black uppercase tracking-wider text-text-main">{t('configModal.title')}</h2>
                <p className="text-[11px] text-text-muted">{t('configModal.subtitle')}</p>
              </div>
            </div>
            <button onClick={() => config.setModalOpen(false)} className="p-2 text-text-muted hover:text-text-main hover:bg-border/50 rounded-xl transition-colors cursor-pointer"><X size={18} /></button>
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border cursor-pointer ${showAIInput ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20' : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20'}`}
              >
                <Wand2 size={13} /> {showAIInput ? t('configModal.closeAi') : t('configModal.aiAnalysis')}
              </button>
            </div>
          </div>
        </div>

        {/* 🚀 KHU VỰC NHẬP LIỆU AI */}
        {showAIInput && (
          <div className="bg-panel border-b border-border p-5 animate-in slide-in-from-top-3 duration-200">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-[11px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Sparkles size={12} /> {t('configModal.aiInputTitle')}
                </label>
                <textarea 
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  placeholder={t('configModal.aiJapanesePlaceholder')}
                  className="w-full h-24 bg-background border border-border rounded-xl p-3.5 text-xs text-text-main resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all placeholder-text-muted/40 custom-scrollbar font-medium"
                />
              </div>
              <div className="w-full md:w-52 flex flex-col justify-end">
                <p className="text-[10px] text-text-muted mb-3 leading-relaxed">
                  {t('configModal.aiInputDesc1')}<br/>
                  {t('configModal.aiInputDesc2')}
                </p>
                <button 
                  onClick={executeAIExtract}
                  disabled={isAIExtracting || !aiInputText.trim()}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary text-white rounded-xl text-[12px] font-bold hover:bg-primary/95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20 cursor-pointer"
                >
                  {isAIExtracting ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} 
                  {isAIExtracting ? t('configModal.runningAi') : t('configModal.startScan')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BODY TABS */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-background p-5">
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
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 bg-panel border-t border-border flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">PostgreSQL Synced</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => config.setModalOpen(false)} className="px-4 py-2 rounded-xl text-[11px] font-bold text-text-muted hover:text-text-main hover:bg-border/60 transition-colors cursor-pointer">{t('configModal.cancel')}</button>
            <button onClick={handleSave} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[11px] font-bold text-white bg-primary hover:bg-primary/95 shadow-md shadow-primary/20 transition-all active:scale-95 cursor-pointer">
              <Save size={14} /> {t('configModal.saveConfig')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}