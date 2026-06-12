import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Wand2, ChevronDown, Check } from 'lucide-react';
import { mangaApi } from '../../services/api';
import toast from 'react-hot-toast';

// Tag taxonomy categorized by purpose with dedicated color styles
const CATEGORIES = [
  {
    id: "manga",
    name: "Họa tiết Manga (Grayscale)",
    color: "blue",
    pillClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    tagClass: "bg-blue-500/10 text-blue-300 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 text-xs px-3 py-1.5",
    tags: ["monochrome", "screentones", "crosshatching", "precise lineart"]
  },
  {
    id: "webtoon",
    name: "Phong cách Webtoon (Color)",
    color: "purple",
    pillClass: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    tagClass: "bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/40 text-xs px-3 py-1.5",
    tags: ["cel shading", "flat colors", "vibrant palette", "webtoon style"]
  },
  {
    id: "sfx",
    name: "Hiệu ứng SFX & Động",
    color: "orange",
    pillClass: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    tagClass: "bg-orange-500/10 text-orange-300 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/40 text-xs px-3 py-1.5",
    tags: ["speed lines", "impact debris", "motion blur", "floating hair"]
  },
  {
    id: "context",
    name: "Bối cảnh & Background",
    color: "green",
    pillClass: "bg-green-500/10 text-green-400 border-green-500/30",
    tagClass: "bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20 hover:border-green-500/40 text-xs px-3 py-1.5",
    tags: ["simple background", "detailed background", "brick wall", "starry sky"]
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
  const [vietnameseText, setVietnameseText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mode, setMode] = useState<'manga' | 'webtoon'>('manga');
  const [isOpenFlyout, setIsOpenFlyout] = useState(false); // Collapsed by default
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);

  // Cycling placeholder text every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Toggle a tag in/out of selected list
  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) => 
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Find category style class for a specific tag
  const getTagPillClass = (tag: string) => {
    const category = CATEGORIES.find(cat => cat.tags.includes(tag));
    return category ? category.pillClass : "bg-gray-500/10 text-gray-300 border-gray-500/30";
  };

  // Handle form submission and prompt packaging
  const handleSubmit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isTranslating || isProcessing) return;

    setIsTranslating(true);
    try {
      // Gọi API dịch và sinh prompt
      const result = await mangaApi.processRedrawPrompt(vietnameseText, selectedTags, mode);
      
      // Gửi prompt đã dịch ngược về hàm redraw cha
      onSubmit({
        positive: result.finalPositivePrompt,
        negative: result.finalNegativePrompt
      });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Không thể dịch prompt vẽ lại. Vui lòng thử lại!");
    } finally {
      setIsTranslating(false);
    }
  };

  // Filter out categories based on active mode
  const filteredCategories = CATEGORIES.filter(category => {
    if (mode === 'manga' && category.id === 'webtoon') return false;
    if (mode === 'webtoon' && category.id === 'manga') return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-3.5 p-4 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.7)] rounded-2xl w-[380px] animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto text-white">
      
      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Natural Language Input field at the very top */}
        <div className="relative">
          <textarea
            value={vietnameseText}
            onChange={(e) => setVietnameseText(e.target.value)}
            placeholder={PLACEHOLDERS[placeholderIndex]}
            className="w-full h-16 px-3 py-2 text-xs bg-neutral-900/80 border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500/80 text-white placeholder-neutral-500 transition-all shadow-inner resize-none"
            disabled={isTranslating || isProcessing}
            autoFocus
          />
        </div>

        {/* Selected Tags list (Pills) visible directly under the input if any */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-1">
            {selectedTags.map(tag => (
              <div 
                key={tag} 
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold border rounded-full ${getTagPillClass(tag)}`}
              >
                <span>{tag}</span>
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

        {/* Large Prominent 1-Click Action Button and Cancel Button */}
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
            {isTranslating ? "Đang dịch..." : isProcessing ? "Đang vẽ..." : "Vẽ lại AI"}
          </button>
          
          <button
            type="button"
            onClick={onCancel}
            disabled={isTranslating || isProcessing}
            className="px-4 py-3 bg-neutral-950 border border-white/5 hover:border-white/10 hover:bg-neutral-900 text-neutral-400 hover:text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Hủy
          </button>
        </div>
      </form>

      {/* Accordion / Dropdown for Advanced Tags - Collapsed by default */}
      <div className="border-t border-white/5 pt-2">
        <button
          type="button"
          onClick={() => setIsOpenFlyout(!isOpenFlyout)}
          className="flex items-center justify-between w-full px-3 py-2 bg-neutral-900/30 hover:bg-neutral-900/60 border border-white/5 hover:border-white/10 rounded-xl text-[10px] font-extrabold text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer uppercase tracking-wider"
        >
          <span className="flex items-center gap-1.5">🪄 Cấu hình vẽ nâng cao (Tags)</span>
          <ChevronDown size={12} className={`transition-transform duration-200 ${isOpenFlyout ? 'rotate-180 text-white' : ''}`} />
        </button>

        {isOpenFlyout && (
          <div className="mt-3 z-50 bg-[#141414] border border-white/10 shadow-2xl rounded-xl p-3 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
            
            {/* Toggle at the top of the advanced section to filter styles */}
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-[10px] font-bold text-neutral-500 uppercase">Bộ lọc phong cách</span>
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
                  Manga (Trắng Đen)
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
                  Webtoon (Màu)
                </button>
              </div>
            </div>

            {/* Render only filtered categories based on mode */}
            {filteredCategories.map(category => (
              <div key={category.name} className="flex flex-col gap-1.5">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-neutral-500">
                  {category.name}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {category.tags.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTag(tag)}
                        className={`flex items-center gap-1.5 rounded-xl border transition-all cursor-pointer font-medium ${
                          isSelected 
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm font-semibold'
                            : category.tagClass
                        }`}
                      >
                        {isSelected && <Check size={10} />}
                        <span>{tag}</span>
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
