import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';


export const ComparisonSlider: React.FC = () => {
  const { t } = useTranslation();
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
    setSliderPosition(percent);
  };

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches[0]) {
        handleMove(e.touches[0].clientX);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      className="relative w-full aspect-[3/4] md:aspect-[16/10] max-w-4xl mx-auto rounded-3xl overflow-hidden cursor-ew-resize border border-white/10 shadow-2xl bg-neutral-900 group select-none"
      ref={containerRef}
      onMouseDown={(e) => {
        e.preventDefault();
        setIsDragging(true);
        handleMove(e.clientX);
      }}
      onTouchStart={(e) => {
        setIsDragging(true);
        if (e.touches[0]) {
          handleMove(e.touches[0].clientX);
        }
      }}
    >
      {/* Base Layer: Raw Japanese Manga Visualization */}
      <div className="absolute inset-0 bg-neutral-950 bg-[url('/raw_manga.png')] bg-cover bg-center pointer-events-none">
        <span className="absolute top-4 right-4 bg-black/80 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-semibold text-white/95 border border-white/10 tracking-wider">
          {t('landing.rawMangaLabel')}
        </span>
      </div>

      {/* Dynamic Overlay Layer: Translated & Typeset Vietnamese Visualization */}
      <div
        className="absolute inset-0 bg-neutral-950 overflow-hidden bg-[url('/translated_manga.png')] bg-cover bg-center pointer-events-none"
        style={{ width: `${sliderPosition}%` }}
      >
        <span className="absolute top-4 left-4 bg-indigo-600/95 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-semibold text-white whitespace-nowrap border border-indigo-400/30 tracking-wider">
          {t('landing.translatedMangaLabel')}
        </span>
      </div>

      {/* Hardware-Accelerated Divider and Interactive Handle */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_20px_rgba(255,255,255,0.7)] z-20 flex items-center justify-center -translate-x-1/2"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="w-10 h-10 rounded-full bg-white text-neutral-950 flex items-center justify-center shadow-xl transition-transform duration-300 group-hover:scale-110">
          <ChevronLeft size={18} strokeWidth={2.5} />
          <ChevronRight size={18} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
};

export default ComparisonSlider;
