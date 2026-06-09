import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../store/useAuthStore';
import { Wand2, Mail, Lock, Loader2, X } from 'lucide-react';

interface AuthModalProps {
  onClose?: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { user, loading } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');

  // 🚀 Nếu đã đăng nhập rồi thì ẩn cái bảng này đi
  if (user || loading) return null;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert("🎉 Đăng ký thành công! Bạn có thể đăng nhập ngay.");
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message === "Invalid login credentials" ? "Sai email hoặc mật khẩu!" : err.message);
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
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-primary/20 border border-primary/30 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <Wand2 className="text-primary" size={28} />
          </div>
          <h2 className="text-2xl font-black text-text-main tracking-tight">{isLogin ? 'Đăng Nhập' : 'Tạo Tài Khoản'}</h2>
          <p className="text-sm text-text-muted mt-1 font-medium">Manga AI Translation Studio</p>
        </div>

        {error && <div className="bg-danger/10 text-danger text-sm p-3 rounded-xl mb-4 text-center border border-danger/20 font-medium">{error}</div>}

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-black text-text-muted mb-1.5 block uppercase tracking-widest">Email của bạn</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-background border border-border rounded-xl py-2.5 pl-11 pr-4 text-sm text-text-main focus:border-primary outline-none transition-colors" placeholder="name@domain.com" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-text-muted mb-1.5 block uppercase tracking-widest">Mật khẩu</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-background border border-border rounded-xl py-2.5 pl-11 pr-4 text-sm text-text-main focus:border-primary outline-none transition-colors" placeholder="••••••••" />
            </div>
          </div>

          <button type="submit" disabled={authLoading} className="btn-primary w-full justify-center mt-4 py-3 text-base shadow-lg shadow-primary/20">
            {authLoading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? 'Vào Studio' : 'Đăng Ký Ngay')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-text-muted">
          {isLogin ? "Lần đầu tới đây? " : "Đã là thành viên? "}
          <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-primary font-bold hover:text-primary-hover transition-colors">
            {isLogin ? 'Tạo tài khoản mới' : 'Đăng nhập lại'}
          </button>
        </div>
      </div>
    </div>
  );
}