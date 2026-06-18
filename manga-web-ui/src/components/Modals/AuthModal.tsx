import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../store/useAuthStore';
import { Wand2, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AuthModalProps {
  onClose?: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { t } = useTranslation();
  const { user, loading } = useAuthStore();
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');

  // 🚀 Nếu đã đăng nhập rồi thì ẩn cái bảng này đi
  if (user || loading) return null;

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || t('auth.googleLoginFailed'));
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center z-[9999]"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="bg-panel p-8 rounded-3xl border border-border shadow-2xl w-[400px] animate-in zoom-in-95 relative">
        {onClose && (
          <button 
            type="button"
            onClick={onClose} 
            className="absolute top-5 right-5 text-text-muted hover:text-text-main transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        )}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary/20 border border-primary/30 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <Wand2 className="text-primary" size={28} />
          </div>
          <h2 className="text-2xl font-black text-text-main tracking-tight">{t('auth.loginTitle')}</h2>
          <p className="text-sm text-text-muted mt-1 font-medium text-center">{t('auth.studioSubtitle')}</p>
        </div>

        {error && <div className="bg-danger/10 text-danger text-sm p-3 rounded-xl mb-6 text-center border border-danger/20 font-medium">{error}</div>}

        <button 
          type="button" 
          onClick={handleGoogleLogin} 
          disabled={authLoading} 
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-950 font-bold py-3.5 rounded-2xl text-sm transition-all cursor-pointer shadow-sm disabled:opacity-50 active:scale-[0.98]"
        >
          {authLoading ? (
            <Loader2 className="animate-spin text-gray-950" size={20} />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.53-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-8.72z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.11 0-5.74-2.11-6.68-4.96H1.21v3.15C3.18 21.88 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.32 14.24A7.16 7.16 0 0 1 5 12c0-.79.13-1.57.32-2.34V6.51H1.21A11.94 11.94 0 0 0 0 12c0 2.12.55 4.12 1.52 5.85l3.8-3.61z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.18 2.12 1.21 5.85l4.11 3.15c.94-2.85 3.57-4.96 6.68-4.96z"
                />
              </svg>
              {t('auth.continueWithGoogle')}
            </>
          )}
        </button>
      </div>
    </div>
  );
}