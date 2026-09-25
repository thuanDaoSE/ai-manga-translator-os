import React, { useState, useEffect } from 'react';
import { X, Sparkles, ChevronDown, Check, Loader2, Download, HardDrive } from 'lucide-react';
import { mangaApi } from '../../services/api';
import toast from 'react-hot-toast';
import { notify } from '../../utils/toast';
import { useDynamicLoadingText } from '../../hooks/useDynamicLoadingText';
import { useTranslation } from 'react-i18next';
import { useToolStore } from '../../store/useToolStore';
import { FluxDownloadModal } from './FluxDownloadModal';

const GpuIcon = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    fill="currentColor" 
    className={`inline-block align-middle ${className}`} 
    viewBox="0 0 16 16"
  >
    <path d="M4 8a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0m7.5-1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"/>
    <path d="M0 1.5A.5.5 0 0 1 .5 1h1a.5.5 0 0 1 .5.5V4h13.5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H2v2.5a.5.5 0 0 1-1 0V2H.5a.5.5 0 0 1-.5-.5m5.5 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M9 8a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0"/>
    <path d="M3 12.5h3.5v1a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5zm4 1v-1h4v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5"/>
  </svg>
);

interface TagOption {
  value: string;
  label: string;
}

// Tag taxonomy categorized by purpose with dedicated color styles (Vietnamese labels for display, English values for GPU diffusion model)
const CATEGORIES = [
  {
    id: "manga",
    name: "Họa tiết Manga (Grayscale)",
    color: "blue",
    pillClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    tagClass: "bg-blue-500/10 text-blue-300 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 text-xs px-3 py-1.5",
    tags: [
      { value: "monochrome", label: "Ảnh đen trắng" },
      { value: "screentones", label: "Lưới hiệu ứng Screentone" },
      { value: "crosshatching", label: "Nét gạch chéo bóng" },
      { value: "precise lineart", label: "Nét vẽ mảnh sắc nét" }
    ]
  },
  {
    id: "webtoon",
    name: "Phong cách Webtoon (Color)",
    color: "purple",
    pillClass: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    tagClass: "bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/40 text-xs px-3 py-1.5",
    tags: [
      { value: "cel shading", label: "Đổ bóng khối Cel-shading" },
      { value: "flat colors", label: "Tô màu phẳng đơn giản" },
      { value: "vibrant palette", label: "Màu sắc sống động" },
      { value: "webtoon style", label: "Phong cách Webtoon" }
    ]
  },
  {
    id: "sfx",
    name: "Hiệu ứng SFX & Động",
    color: "orange",
    pillClass: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    tagClass: "bg-orange-500/10 text-orange-300 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/40 text-xs px-3 py-1.5",
    tags: [
      { value: "speed lines", label: "Đường chuyển động bay" },
      { value: "impact debris", label: "Vụn vỡ va chạm" },
      { value: "motion blur", label: "Làm mờ chuyển động" },
      { value: "floating hair", label: "Tóc bay trước gió" }
    ]
  },
  {
    id: "context",
    name: "Bối cảnh & Background",
    color: "green",
    pillClass: "bg-green-500/10 text-green-400 border-green-500/30",
    tagClass: "bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20 hover:border-green-500/40 text-xs px-3 py-1.5",
    tags: [
      { value: "simple background", label: "Phông nền đơn giản" },
      { value: "detailed background", label: "Phông nền chi tiết" },
      { value: "brick wall", label: "Bức tường gạch" },
      { value: "starry sky", label: "Bầu trời sao đêm" }
    ]
  }
];

const PLACEHOLDERS = [
  "Tùy chọn: Nhập chi tiết cần vẽ (VD: vẽ thêm tóc, vệt sáng...)",
  "Tùy chọn: Vẽ lại bối cảnh cũ (VD: lớp học, tường gạch...)",
  "Tùy chọn: Thêm hiệu ứng động (VD: khói bụi, vụn đổ nát...)"
];

interface RedrawPromptInputProps {
  isProcessing: boolean;
  onCancel: () => void;
  onSubmit: (prompts: { positive: string; negative: string }) => void;
  inSidebar?: boolean;
}

export const RedrawPromptInput: React.FC<RedrawPromptInputProps> = ({
  isProcessing,
  onCancel,
  onSubmit,
  inSidebar = false
}) => {
  const { t } = useTranslation();
  const isRedrawSessionActive = useToolStore((state) => state.isRedrawSessionActive);
  const [vietnameseText, setVietnameseText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mode, setMode] = useState<'manga' | 'webtoon'>('manga');
  const [isOpenFlyout, setIsOpenFlyout] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [fluxReady, setFluxReady] = useState<boolean | null>(null);
  const [isFluxModalOpen, setIsFluxModalOpen] = useState(false);
  const dynamicLoadingText = useDynamicLoadingText(isProcessing);

  useEffect(() => {
    let active = true;
    mangaApi.getFluxStatus().then((res) => {
      if (active) setFluxReady(!!res.is_ready);
    }).catch(() => {
      if (active) setFluxReady(false);
    });
    return () => { active = false; };
  }, [isFluxModalOpen]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleTag = (tagValue: string) => {
    setSelectedTags((prev) => 
      prev.includes(tagValue) ? prev.filter((t) => t !== tagValue) : [...prev, tagValue]
    );
  };

  const getTagPillClass = (tagValue: string) => {
    const category = CATEGORIES.find(cat => cat.tags.some(t => t.value === tagValue));
    return category ? category.pillClass : "bg-gray-500/10 text-gray-300 border-gray-500/30";
  };

  const getTagLabel = (tagValue: string) => {
    return t('redrawInput.tag_' + tagValue.replace(/\s+/g, '_'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isTranslating || isProcessing) return;

    if (fluxReady === false) {
      notify.warning(
        'Mô hình chưa sẵn sàng',
        'Mô hình FLUX.1-Fill cần được tải về trước khi thực hiện vẽ lại!'
      );
      setIsFluxModalOpen(true);
      return;
    }

    setIsTranslating(true);
    let promptResult = null;
    try {
      promptResult = await mangaApi.processRedrawPrompt(vietnameseText, selectedTags, mode);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('redrawInput.failedToTranslate'));
      setIsTranslating(false);
      return;
    }

    setIsTranslating(false);

    try {
      await onSubmit({
        positive: promptResult.finalPositivePrompt,
        negative: promptResult.finalNegativePrompt
      });
    } catch (err: any) {
      console.error(err);
    }
  };

  const filteredCategories = CATEGORIES.filter(category => {
    if (mode === 'manga' && category.id === 'webtoon') return false;
    if (mode === 'webtoon' && category.id === 'manga') return false;
    return true;
  });

  if (inSidebar) {
    return (
      <div className="flex flex-col h-full bg-panel text-white animate-in slide-in-from-right-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-background/30 shrink-0">
          <div className="flex items-center gap-1.5 select-none text-indigo-400 font-bold text-sm">
            <Sparkles size={16} />
            <span>{t('redrawInput.redrawAi')}</span>
            <span className="bg-blue-500/20 text-blue-400 text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ml-1">BETA</span>
            {fluxReady === true ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                FLUX Sẵn sàng
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setIsFluxModalOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-all cursor-pointer ml-1"
                title="Bấm để tải mô hình FLUX về GPU"
              >
                <Download size={10} />
                <span>Tải FLUX</span>
              </button>
            )}
          </div>
          <button 
            type="button"
            onClick={onCancel} 
            className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form + Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
            {/* Input prompt */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Prompt Vẽ Lại</label>
              <textarea
                value={vietnameseText}
                onChange={(e) => setVietnameseText(e.target.value)}
                placeholder={t('redrawInput.placeholder' + placeholderIndex)}
                className="w-full h-24 px-3 py-2.5 text-xs bg-neutral-900/80 border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500/80 text-white placeholder-neutral-500 transition-all shadow-inner resize-none"
                disabled={isTranslating || isProcessing}
                autoFocus
              />
            </div>

            {/* Selected Tags list */}
            {selectedTags.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Tags Đã Chọn</label>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1 border border-white/5 rounded-xl p-2 bg-neutral-950/20">
                  {selectedTags.map(tag => (
                    <div 
                      key={tag} 
                      className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold border rounded-full ${getTagPillClass(tag)}`}
                    >
                      <span>{getTagLabel(tag)}</span>
                      <button 
                        type="button" 
                        onClick={() => handleToggleTag(tag)}
                        className="hover:bg-white/10 rounded-full p-0.5 transition-colors cursor-pointer"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Configuration / Style selection */}
            <div className="border-t border-white/5 pt-3">
              <div className="flex items-center justify-between pb-3">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{t('redrawInput.styleFilter')}</span>
                <div className="flex bg-neutral-950 border border-white/5 p-0.5 rounded-lg text-[9px] font-extrabold">
                  <button
                    type="button"
                    onClick={() => setMode('manga')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      mode === 'manga' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {t('redrawInput.mangaMode')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('webtoon')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      mode === 'webtoon' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {t('redrawInput.webtoonMode')}
                  </button>
                </div>
              </div>

              {/* Tag Categories list inside sidebar */}
              <div className="space-y-4 mt-2">
                {filteredCategories.map(category => (
                  <div key={category.name} className="flex flex-col gap-1.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-500">
                      {t('redrawInput.category_' + category.id)}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {category.tags.map(tagObj => {
                        const isSelected = selectedTags.includes(tagObj.value);
                        return (
                          <button
                            key={tagObj.value}
                            type="button"
                            onClick={() => handleToggleTag(tagObj.value)}
                            className={`flex items-center gap-1.5 rounded-xl border transition-all cursor-pointer font-medium ${
                              isSelected 
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm font-semibold'
                                : category.tagClass
                            }`}
                          >
                            {isSelected && <Check size={10} />}
                            <span>{t('redrawInput.tag_' + tagObj.value.replace(/\s+/g, '_'))}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer containing action buttons */}
          <div className="p-4 bg-background/30 border-t border-border flex gap-3 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              disabled={isTranslating || isProcessing}
              className="flex-1 py-2.5 bg-neutral-950 border border-white/5 hover:border-white/10 hover:bg-neutral-900 text-neutral-400 hover:text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              {t('redrawInput.cancel')}
            </button>
            <button
              type="submit"
              disabled={isTranslating || isProcessing}
              className={`flex-[2] relative flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20
                ${!isTranslating && !isProcessing ? 'pl-4 pr-12' : 'px-4'}`}
            >
              {isTranslating || isProcessing ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <Sparkles size={15} />
              )}
              <span>
                {isTranslating 
                  ? t('redrawInput.translating') 
                  : isProcessing 
                    ? dynamicLoadingText 
                    : t('redrawInput.redrawButton', 'Vẽ lại')}
              </span>
              {!isTranslating && !isProcessing && (
                <span className="absolute right-3 inline-flex items-center bg-black/25 px-1.5 py-0.5 rounded-md text-white text-[10px] font-black whitespace-nowrap">
                  3<GpuIcon className="w-2.5 h-2.5 -ml-[1px] text-white shrink-0" />
                </span>
              )}
            </button>
          </div>
        </form>
        <FluxDownloadModal
          isOpen={isFluxModalOpen}
          onClose={() => setIsFluxModalOpen(false)}
          onReady={() => setFluxReady(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 p-4 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.7)] rounded-2xl w-[380px] animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto text-white">
      
      {/* Header with BETA Badge and FLUX Status */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2 select-none">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-indigo-400" />
          <span className="text-xs font-bold text-neutral-200">{t('redrawInput.redrawAi')}</span>
          <span className="bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ml-1">BETA</span>
        </div>
        {fluxReady === true ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            FLUX Sẵn sàng
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setIsFluxModalOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-all cursor-pointer"
            title="Bấm để tải mô hình FLUX về GPU"
          >
            <Download size={10} />
            <span>Tải FLUX</span>
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="relative">
          <textarea
            value={vietnameseText}
            onChange={(e) => setVietnameseText(e.target.value)}
            placeholder={t('redrawInput.placeholder' + placeholderIndex)}
            className="w-full h-16 px-3 py-2 text-xs bg-neutral-900/80 border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500/80 text-white placeholder-neutral-500 transition-all shadow-inner resize-none"
            disabled={isTranslating || isProcessing}
            autoFocus
          />
        </div>

        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-1">
            {selectedTags.map(tag => (
              <div 
                key={tag} 
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold border rounded-full ${getTagPillClass(tag)}`}
              >
                <span>{getTagLabel(tag)}</span>
                <button 
                  type="button" 
                  onClick={() => handleToggleTag(tag)}
                  className="hover:bg-white/10 rounded-full p-0.5 transition-colors cursor-pointer"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}


        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isTranslating || isProcessing}
            className={`flex-1 relative flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20
              ${!isTranslating && !isProcessing ? 'pl-4 pr-12' : 'px-4'}`}
          >
            {isTranslating || isProcessing ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            <span>
              {isTranslating 
                ? t('redrawInput.translating') 
                : isProcessing 
                  ? dynamicLoadingText 
                  : t('redrawInput.redrawButton', 'Vẽ lại')}
            </span>
            {!isTranslating && !isProcessing && (
              <span className="absolute right-3 inline-flex items-center bg-black/25 px-1.5 py-0.5 rounded-md text-white text-[10px] font-black whitespace-nowrap">
                3<GpuIcon className="w-2.5 h-2.5 -ml-[1px] text-white shrink-0" />
              </span>
            )}
          </button>
          
          <button
            type="button"
            onClick={onCancel}
            disabled={isTranslating || isProcessing}
            className="px-4 py-3 bg-neutral-950 border border-white/5 hover:border-white/10 hover:bg-neutral-900 text-neutral-400 hover:text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            {t('redrawInput.cancel')}
          </button>
        </div>
      </form>

      <div className="border-t border-white/5 pt-2">
        <button
          type="button"
          onClick={() => setIsOpenFlyout(!isOpenFlyout)}
          className="flex items-center justify-between w-full px-3 py-2 bg-neutral-900/30 hover:bg-neutral-900/60 border border-white/5 hover:border-white/10 rounded-xl text-[10px] font-extrabold text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer uppercase tracking-wider"
        >
          <span className="flex items-center gap-1.5">{t('redrawInput.advancedConfig')}</span>
          <ChevronDown size={12} className={`transition-transform duration-200 ${isOpenFlyout ? 'rotate-180 text-white' : ''}`} />
        </button>

        {isOpenFlyout && (
          <div className="mt-3 z-50 bg-[#141414] border border-white/10 shadow-2xl rounded-xl p-3 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
            
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-[10px] font-bold text-neutral-500 uppercase">{t('redrawInput.styleFilter')}</span>
              <div className="flex bg-neutral-950 border border-white/5 p-0.5 rounded-lg text-[9px] font-extrabold">
                <button
                  type="button"
                  onClick={() => setMode('manga')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    mode === 'manga' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {t('redrawInput.mangaMode')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('webtoon')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    mode === 'webtoon' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {t('redrawInput.webtoonMode')}
                </button>
              </div>
            </div>

            {filteredCategories.map(category => (
              <div key={category.name} className="flex flex-col gap-1.5">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-500">
                  {t('redrawInput.category_' + category.id)}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {category.tags.map(tagObj => {
                    const isSelected = selectedTags.includes(tagObj.value);
                    return (
                      <button
                        key={tagObj.value}
                        type="button"
                        onClick={() => handleToggleTag(tagObj.value)}
                        className={`flex items-center gap-1.5 rounded-xl border transition-all cursor-pointer font-medium ${
                          isSelected 
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm font-semibold'
                            : category.tagClass
                        }`}
                      >
                        {isSelected && <Check size={10} />}
                        <span>{t('redrawInput.tag_' + tagObj.value.replace(/\s+/g, '_'))}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <FluxDownloadModal
        isOpen={isFluxModalOpen}
        onClose={() => setIsFluxModalOpen(false)}
        onReady={() => setFluxReady(true)}
      />
    </div>
  );
};
