import { useState } from "react";
import { X, HelpCircle, Loader2 } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import toast from "react-hot-toast";
import emailjs from "@emailjs/browser";
import { useTranslation, Trans } from "react-i18next";

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      return toast.error(t('supportModal.emptyMessageError'));
    }

    setLoading(true);
    const loadId = toast.loading(t('supportModal.sendingReport'));

    // Auto-capture Diagnostics
    let webglStatus = "Lỗi/Mất context";
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        webglStatus = "Hoạt động tốt";
      }
    } catch (err) {
      console.error("Lỗi kiểm tra WebGL:", err);
    }

    const userEmail = user?.email || "Khách";
    const userAgent = navigator.userAgent;
    const screenRes = `${window.innerWidth}x${window.innerHeight}`;
    const currentUrl = window.location.href;

    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || "ĐIỀN_SERVICE_ID_CỦA_SẾP";
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "ĐIỀN_TEMPLATE_ID_CỦA_SẾP";
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "ĐIỀN_PUBLIC_KEY_CỦA_SẾP";

    const templateParams = {
      user_email: userEmail,
      message: message,
      user_agent: userAgent,
      screen_res: screenRes,
      webgl_status: webglStatus,
      current_url: currentUrl,
    };

    try {
      await emailjs.send(serviceId, templateId, templateParams, publicKey);
      toast.success(t('supportModal.sendSuccess'), { id: loadId });
      setMessage("");
      onClose();
    } catch (error: any) {
      console.error("Lỗi EmailJS:", error);
      toast.error(error?.text || t('supportModal.sendFailed'), { id: loadId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center z-[9999] animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="bg-panel p-6 rounded-3xl border border-border shadow-2xl w-[500px] flex flex-col animate-in zoom-in-95 duration-300 relative text-text-main">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute top-5 right-5 text-text-muted hover:text-text-main transition-colors cursor-pointer disabled:opacity-50"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5 border-b border-border pb-4 pr-10">
          <div className="p-2.5 bg-primary/20 rounded-xl text-primary shadow-inner">
            <HelpCircle size={22} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black tracking-tight uppercase">{t('supportModal.title')}</h2>
            <p className="text-[11px] text-text-muted mt-0.5">{t('supportModal.subtitle')}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{t('supportModal.labelDesc')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('supportModal.placeholder')}
              disabled={loading}
              rows={5}
              className="w-full bg-background border border-border rounded-xl p-3.5 text-xs text-text-main placeholder-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none disabled:opacity-50"
            />
            <p className="text-[11px] text-text-muted/80 leading-relaxed mt-1">
              <Trans i18nKey="supportModal.tip">
                💡 <span className="font-bold text-primary">Mẹo:</span> Hãy mô tả ngắn gọn. Admin sẽ phản hồi qua email của bạn và bạn có thể đính kèm ảnh chụp màn hình tại đó.
              </Trans>
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 mt-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-border hover:bg-border/40 text-text-muted hover:text-text-main rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              {t('supportModal.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-md flex items-center gap-1.5"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? t('supportModal.sending') : t('supportModal.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
