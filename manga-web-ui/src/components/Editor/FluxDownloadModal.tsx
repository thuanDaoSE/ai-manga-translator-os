import React, { useState, useEffect } from "react";
import { Sparkles, Download, CheckCircle2, AlertCircle, X, Minimize2, Maximize2, Loader2, HardDrive } from "lucide-react";
import { mangaApi } from "../../services/api";

interface FluxDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReady?: () => void;
}

export const FluxDownloadModal: React.FC<FluxDownloadModalProps> = ({
  isOpen,
  onClose,
  onReady,
}) => {
  const [status, setStatus] = useState<"idle" | "downloading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [downloadedFormatted, setDownloadedFormatted] = useState("0 GB / 31.4 GB");
  const [speedFormatted, setSpeedFormatted] = useState("0 MB/s");
  const [etaFormatted, setEtaFormatted] = useState("--");
  const [errorMessage, setErrorMessage] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);

  // Poll status while modal is active or downloading
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const data = await mangaApi.getFluxStatus();
        if (!isMounted) return;

        setStatus(data.status || (data.is_ready ? "ready" : "idle"));
        setProgress(data.progress || (data.is_ready ? 100 : 0));
        if (data.downloaded_formatted) setDownloadedFormatted(data.downloaded_formatted);
        if (data.speed_formatted) setSpeedFormatted(data.speed_formatted);
        if (data.eta_formatted) setEtaFormatted(data.eta_formatted);
        if (data.error) setErrorMessage(data.error);

        if (data.is_ready && onReady) {
          onReady();
        }
      } catch (err) {
        console.error("Lỗi lấy trạng thái FLUX:", err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, onReady]);

  const handleStartDownload = async () => {
    try {
      setStatus("downloading");
      setErrorMessage("");
      const res = await mangaApi.preloadFlux();
      if (res.status === "ready") {
        setStatus("ready");
        setProgress(100);
        if (onReady) onReady();
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Không thể kích hoạt tải FLUX");
    }
  };

  if (!isOpen) return null;

  // Minimized floating pill in bottom right
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-neutral-900/90 backdrop-blur-xl border border-indigo-500/30 text-white px-4 py-2.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center gap-2">
          {status === "downloading" ? (
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          ) : status === "ready" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <HardDrive className="w-4 h-4 text-indigo-400" />
          )}
          <span className="text-xs font-semibold">
            {status === "downloading" ? `Đang tải FLUX: ${progress.toFixed(0)}%` : status === "ready" ? "FLUX Sẵn sàng" : "FLUX Model"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white transition-colors"
            title="Mở rộng"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white transition-colors"
            title="Đóng"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-neutral-900/95 border border-white/10 rounded-3xl p-6 shadow-2xl text-white overflow-hidden backdrop-blur-2xl">
        {/* Ambient background glow */}
        <div className="absolute -top-24 -left-24 w-60 h-60 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header Controls */}
        <div className="flex items-center justify-between relative z-10 mb-4">
          <div className="flex items-center gap-2 text-indigo-400">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Tải Mô Hình FLUX.1 Redraw
                <span className="text-[10px] uppercase font-black bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/30">
                  On-Demand
                </span>
              </h3>
              <p className="text-xs text-neutral-400">FLUX.1 Schnell Inpainting Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 hover:bg-white/10 rounded-xl text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Thu nhỏ để tiếp tục làm việc"
            >
              <Minimize2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-xl text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Đóng"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="relative z-10 space-y-5">
          <p className="text-xs text-neutral-300 leading-relaxed">
            Để giữ Docker image gọn nhẹ, mô hình FLUX (~31.4 GB) được tải trực tiếp từ Hugging Face về bộ đệm GPU. 
            <strong className="text-indigo-300"> Chỉ cần tải duy nhất 1 lần đầu tiên</strong> trên phiên máy này.
          </p>

          {/* Progress Bar Container */}
          <div className="bg-neutral-950/60 border border-white/5 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
                {status === "downloading" ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                    Đang tải về máy GPU...
                  </>
                ) : status === "ready" ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Đã tải hoàn tất và sẵn sàng!
                  </>
                ) : status === "error" ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    Tải gặp sự cố
                  </>
                ) : (
                  <>
                    <HardDrive className="w-3.5 h-3.5 text-neutral-400" />
                    Chưa tải về bộ đệm
                  </>
                )}
              </span>
              <span className="font-mono font-bold text-sm text-indigo-400">
                {progress.toFixed(1)}%
              </span>
            </div>

            {/* Glowing Bar */}
            <div className="w-full h-3 bg-neutral-900 rounded-full overflow-hidden p-0.5 border border-white/5 relative">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 transition-all duration-300 shadow-[0_0_12px_rgba(99,102,241,0.5)]"
                style={{ width: `${Math.max(progress, status === "downloading" ? 3 : 0)}%` }}
              />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-neutral-400 font-mono">
              <div className="bg-neutral-900/60 p-2 rounded-xl border border-white/5 text-center">
                <div className="text-[10px] text-neutral-500 font-sans">Đã tải</div>
                <div className="font-bold text-neutral-200 mt-0.5">{downloadedFormatted}</div>
              </div>
              <div className="bg-neutral-900/60 p-2 rounded-xl border border-white/5 text-center">
                <div className="text-[10px] text-neutral-500 font-sans">Tốc độ</div>
                <div className="font-bold text-indigo-300 mt-0.5">{speedFormatted}</div>
              </div>
              <div className="bg-neutral-900/60 p-2 rounded-xl border border-white/5 text-center">
                <div className="text-[10px] text-neutral-500 font-sans">Còn lại</div>
                <div className="font-bold text-neutral-200 mt-0.5">{etaFormatted}</div>
              </div>
            </div>
          </div>

          {/* Error display if any */}
          {status === "error" && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage || "Quá trình tải bị gián đoạn. Vui lòng kiểm tra kết nối mạng và thử lại."}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            {status === "idle" || status === "error" ? (
              <button
                type="button"
                onClick={handleStartDownload}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white text-xs font-bold rounded-2xl transition-all shadow-lg shadow-indigo-600/25 cursor-pointer"
              >
                <Download size={16} />
                <span>Bắt đầu tải mô hình FLUX</span>
              </button>
            ) : status === "downloading" ? (
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-2xl transition-all border border-white/10 cursor-pointer"
              >
                <Minimize2 size={15} />
                <span>Thu nhỏ (Tiếp tục dịch truyện trong nền)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/25 cursor-pointer"
              >
                <CheckCircle2 size={16} />
                <span>Sẵn sàng! Tiếp tục vẽ</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
