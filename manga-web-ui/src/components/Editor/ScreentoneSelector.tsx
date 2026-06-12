import React from 'react';

export type ScreentoneType = 'solid' | 'dots' | 'lines_diagonal' | 'crosshatch';

/**
 * Task 1: Hàm tiện ích tạo Canvas Pattern từ các nét Screentone truyền thống
 * @param ctx Context 2D của Canvas chính
 * @param type Loại screentone ('solid' | 'dots' | 'lines_diagonal' | 'crosshatch')
 * @param color Màu sắc của họa tiết (mặc định đen/xám)
 */
export const createScreentonePattern = (
  ctx: CanvasRenderingContext2D,
  type: ScreentoneType,
  color: string = '#000000'
): CanvasPattern | string => {
  if (type === 'solid') {
    return color; // Trả về mã màu trực tiếp cho nét vẽ đặc (solid)
  }

  // Khởi tạo off-screen canvas để làm mẫu pattern
  const patternCanvas = document.createElement('canvas');
  const patternCtx = patternCanvas.getContext('2d');
  
  if (!patternCtx) {
    return color;
  }

  // Clear nền trong suốt để có thể vẽ đè lên hình ảnh khác
  let size = 4;
  if (type === 'dots') {
    size = 4;
    patternCanvas.width = size;
    patternCanvas.height = size;
    patternCtx.clearRect(0, 0, size, size);
    patternCtx.fillStyle = color;

    // Vẽ điểm chính giữa siêu nhỏ (halftone siêu mịn)
    patternCtx.beginPath();
    patternCtx.arc(size / 2, size / 2, 1.1, 0, 2 * Math.PI);
    patternCtx.fill();

    // Vẽ các điểm bù góc để tạo sự liên mạch khi lặp lại (seamless repeat)
    patternCtx.beginPath();
    patternCtx.arc(0, 0, 0.55, 0, 2 * Math.PI);
    patternCtx.arc(size, 0, 0.55, 0, 2 * Math.PI);
    patternCtx.arc(0, size, 0.55, 0, 2 * Math.PI);
    patternCtx.arc(size, size, 0.55, 0, 2 * Math.PI);
    patternCtx.fill();
  } 
  else if (type === 'lines_diagonal') {
    size = 6;
    patternCanvas.width = size;
    patternCanvas.height = size;
    patternCtx.clearRect(0, 0, size, size);
    patternCtx.strokeStyle = color;
    patternCtx.lineWidth = 0.8; // Độ dày nét siêu mảnh (0.8px)

    // Đường chéo chính
    patternCtx.beginPath();
    patternCtx.moveTo(0, size);
    patternCtx.lineTo(size, 0);

    // Đường nét phụ ở các góc để tránh hở mép lặp
    patternCtx.moveTo(-1, size - 1);
    patternCtx.lineTo(size - 1, -1);
    patternCtx.moveTo(1, size + 1);
    patternCtx.lineTo(size + 1, 1);
    patternCtx.stroke();
  } 
  else if (type === 'crosshatch') {
    size = 6;
    patternCanvas.width = size;
    patternCanvas.height = size;
    patternCtx.clearRect(0, 0, size, size);
    patternCtx.strokeStyle = color;
    patternCtx.lineWidth = 0.8; // Đường đan chéo siêu mảnh

    // Nét chéo phải chính & phụ
    patternCtx.beginPath();
    patternCtx.moveTo(0, size);
    patternCtx.lineTo(size, 0);
    patternCtx.moveTo(-1, size - 1);
    patternCtx.lineTo(size - 1, -1);
    patternCtx.moveTo(1, size + 1);
    patternCtx.lineTo(size + 1, 1);

    // Nét chéo trái chính & phụ
    patternCtx.moveTo(0, 0);
    patternCtx.lineTo(size, size);
    patternCtx.moveTo(1, -1);
    patternCtx.lineTo(size + 1, size - 1);
    patternCtx.moveTo(-1, 1);
    patternCtx.lineTo(size - 1, size + 1);
    
    patternCtx.stroke();
  } else {
    return color;
  }

  const pattern = ctx.createPattern(patternCanvas, 'repeat');
  
  // Tránh việc transform pattern theo brush size, giữ kích thước họa tiết luôn cố định 1:1
  if (pattern) {
    const matrix = new DOMMatrix();
    pattern.setTransform(matrix);
  }

  return pattern || color;
};

interface ScreentoneSelectorProps {
  activePattern: ScreentoneType;
  onChange: (type: ScreentoneType) => void;
  color?: string;
}

/**
 * Task 2: Component chọn mẫu Screentone
 */
export const ScreentoneSelector: React.FC<ScreentoneSelectorProps> = ({
  activePattern,
  onChange,
  color = '#4f46e5' // Màu preview mặc định (ví dụ màu Indigo)
}) => {
  
  // Danh sách các mẫu sọc/tone vẽ manga
  const PATTERNS: { id: ScreentoneType; name: string; previewSVG: React.ReactNode }[] = [
    {
      id: 'solid',
      name: 'Màu đặc',
      previewSVG: (
        <div className="w-full h-full rounded" style={{ backgroundColor: color }} />
      )
    },
    {
      id: 'dots',
      name: 'Hạt Halftone',
      previewSVG: (
        <svg className="w-full h-full text-white/80" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="3" />
          <circle cx="4" cy="4" r="1.5" />
          <circle cx="20" cy="4" r="1.5" />
          <circle cx="4" cy="20" r="1.5" />
          <circle cx="20" cy="20" r="1.5" />
        </svg>
      )
    },
    {
      id: 'lines_diagonal',
      name: 'Sọc chéo',
      previewSVG: (
        <svg className="w-full h-full text-white/85" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <line x1="0" y1="24" x2="24" y2="0" />
          <line x1="0" y1="12" x2="12" y2="0" />
          <line x1="12" y1="24" x2="24" y2="12" />
        </svg>
      )
    },
    {
      id: 'crosshatch',
      name: 'Đan chéo',
      previewSVG: (
        <svg className="w-full h-full text-white/85" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <line x1="0" y1="24" x2="24" y2="0" />
          <line x1="0" y1="0" x2="24" y2="24" />
        </svg>
      )
    }
  ];

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">
        Họa tiết Manga (Screentone)
      </span>
      <div className="flex items-center gap-2 bg-[#1a1a1a] p-1.5 rounded-xl border border-gray-800 w-fit">
        {PATTERNS.map((pattern) => {
          const isActive = activePattern === pattern.id;
          return (
            <button
              key={pattern.id}
              type="button"
              onClick={() => onChange(pattern.id)}
              className={`w-10 h-10 rounded-lg p-1 transition-all duration-200 cursor-pointer flex items-center justify-center relative group
                ${isActive 
                  ? 'border-2 border-blue-500 bg-blue-500/10 shadow-[0_0_10px_rgba(59,130,246,0.3)]' 
                  : 'border border-gray-800 bg-neutral-900/40 hover:border-gray-700 hover:bg-neutral-800/60'
                }
              `}
              title={pattern.name}
            >
              {pattern.previewSVG}
              
              {/* Tooltip nhỏ khi di chuột */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[9px] font-bold py-1 px-2 rounded shadow-md pointer-events-none whitespace-nowrap z-50 border border-gray-800">
                {pattern.name}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
