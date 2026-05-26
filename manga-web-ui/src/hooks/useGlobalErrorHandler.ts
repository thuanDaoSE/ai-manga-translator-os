import { useEffect } from 'react';
import toast from 'react-hot-toast';

// 🚀 BẢN VÁ: Chặn lỗi AudioContext chưa cấp quyền của Chrome
const playErrorBeep = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') return; // Trình duyệt chưa cho phép thì im lặng luôn, không báo lỗi đỏ

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle'; 
    osc.frequency.setValueAtTime(450, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime); 
    osc.start();
    osc.stop(ctx.currentTime + 0.15); 
  } catch(e) {
    // Im lặng
  }
};

export const useGlobalErrorHandler = () => {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message.includes('ResizeObserver')) return;
      playErrorBeep();
      toast.error(`HỆ THỐNG LỖI: ${event.message}`, { 
        duration: 5000, 
        style: { background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', border: '2px solid #ef4444' }
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      playErrorBeep();
      let msg = 'Máy chủ không phản hồi hoặc mất kết nối mạng!';
      
      if (event.reason instanceof Error) {
        msg = event.reason.message;
      } else if (typeof event.reason === 'string') {
        msg = event.reason;
      }
      
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = "KHÔNG TÌM THẤY MÁY CHỦ AI! Hãy kiểm tra xem Backend (main.py) đã chạy chưa?";
      }

      toast.error(`CẢNH BÁO: ${msg}`, { 
        duration: 5000, 
        style: { background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', border: '1px solid #f87171' }
      });
    };

    const originalAlert = window.alert;
    window.alert = (msg) => {
       playErrorBeep();
       toast.error(`Cảnh báo: ${msg}`, { 
         style: { background: '#333', color: '#fff', border: '1px solid #ef4444' }
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