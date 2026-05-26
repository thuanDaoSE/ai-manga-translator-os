import { create } from 'zustand';
import { supabase } from '../services/supabaseClient';

interface AuthState {
  user: any | null;
  session: any | null;
  loading: boolean;
  setUser: (user: any) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  setUser: (session) => set({ 
    session, 
    user: session?.user ?? null, 
    loading: false 
  }),
  signOut: async () => {
    try {
      // Gọi lệnh logout của Supabase, bọc trong try/catch đề phòng token hết hạn bị lỗi
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Lỗi khi gọi Supabase signOut:", e);
    }
    
    // 🚀 BẢN VÁ TỐI THƯỢNG: Dù Supabase có lỗi, ta VẪN LẬP TỨC xóa sạch bộ nhớ Zustand
    set({ user: null, session: null, loading: false });
    
    // 🚀 CHỦ ĐỘNG QUÉT SẠCH LOCAL STORAGE: Tìm tất cả các key của supabase (thường bắt đầu bằng sb-) để xóa sổ
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (err) {
      console.error("Lỗi dọn dẹp localStorage:", err);
    }
  }
}));