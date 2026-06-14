import React from 'react';
import { cn } from '../../utils';

interface DeepKomaLogoProps {
  className?: string;
  iconSize?: number;
  showText?: boolean;
  showSubtitle?: boolean;
  onClick?: () => void;
}

export default function DeepKomaLogo({
  className,
  iconSize = 32,
  showText = true,
  showSubtitle = true,
  onClick,
}: DeepKomaLogoProps) {
  return (
    <div onClick={onClick} className={cn("flex items-center gap-2.5 select-none", className)}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-300 hover:scale-105"
      >
        <defs>
          <linearGradient id="dk-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" /> {/* indigo-500 */}
            <stop offset="100%" stopColor="#a855f7" /> {/* purple-500 */}
          </linearGradient>
        </defs>

        {/* Comic panels (Koma) */}
        {/* Top-left panel */}
        <rect
          x="2"
          y="2"
          width="12"
          height="10"
          rx="2.5"
          fill="white"
          fillOpacity="0.03"
          stroke="url(#dk-logo-gradient)"
          strokeWidth="1.5"
          className="opacity-80"
        />
        {/* Bottom-left panel */}
        <rect
          x="2"
          y="15"
          width="12"
          height="15"
          rx="2.5"
          fill="white"
          fillOpacity="0.03"
          stroke="url(#dk-logo-gradient)"
          strokeWidth="1.5"
          className="opacity-90"
        />
        {/* Right panel */}
        <rect
          x="17"
          y="2"
          width="13"
          height="28"
          rx="3"
          fill="white"
          fillOpacity="0.03"
          stroke="url(#dk-logo-gradient)"
          strokeWidth="1.5"
        />

        {/* AI Sparkle at the gutter intersection (centered at x=15.5, y=13.5) */}
        <path
          d="M15.5 6.5 Q15.5 13.5 22.5 13.5 Q15.5 13.5 15.5 20.5 Q15.5 13.5 8.5 13.5 Q15.5 13.5 15.5 6.5 Z"
          fill="url(#dk-logo-gradient)"
          className="animate-pulse"
        />
      </svg>

      {showText && (
        <div className="flex flex-col justify-center leading-none">
          <span className="text-[14px] font-black tracking-widest text-white uppercase font-sans">
            DEEP<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366f1] to-[#a855f7] ml-0.5">KOMA</span>
          </span>
          {showSubtitle && (
            <span className="text-[8px] font-bold tracking-[0.22em] text-text-muted uppercase mt-0.5">
              AI Workspace
            </span>
          )}
        </div>
      )}
    </div>
  );
}
