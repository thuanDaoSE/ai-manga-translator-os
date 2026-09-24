import React, { useState, useEffect } from 'react';
import { Sparkles, Paintbrush, Loader2, CheckCircle2, AlertCircle, ArrowUpRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface ModelStatus {
  status: 'idle' | 'downloading' | 'ready' | 'error';
  is_ready: boolean;
  progress: number;
  downloaded_formatted?: string;
  speed_formatted?: string;
  eta_formatted?: string;
  error?: string;
}

export const ModelUpgradeBadges: React.FC = () => {
  const apiUrl = import.meta.env.VITE_API_URL || '';

  // 1. JoyCaption (Visual Context Translation Quality)
  const [joyStatus, setJoyStatus] = useState<ModelStatus>({
    status: 'idle',
    is_ready: false,
    progress: 0,
  });
  const [isJoyDownloading, setIsJoyDownloading] = useState(false);

  // 2. FLUX.1-Fill GGUF Q5_K_M (SOTA Inpaint / Redraw)
  const [fluxStatus, setFluxStatus] = useState<ModelStatus>({
    status: 'idle',
    is_ready: false,
    progress: 0,
  });
  const [isFluxDownloading, setIsFluxDownloading] = useState(false);

  // Fetch initial status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const [resJoy, resFlux] = await Promise.all([
          fetch(`${apiUrl}/api/editor/joycaption/status`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${apiUrl}/api/editor/flux/status`).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (resJoy) {
          setJoyStatus(resJoy);
          if (resJoy.status === 'downloading') startJoySse();
        }
        if (resFlux) {
          setFluxStatus(resFlux);
          if (resFlux.status === 'downloading') startFluxSse();
        }
      } catch (e) {
        // Silent catch for local offline
      }
    };
    checkStatus();
  }, [apiUrl]);

  // SSE for JoyCaption
  const startJoySse = () => {
    setIsJoyDownloading(true);
    const eventSource = new EventSource(`${apiUrl}/api/editor/joycaption/progress`);
    eventSource.onmessage = (event) => {
      try {
        const data: ModelStatus = JSON.parse(event.data);
        setJoyStatus(data);
        if (data.status === 'ready') {
          setIsJoyDownloading(false);
          eventSource.close();
          toast.success('🧠 Nâng cấp JoyCaption VLM thành công! Bản dịch giờ đây sẽ hiểu sâu bối cảnh tranh.');
        } else if (data.status === 'error') {
          setIsJoyDownloading(false);
          eventSource.close();
          toast.error(`Lỗi tải JoyCaption: ${data.error || 'Vui lòng thử lại sau'}`);
        }
      } catch (err) {
        console.error(err);
      }
    };
    eventSource.onerror = () => {
      setIsJoyDownloading(false);
      eventSource.close();
    };
  };

  // SSE for FLUX-Fill
  const startFluxSse = () => {
    setIsFluxDownloading(true);
    const eventSource = new EventSource(`${apiUrl}/api/editor/flux/progress`);
    eventSource.onmessage = (event) => {
      try {
        const data: ModelStatus = JSON.parse(event.data);
        setFluxStatus(data);
        if (data.status === 'ready') {
          setIsFluxDownloading(false);
          eventSource.close();
          toast.success('🎨 Nâng cấp FLUX.1-Fill GGUF thành công! Bạn có thể xóa/vẽ lại mảng tranh nghệ thuật chuyên sâu.');
        } else if (data.status === 'error') {
          setIsFluxDownloading(false);
          eventSource.close();
          toast.error(`Lỗi tải FLUX.1-Fill: ${data.error || 'Vui lòng thử lại sau'}`);
        }
      } catch (err) {
        console.error(err);
      }
    };
    eventSource.onerror = () => {
      setIsFluxDownloading(false);
      eventSource.close();
    };
  };

  // Trigger JoyCaption Preload
  const handleUpgradeJoyCaption = async () => {
    if (joyStatus.is_ready || isJoyDownloading) return;
    try {
      const res = await fetch(`${apiUrl}/api/editor/joycaption/preload`, { method: 'POST' });
      if (res.ok) {
        toast('Đang bắt đầu tải ngầm JoyCaption Beta One (~7GB)... Bạn vẫn có thể dịch truyện bình thường!', {
          icon: '⏳',
          duration: 6000,
        });
        startJoySse();
      }
    } catch (e) {
      toast.error('Không thể kết nối đến máy chủ để tải JoyCaption');
    }
  };

  // Trigger FLUX-Fill Preload
  const handleUpgradeFlux = async () => {
    if (fluxStatus.is_ready || isFluxDownloading) return;
    try {
      const res = await fetch(`${apiUrl}/api/editor/flux/preload`, { method: 'POST' });
      if (res.ok) {
        toast('Đang bắt đầu tải ngầm FLUX.1-Fill GGUF (~8.5GB)... Bạn vẫn có thể dịch truyện bình thường!', {
          icon: '⏳',
          duration: 6000,
        });
        startFluxSse();
      }
    } catch (e) {
      toast.error('Không thể kết nối đến máy chủ để tải FLUX.1-Fill');
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* 1. NÚT NÂNG CẤP CHẤT LƯỢNG DỊCH (JoyCaption) */}
      <div className="relative group">
        <button
          onClick={handleUpgradeJoyCaption}
          disabled={joyStatus.is_ready || isJoyDownloading}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border shadow-sm ${
            joyStatus.is_ready
              ? 'bg-emerald-950/30 text-emerald-300 border-emerald-500/40 cursor-default'
              : isJoyDownloading
              ? 'bg-purple-950/40 text-purple-300 border-purple-500/50 cursor-wait'
              : 'bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-white border-white/10 hover:border-purple-500/40 cursor-pointer hover:shadow-[0_0_10px_rgba(168,85,247,0.2)]'
          }`}
        >
          {joyStatus.is_ready ? (
            <>
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span>Dịch ngữ cảnh VLM: BẬT</span>
            </>
          ) : isJoyDownloading ? (
            <>
              <Loader2 size={12} className="animate-spin text-purple-400" />
              <span>Tải VLM ({joyStatus.progress.toFixed(0)}%)</span>
            </>
          ) : (
            <>
              <Sparkles size={12} className="text-purple-400 group-hover:animate-pulse" />
              <span>Nâng cấp chất lượng dịch</span>
              <ArrowUpRight size={11} className="opacity-60" />
            </>
          )}
        </button>

        {/* Tooltip / Popup Tiến trình */}
        <div className="absolute left-0 top-full mt-2 w-64 p-2.5 bg-[#141417]/95 border border-white/10 rounded-xl shadow-xl backdrop-blur-md opacity-0 pointer-events-none group-hover:opacity-100 transition-all z-50 text-left">
          <div className="text-[11px] font-bold text-white flex items-center gap-1.5 mb-1">
            <Sparkles size={12} className="text-purple-400" />
            <span>Mô hình JoyCaption Beta One</span>
          </div>
          <div className="text-[10px] text-neutral-400 leading-relaxed mb-2">
            {joyStatus.is_ready
              ? 'Đã tích hợp vào luồng dịch. DeepSeek AI đang phân tích bối cảnh biểu cảm tranh để xưng hô tự nhiên nhất.'
              : isJoyDownloading
              ? `Đang tải ngầm: ${joyStatus.downloaded_formatted || ''} (${joyStatus.speed_formatted || ''}) • Còn ~${joyStatus.eta_formatted || ''}`
              : 'Bấm để kích hoạt tải ngầm mô hình thị giác AI (~7GB). Không làm gián đoạn việc dịch truyện của bạn!'}
          </div>
          {isJoyDownloading && (
            <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-indigo-500 h-1.5 transition-all duration-300"
                style={{ width: `${joyStatus.progress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 2. NÚT NÂNG CẤP REDRAW NÂNG CAO (FLUX.1-Fill GGUF) */}
      <div className="relative group">
        <button
          onClick={handleUpgradeFlux}
          disabled={fluxStatus.is_ready || isFluxDownloading}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border shadow-sm ${
            fluxStatus.is_ready
              ? 'bg-emerald-950/30 text-emerald-300 border-emerald-500/40 cursor-default'
              : isFluxDownloading
              ? 'bg-blue-950/40 text-blue-300 border-blue-500/50 cursor-wait'
              : 'bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-white border-white/10 hover:border-blue-500/40 cursor-pointer hover:shadow-[0_0_10px_rgba(59,130,246,0.2)]'
          }`}
        >
          {fluxStatus.is_ready ? (
            <>
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span>FLUX.1-Fill: BẬT</span>
            </>
          ) : isFluxDownloading ? (
            <>
              <Loader2 size={12} className="animate-spin text-blue-400" />
              <span>Tải FLUX ({fluxStatus.progress.toFixed(0)}%)</span>
            </>
          ) : (
            <>
              <Paintbrush size={12} className="text-blue-400 group-hover:scale-110 transition-transform" />
              <span>Nâng cấp Redraw SOTA</span>
              <ArrowUpRight size={11} className="opacity-60" />
            </>
          )}
        </button>

        {/* Tooltip / Popup Tiến trình */}
        <div className="absolute left-0 top-full mt-2 w-64 p-2.5 bg-[#141417]/95 border border-white/10 rounded-xl shadow-xl backdrop-blur-md opacity-0 pointer-events-none group-hover:opacity-100 transition-all z-50 text-left">
          <div className="text-[11px] font-bold text-white flex items-center gap-1.5 mb-1">
            <Paintbrush size={12} className="text-blue-400" />
            <span>FLUX.1-Fill-dev (GGUF Q5_K_M)</span>
          </div>
          <div className="text-[10px] text-neutral-400 leading-relaxed mb-2">
            {fluxStatus.is_ready
              ? 'Đã sẵn sàng. Bạn có thể sử dụng công cụ Redraw nghệ thuật để vẽ lại các chi tiết tranh phức tạp sau khi xóa chữ.'
              : isFluxDownloading
              ? `Đang tải ngầm: ${fluxStatus.downloaded_formatted || ''} (${fluxStatus.speed_formatted || ''}) • Còn ~${fluxStatus.eta_formatted || ''}`
              : 'Bấm để kích hoạt tải bản nén siêu nhẹ GGUF Q5_K_M (~8.5GB) + ControlNet. Vẫn dùng LaMa inpaint bình thường trong lúc tải.'}
          </div>
          {isFluxDownloading && (
            <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-cyan-500 h-1.5 transition-all duration-300"
                style={{ width: `${fluxStatus.progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
