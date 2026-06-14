import React, { useState, useEffect } from 'react';
import { X, Sparkles, ChevronDown, Check } from 'lucide-react';
import { mangaApi } from '../../services/api';
import toast from 'react-hot-toast';
import { useDynamicLoadingText } from '../../hooks/useDynamicLoadingText';
import { useTranslation } from 'react-i18next';
import { useToolStore } from '../../store/useToolStore';

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
}

export const RedrawPromptInput: React.FC<RedrawPromptInputProps> = ({
  isProcessing,
  onCancel,
  onSubmit
}) => {
  const { t } = useTranslation();
  const isRedrawSessionActive = useToolStore((state) => state.isRedrawSessionActive);
  const [vietnameseText, setVietnameseText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mode, setMode] = useState<'manga' | 'webtoon'>('manga');
  const [isOpenFlyout, setIsOpenFlyout] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const dynamicLoadingText = useDynamicLoadingText(isProcessing);

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

    setIsTranslating(true);
    try {
      const result = await mangaApi.processRedrawPrompt(vietnameseText, selectedTags, mode);
      await onSubmit({
        positive: result.finalPositivePrompt,
        negative: result.finalNegativePrompt
      });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('redrawInput.failedToTranslate'));
    } finally {
      setIsTranslating(false);
    }
  };

  const filteredCategories = CATEGORIES.filter(category => {
    if (mode === 'manga' && category.id === 'webtoon') return false;
    if (mode === 'webtoon' && category.id === 'manga') return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-3.5 p-4 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.7)] rounded-2xl w-[380px] animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto text-white">
      
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

        {/* Dòng ghi chú nhỏ về phí gọi máy chủ */}
        <div className="text-[10px] text-gray-400 select-none">
          {t('redrawInput.redrawDisclaimer')}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isTranslating || isProcessing}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20"
          >
            {isTranslating || isProcessing ? (
              <span className="animate-spin text-sm">⏳</span>
            ) : (
              <Sparkles size={15} />
            )}
            {isTranslating 
              ? t('redrawInput.translating') 
              : isProcessing 
                ? dynamicLoadingText 
                : isRedrawSessionActive 
                  ? t('redrawInput.redrawButtonSubsequent') 
                  : t('redrawInput.redrawButtonFirst')}
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
    </div>
  );
};
