import { useState, useEffect } from 'react';

// ==========================================
// 1. THUẬT TOÁN TỰ ĐỘNG THU PHÓNG & NGẮT DÒNG (AUTO-FIT)
// ==========================================
export interface AutoFitConstraints {
  text: string;
  fontFamily: string;
  maxWidth: number;
  maxHeight: number;
  minSize?: number;
  maxSize?: number;
  lineHeight?: number;
}

export const calculateAutoFitText = (
  ctx: CanvasRenderingContext2D,
  constraints: AutoFitConstraints
): { optimalSize: number; wrappedText: string } => {
  const { 
    text, fontFamily, maxWidth, maxHeight, 
    minSize = 10, maxSize = 150, lineHeight = 1.2 
  } = constraints;
  
  let low = minSize;
  let high = maxSize;
  let optimalSize = minSize;
  let bestText = text;

  const tokens = text.split(/(\s+)/);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    ctx.font = `bold ${mid}px "${fontFamily}"`;

    let currentLine = "";
    let lines: string[] = [];
    let isWidthValid = true;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === '\n') {
          lines.push(currentLine);
          currentLine = "";
          continue;
      }
      
      const metrics = ctx.measureText(currentLine + token);
      if (metrics.width <= maxWidth) {
        currentLine += token;
      } else {
        if (currentLine !== "") lines.push(currentLine);
        currentLine = token.trimStart();
        
        if (ctx.measureText(currentLine).width > maxWidth) {
          isWidthValid = false;
          break;
        }
      }
    }
    lines.push(currentLine);

    const totalHeight = lines.length * (mid * lineHeight);

    if (isWidthValid && totalHeight <= maxHeight) {
      optimalSize = mid;
      bestText = lines.join('\n');
      low = mid + 1; 
    } else {
      high = mid - 1; 
    }
  }
  
  return { optimalSize, wrappedText: bestText.trim() };
};

// ==========================================
// 2. HOOK TẢI FONT ĐỘNG (CHỐNG LỖI CANVAS)
// ==========================================
export const useDynamicFont = (fontFamily: string, fontUrl: string) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!fontFamily || !fontUrl) return;

    const checkFont = document.fonts.check(`12px "${fontFamily}"`);
    if (checkFont) {
      setIsLoaded(true);
      return;
    }

    const loadFont = async () => {
      try {
        setIsLoaded(false);
        const font = new FontFace(fontFamily, `url(${fontUrl})`);
        const loadedFont = await font.load();
        document.fonts.add(loadedFont);
        setIsLoaded(true);
      } catch (err) {
        console.error(`⚠️ Lỗi tải font ${fontFamily}:`, err);
        setError(err as Error);
      }
    };

    loadFont();
  }, [fontFamily, fontUrl]);

  return { isLoaded, error };
};

// ==========================================
// 3. DANH SÁCH FONT CHUẨN OFL (VIỆT HÓA MƯỢT MÀ)
// ==========================================
export const MANGA_FONTS = [
  { 
    name: "Playpen Sans", 
    url: "https://fonts.gstatic.com/s/playpensans/v1/25aprw_woC254823VjU76hA.woff2",
    type: "Thoại thường" 
  },
  { 
    name: "Be Vietnam Pro", 
    url: "https://fonts.gstatic.com/s/bevietnampro/v11/WwkQxPq1BGJTToeHPeEZ2h2XQ5c_wBw.woff2",
    type: "Giao diện/Hệ thống"
  },
  { 
    name: "Patrick Hand", 
    url: "https://fonts.gstatic.com/s/patrickhand/v13/LDI1apSQOAYtSuYWp8Z_WQI.woff2",
    type: "Chữ viết tay"
  }
];