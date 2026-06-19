import React, { useEffect, useState } from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Languages, X, Sparkles, Check, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function LensModal() {
  const { t } = useTranslation();
  const { scanModal, setScanModal, setActiveMode } = useToolStore();
  const { addBubble } = useCanvasStore();
  const [editedVie, setEditedVie] = useState("");

  useEffect(() => {
    if (scanModal?.isOpen) setEditedVie(scanModal.vie);
  }, [scanModal]);

  if (!scanModal?.isOpen) return null;

  const handleApply = () => {
    const toolState = useToolStore.getState();
    const safeColor = toolState.fontColor || '#000000';
    addBubble({
      x: Math.min(scanModal.coords.x1, scanModal.coords.x2),
      y: Math.min(scanModal.coords.y1, scanModal.coords.y2),
      w: Math.max(Math.abs(scanModal.coords.x2 - scanModal.coords.x1), 80),
      h: Math.max(Math.abs(scanModal.coords.y2 - scanModal.coords.y1), 40),
      text: editedVie,
      vietnamese: editedVie,
      japanese: scanModal.jap,
      fontSize: toolState.fontSize,
      fontColor: safeColor,
      fontFamily: toolState.fontFamily,
      rotation: 0,
      outlineWidth: toolState.outlineWidth,
      outlineColor: safeColor.toLowerCase() === '#000000' ? '#ffffff' : '#000000'
    });
    setScanModal(null);
    setActiveMode('none');
  };

  return (
    // 🚀 ĐÃ SỬA: Xóa sạch các thuộc tính "fixed, absolute, drag"
    // Trở thành một khối flex chiếm 100% chiều cao của Cột Phải
    <div className="flex flex-col h-full bg-panel">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-background/30 shrink-0">
        <div className="flex items-center gap-2 text-primary font-bold text-sm">
          <Languages size={18} /><span>{t('lensModal.title')}</span>
        </div>
        <button 
          onClick={() => { setScanModal(null); setActiveMode('none'); }} 
          className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg cursor-pointer transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body: To, rõ ràng và thoải mái */}
      <div className="p-4 space-y-5 flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-2">
          <label className="text-xs font-bold text-text-muted uppercase flex items-center gap-1.5"><Type size={14} /> {t('lensModal.japaneseLabel')}</label>
          <textarea readOnly value={scanModal.jap} className="w-full h-24 p-3 bg-background/50 border border-border rounded-xl text-text-muted text-sm resize-none focus:outline-none custom-scrollbar" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-primary uppercase flex items-center gap-1.5"><Sparkles size={14} /> {t('lensModal.translationLabel')}</label>
          <textarea value={editedVie} onChange={(e) => setEditedVie(e.target.value)} className="w-full h-40 p-3 bg-background border border-primary/30 rounded-xl text-text-main text-sm font-medium resize-none focus:outline-none focus:border-primary transition-all custom-scrollbar shadow-inner" />
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 bg-background/30 border-t border-border flex justify-end gap-3 shrink-0">
        <button 
          onClick={() => { setScanModal(null); setActiveMode('none'); }} 
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-text-main hover:bg-border cursor-pointer transition-colors"
        >
          {t('lensModal.cancel')}
        </button>
        <button 
          onClick={handleApply} 
          className="flex-[2] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover shadow-lg cursor-pointer transition-colors"
        >
          <Check size={18} strokeWidth={2.5} /> {t('lensModal.insertText')}
        </button>
      </div>

    </div>
  );
}