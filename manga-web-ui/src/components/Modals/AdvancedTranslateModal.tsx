import React, { useState } from 'react';
import { X, RefreshCw, Sparkles } from 'lucide-react';

interface AdvancedTranslateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (localPrompt: string) => void;
}

const SUGGESTIONS = [
  // Pronouns
  "Xưng hô: Anh - Em",
  "Xưng hô: Tao - Mày",
  "Xưng hô: Bổn tọa - Ngươi",
  
  // Tone
  "Giọng điệu hài hước / Bắt trend",
  "Dịch thành Thơ Lục Bát",
  "Nghiêm túc, căng thẳng",
  
  // Special Rules
  "Giữ nguyên kính ngữ (Senpai, Sensei)",
  "Không dịch tên chiêu thức"
];

export const AdvancedTranslateModal: React.FC<AdvancedTranslateModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [localPrompt, setLocalPrompt] = useState('');

  if (!isOpen) return null;

  const handleAddSuggestion = (text: string) => {
    setLocalPrompt((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) {
        return text;
      }
      return `${trimmed}, ${text}`;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(localPrompt);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      {/* Backdrop mờ nền */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Hộp thoại chính với Glassmorphism */}
      <div className="relative w-full max-w-md bg-[#1a1a1a]/90 backdrop-blur-md border border-gray-800 text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60 bg-black/25">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4.5 h-4.5 text-primary" />
            <h3 className="text-sm font-bold tracking-wide uppercase">Dịch lại nâng cao</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Input */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          
          {/* Quick Suggestion Chips */}
          <div>
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2 block">
              💡 Gợi ý nhanh:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((text, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAddSuggestion(text)}
                  className="px-2.5 py-1 text-[10px] font-bold bg-background border border-border text-text-muted rounded-full hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-all shadow-sm cursor-pointer"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-300 block">
              Chỉ thị bổ sung cho trang này (Tùy chọn)
            </label>
            <textarea
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              placeholder="Ví dụ: Dịch đoạn này thành thơ lục bát, đổi xưng hô thành mày-tao..."
              rows={4}
              className="w-full bg-neutral-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder-gray-600 transition-all resize-none"
            />
          </div>

          {/* Nút hành động */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-800 hover:bg-white/5 text-xs font-bold text-gray-400 hover:text-white rounded-xl transition-all cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-xs font-bold text-white rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw size={13} />
              Dịch ngay
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

interface AdvancedTranslateTriggerProps {
  onClick: () => void;
}

export const AdvancedTranslateTrigger: React.FC<AdvancedTranslateTriggerProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-800 bg-[#1a1a1a] hover:bg-neutral-800 text-gray-300 hover:text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
    >
      <RefreshCw size={13} />
      <span>Dịch lại nâng cao</span>
    </button>
  );
};
