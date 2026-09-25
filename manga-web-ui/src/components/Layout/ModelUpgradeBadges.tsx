import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Paintbrush, Loader2, Square, X } from 'lucide-react';
import { notify } from '../../utils/toast';
import { useToolStore } from '../../store/useToolStore';

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
  const setIsFluxReady = useToolStore((state) => state.setIsFluxReady);
  const highlightFluxBadge = useToolStore((state) => state.highlightFluxBadge);

  // 1. JoyCaption (Visual Context Translation Quality)
  const [joyStatus, setJoyStatus] = useState<ModelStatus>({
    status: 'idle',
    is_ready: false,
    progress: 0,
  });
  const [isJoyDownloading, setIsJoyDownloading] = useState(false);
  const joySseRef = useRef<EventSource | null>(null);

  // 2. FLUX.1-Fill GGUF Q5_K_M (SOTA Inpaint / Redraw)
  const [fluxStatus, setFluxStatus] = useState<ModelStatus>({
    status: 'idle',
    is_ready: false,
    progress: 0,
  });
  const [isFluxDownloading, setIsFluxDownloading] = useState(false);
  const fluxSseRef = useRef<EventSource | null>(null);

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
          setIsFluxReady(!!resFlux.is_ready);
          if (resFlux.status === 'downloading') startFluxSse();
        }
      } catch (e) {
        // Silent catch for local offline
      }
    };
    checkStatus();

    return () => {
      if (joySseRef.current) joySseRef.current.close();
      if (fluxSseRef.current) fluxSseRef.current.close();
    };
  }, [apiUrl]);

  // SSE for JoyCaption
  const startJoySse = () => {
    if (joySseRef.current) joySseRef.current.close();
    setIsJoyDownloading(true);
    const eventSource = new EventSource(`${apiUrl}/api/editor/joycaption/progress`);
    joySseRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: ModelStatus = JSON.parse(event.data);
        setJoyStatus(data);
        if (data.status === 'ready') {
          setIsJoyDownloading(false);
          eventSource.close();
          joySseRef.current = null;
          notify.success(
            'JoyCaption VLM đã sẵn sàng',
            'Hệ thống tự động phân tích nét mặt và bối cảnh để nâng cao chất lượng dịch.'
          );
        } else if (data.status === 'error') {
          setIsJoyDownloading(false);
          eventSource.close();
          joySseRef.current = null;
          notify.error(
            'Lỗi tải JoyCaption',
            data.error || 'Vui lòng kiểm tra kết nối mạng và thử lại sau.'
          );
        }
      } catch (err) {
        console.error(err);
      }
    };
    eventSource.onerror = () => {
      setIsJoyDownloading(false);
      eventSource.close();
      joySseRef.current = null;
    };
  };

  // SSE for FLUX-Fill
  const startFluxSse = () => {
    if (fluxSseRef.current) fluxSseRef.current.close();
    setIsFluxDownloading(true);
    const eventSource = new EventSource(`${apiUrl}/api/editor/flux/progress`);
    fluxSseRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: ModelStatus = JSON.parse(event.data);
        setFluxStatus(data);
        if (data.status === 'ready') {
          setIsFluxDownloading(false);
          setIsFluxReady(true);
          eventSource.close();
          fluxSseRef.current = null;
          notify.success(
            'FLUX.1-Fill đã sẵn sàng',
            'Công cụ Vẽ lại AI (Redraw) đã được mở khóa và sẵn sàng sử dụng.'
          );
        } else if (data.status === 'error') {
          setIsFluxDownloading(false);
          setIsFluxReady(false);
          eventSource.close();
          fluxSseRef.current = null;
          notify.error(
            'Lỗi tải FLUX.1-Fill',
            data.error || 'Vui lòng kiểm tra kết nối mạng và thử lại sau.'
          );
        }
      } catch (err) {
        console.error(err);
      }
    };
    eventSource.onerror = () => {
      setIsFluxDownloading(false);
      eventSource.close();
      fluxSseRef.current = null;
    };
  };

  // Trigger JoyCaption Preload
  const handleUpgradeJoyCaption = async () => {
    if (joyStatus.is_ready || isJoyDownloading) return;
    try {
      const res = await fetch(`${apiUrl}/api/editor/joycaption/preload`, { method: 'POST' });
      if (res.ok) {
        notify.download(
          'Đang bắt đầu tải ngầm JoyCaption (~15.8GB)',
          'Mô hình đang được tải về máy. Bạn vẫn có thể dịch truyện bình thường!'
        );
        startJoySse();
      }
    } catch (e) {
      notify.error('Không thể kết nối đến máy chủ', 'Không thể gửi yêu cầu tải mô hình JoyCaption.');
    }
  };

  // Cancel JoyCaption Download
  const handleCancelJoyCaption = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (joySseRef.current) {
      joySseRef.current.close();
      joySseRef.current = null;
    }
    setIsJoyDownloading(false);
    setJoyStatus((prev) => ({
      ...prev,
      status: 'idle',
      progress: 0,
      speed_formatted: undefined,
      downloaded_formatted: undefined,
    }));
    try {
      await fetch(`${apiUrl}/api/editor/joycaption/cancel`, { method: 'POST' });
      notify.warning('Đã dừng tải JoyCaption', 'Tiến trình tải ngầm mô hình đã được hủy bỏ.');
    } catch (e) {
      // ignore
    }
  };

  // Trigger FLUX-Fill Preload
  const handleUpgradeFlux = async () => {
    if (fluxStatus.is_ready || isFluxDownloading) return;
    try {
      const res = await fetch(`${apiUrl}/api/editor/flux/preload`, { method: 'POST' });
      if (res.ok) {
        notify.download(
          'Đang bắt đầu tải ngầm FLUX.1-Fill (~6.3GB)',
          'Mô hình đang được tải về máy. Bạn vẫn có thể dịch truyện bình thường!'
        );
        startFluxSse();
      }
    } catch (e) {
      notify.error('Không thể kết nối đến máy chủ', 'Không thể gửi yêu cầu tải mô hình FLUX.1-Fill.');
    }
  };

  // Cancel FLUX-Fill Download
  const handleCancelFlux = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (fluxSseRef.current) {
      fluxSseRef.current.close();
      fluxSseRef.current = null;
    }
    setIsFluxDownloading(false);
    setIsFluxReady(false);
    setFluxStatus((prev) => ({
      ...prev,
      status: 'idle',
      progress: 0,
      speed_formatted: undefined,
      downloaded_formatted: undefined,
    }));
    try {
      await fetch(`${apiUrl}/api/editor/flux/cancel`, { method: 'POST' });
      notify.warning('Đã dừng tải FLUX.1-Fill', 'Tiến trình tải ngầm mô hình đã được hủy bỏ.');
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className="flex items-center gap-1 bg-slate-900/50 border border-slate-700/60 p-0.5 rounded-lg shrink-0">
      {/* 1. Nút JoyCaption VLM */}
      <div className="relative group">
        {joyStatus.is_ready ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-400 bg-emerald-500/10 cursor-default select-none"
            title="JoyCaption VLM đã sẵn sàng"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>JoyCaption</span>
          </div>
        ) : isJoyDownloading ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/20"
            title="JoyCaption đang tải"
          >
            <Loader2 size={11} className="animate-spin text-indigo-400 shrink-0" />
            <span>Joy ({joyStatus.progress.toFixed(0)}%)</span>
            <button
              type="button"
              onClick={handleCancelJoyCaption}
              className="p-0.5 rounded hover:bg-rose-500/30 text-slate-400 hover:text-rose-400 transition cursor-pointer flex items-center justify-center ml-0.5"
              title="Hủy tải JoyCaption"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleUpgradeJoyCaption}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 cursor-pointer transition-all"
            title="Nâng cấp mô hình bối cảnh JoyCaption"
          >
            <Sparkles size={11} className="text-indigo-400" />
            <span>JoyCaption</span>
          </button>
        )}

        {/* Minimal Tooltip */}
        <div className="absolute right-0 top-[calc(100%+8px)] w-64 p-3 bg-slate-900/95 border border-slate-700/80 rounded-lg shadow-xl backdrop-blur-md opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 transition-all duration-150 z-[999] text-left">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5">
              <Sparkles size={12} className="text-indigo-400" /> JoyCaption VLM
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-medium">~15.8GB</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-snug mb-2">
            {joyStatus.is_ready
              ? 'Đã sẵn sàng. AI tự động phân tích nét mặt và bối cảnh để dịch chuẩn xác.'
              : isJoyDownloading
              ? 'Đang tải gói mô hình thị giác JoyCaption Beta One...'
              : 'Tải trước mô hình VLM để AI tự động hiểu sâu ngữ cảnh tranh.'}
          </p>
          {isJoyDownloading && (
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-300 font-mono">{joyStatus.downloaded_formatted || '0 GB'}</span>
                <span className="text-indigo-400 font-semibold font-mono">{joyStatus.speed_formatted || '0 MB/s'}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${joyStatus.progress}%` }} />
              </div>
              <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono">
                <span>{joyStatus.progress.toFixed(1)}%</span>
                <span>Còn lại: {joyStatus.eta_formatted || '--'}</span>
              </div>
              <button
                type="button"
                onClick={handleCancelJoyCaption}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-medium transition cursor-pointer"
              >
                <Square size={9} className="fill-current" /> Dừng tải mô hình
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Nút FLUX.1-Fill */}
      <div className="relative group">
        {fluxStatus.is_ready ? (
          <div
            id="flux-upgrade-badge"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-400 bg-emerald-500/10 cursor-default select-none"
            title="FLUX.1-Fill đã sẵn sàng"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>FLUX Fill</span>
          </div>
        ) : isFluxDownloading ? (
          <div
            id="flux-upgrade-badge"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/20"
            title="FLUX.1-Fill đang tải"
          >
            <Loader2 size={11} className="animate-spin text-indigo-400 shrink-0" />
            <span>FLUX ({fluxStatus.progress.toFixed(0)}%)</span>
            <button
              type="button"
              onClick={handleCancelFlux}
              className="p-0.5 rounded hover:bg-rose-500/30 text-slate-400 hover:text-rose-400 transition cursor-pointer flex items-center justify-center ml-0.5"
              title="Hủy tải FLUX.1-Fill"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            id="flux-upgrade-badge"
            onClick={handleUpgradeFlux}
            className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-300 ${
              highlightFluxBadge
                ? 'ring-2 ring-indigo-400 bg-indigo-500/30 text-white shadow-[0_0_25px_rgba(99,102,241,1)] scale-110 animate-pulse'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 cursor-pointer'
            }`}
            title="Nâng cấp mô hình vẽ lại FLUX.1-Fill"
          >
            {highlightFluxBadge && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-80" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500 shadow" />
              </span>
            )}
            <Paintbrush size={11} className={highlightFluxBadge ? 'text-indigo-300 animate-bounce' : 'text-indigo-400'} />
            <span className={highlightFluxBadge ? 'font-bold text-white' : ''}>FLUX Fill</span>
          </button>
        )}

        {/* Minimal Tooltip */}
        <div className="absolute right-0 top-[calc(100%+8px)] w-64 p-3 bg-slate-900/95 border border-slate-700/80 rounded-lg shadow-xl backdrop-blur-md opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 transition-all duration-150 z-[999] text-left">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5">
              <Paintbrush size={12} className="text-indigo-400" /> FLUX.1-Fill Q5_K_M
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-medium">~6.3GB</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-snug mb-2">
            {fluxStatus.is_ready
              ? 'Đã sẵn sàng. Dùng công cụ Redraw để vẽ lại mảng tranh nghệ thuật.'
              : isFluxDownloading
              ? 'Đang tải gói mô hình FLUX.1-Fill GGUF...'
              : 'Tải trước mô hình FLUX.1-Fill để tái tạo tranh vẽ nghệ thuật cao cấp.'}
          </p>
          {isFluxDownloading && (
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-300 font-mono">{fluxStatus.downloaded_formatted || '0 GB'}</span>
                <span className="text-indigo-400 font-semibold font-mono">{fluxStatus.speed_formatted || '0 MB/s'}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${fluxStatus.progress}%` }} />
              </div>
              <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono">
                <span>{fluxStatus.progress.toFixed(1)}%</span>
                <span>Còn lại: {fluxStatus.eta_formatted || '--'}</span>
              </div>
              <button
                type="button"
                onClick={handleCancelFlux}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-medium transition cursor-pointer"
              >
                <Square size={9} className="fill-current" /> Dừng tải mô hình
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
