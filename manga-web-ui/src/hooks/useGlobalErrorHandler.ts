import { useEffect } from 'react';
import toast from 'react-hot-toast';

// 🛡️ Danh sách các mẫu lỗi do Browser Extension, User Scripts hoặc trình duyệt gây ra (không phải lỗi web app)
const IGNORED_ERROR_PATTERNS = [
  "Cannot read properties of undefined (reading 'M_ID')",
  "Cannot read property 'M_ID'",
  "reading 'M_ID'",
  "Could not establish connection. Receiving end does not exist",
  "The message port closed before a response was received",
  "Extension context invalidated",
  "ResizeObserver loop",
  "ResizeObserver loop completed with undelivered notifications",
  "ResizeObserver loop limit exceeded",
  "Script error.",
  "Non-Error promise rejection captured",
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
  "edge-extension://",
  "200.js",
  "10200.js",
  "inpage.js",
  "ethereum",
  "solana",
  "web3",
  "__gCrWeb",
  "vid_load",
  "metamask",
  "runtime.lastError",
  "message port closed",
];

/**
 * Kiểm tra xem một lỗi hoặc unhandled rejection có bắt nguồn từ extension trình duyệt hoặc bên ngoài hay không
 */
const isExtensionOrNoiseError = (eventOrReason: any): boolean => {
  if (!eventOrReason) return true;

  let msg = '';
  if (typeof eventOrReason === 'string') {
    msg = eventOrReason;
  } else if (eventOrReason instanceof Error) {
    msg = eventOrReason.message || '';
  } else if (eventOrReason.message) {
    msg = String(eventOrReason.message);
  } else if (eventOrReason.reason) {
    const r = eventOrReason.reason;
    msg = r instanceof Error ? r.message : String(r);
  }

  const stack = (
    eventOrReason?.stack ||
    eventOrReason?.error?.stack ||
    eventOrReason?.reason?.stack ||
    ''
  ).toString();

  const filename = (
    eventOrReason?.filename ||
    eventOrReason?.source ||
    ''
  ).toString();

  const fullText = `${msg} ${stack} ${filename}`.toLowerCase();

  // 1. Kiểm tra pattern lỗi extension
  for (const pattern of IGNORED_ERROR_PATTERNS) {
    if (fullText.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  // 2. Kiểm tra giao thức extension trong filename hoặc stack
  if (
    filename.startsWith('chrome-extension://') ||
    filename.startsWith('moz-extension://') ||
    filename.startsWith('safari-extension://') ||
    filename.startsWith('edge-extension://') ||
    filename.includes('/200.js') ||
    filename.includes('10200.js')
  ) {
    return true;
  }

  if (
    stack.includes('chrome-extension://') ||
    stack.includes('moz-extension://') ||
    stack.includes('safari-extension://') ||
    stack.includes('edge-extension://') ||
    stack.includes('200.js:') ||
    stack.includes('10200.js:')
  ) {
    return true;
  }

  return false;
};

// 🔇 Anti-spam: Chống hiện toast và beep dồn dập
const lastShownErrors = new Map<string, number>();
let lastBeepTime = 0;

const shouldShowErrorToast = (msg: string): boolean => {
  const now = Date.now();
  const lastTime = lastShownErrors.get(msg) || 0;
  if (now - lastTime < 5000) {
    return false; // Bỏ qua nếu lỗi trùng lặp xuất hiện trong vòng 5 giây
  }

  // Dọn dẹp cache
  if (lastShownErrors.size > 50) {
    for (const [k, v] of lastShownErrors.entries()) {
      if (now - v > 10000) lastShownErrors.delete(k);
    }
  }

  lastShownErrors.set(msg, now);
  return true;
};

// 🚀 BẢN VÁ: Chặn lỗi AudioContext chưa cấp quyền của Chrome và giới hạn tần suất
const playErrorBeep = () => {
  try {
    const now = Date.now();
    if (now - lastBeepTime < 2500) return; // Tối đa 1 lần beep mỗi 2.5 giây
    lastBeepTime = now;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    // Im lặng
  }
};

export const useGlobalErrorHandler = () => {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (isExtensionOrNoiseError(event) || isExtensionOrNoiseError(event.error)) {
        return;
      }

      const rawMsg = event.message || 'Lỗi hệ thống không xác định';
      if (!shouldShowErrorToast(rawMsg)) return;

      playErrorBeep();
      toast.error(`HỆ THỐNG LỖI: ${rawMsg}`, {
        duration: 5000,
        style: { background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', border: '2px solid #ef4444' },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isExtensionOrNoiseError(event) || isExtensionOrNoiseError(event.reason)) {
        // Ngăn chặn ghi log đỏ ồn ào và chặn hiển thị toast
        try {
          event.preventDefault();
        } catch (_) {}
        return;
      }

      let msg = 'Máy chủ không phản hồi hoặc mất kết nối mạng!';
      if (event.reason instanceof Error) {
        msg = event.reason.message;
      } else if (typeof event.reason === 'string') {
        msg = event.reason;
      }

      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
        msg = 'KHÔNG TÌM THẤY MÁY CHỦ AI! Hãy kiểm tra xem Backend (main.py) đã chạy chưa?';
      }

      if (!shouldShowErrorToast(msg)) return;

      playErrorBeep();
      toast.error(`CẢNH BÁO: ${msg}`, {
        duration: 5000,
        style: { background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', border: '1px solid #f87171' },
      });
    };

    const originalAlert = window.alert;
    window.alert = (msg) => {
      if (typeof msg === 'string' && isExtensionOrNoiseError(msg)) return;
      const strMsg = String(msg);
      if (!shouldShowErrorToast(strMsg)) return;

      playErrorBeep();
      toast.error(`Cảnh báo: ${strMsg}`, {
        style: { background: '#333', color: '#fff', border: '1px solid #ef4444' },
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.alert = originalAlert;
    };
  }, []);
};