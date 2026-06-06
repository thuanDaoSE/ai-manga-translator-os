import { create } from 'zustand';
import { supabase } from '../services/supabaseClient';
import { mangaApi } from '../services/api'; // 🚀 Import API để gọi Backend

interface AuthState {
  user: any | null;
  session: any | null;
  loading: boolean;
  setUser: (session: any) => void;
  signOut: () => Promise<void>;

  // 🚀 Bổ sung 2 hàm quản lý tiền
  fetchProfile: () => Promise<void>;
  deductLocalCredits: (amount: number) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,

  setUser: (session) => {
    const currentUser = get().user;

    // 🚀 Lính canh: Cờ đánh dấu xem đây có phải lần đầu đăng nhập không (chưa có user)
    const isFirstLogin = !currentUser && session?.user;

    set({
      session,
      // Ép giữ lại số tiền cũ khi Supabase cập nhật Token để không bị mất hiển thị trên UI
      user: session?.user
        ? { ...session.user, credits: currentUser?.credits, isPro: currentUser?.isPro }
        : null,
      loading: false
    });

    // 🚀 BẢN VÁ: Chỉ gọi API móc túi Backend nếu là lần đầu đăng nhập
    if (isFirstLogin) {
      get().fetchProfile();
    }
  },

  // 🚀 Hàm móc túi Backend lấy số dư
  fetchProfile: async () => {
    try {
      const data = await mangaApi.getUserProfile();
      set((state) => ({
        user: state.user ? { ...state.user, credits: data.credits, isPro: data.is_pro } : null
      }));
    } catch (error) {
      console.error("Lỗi lấy thông tin ví tiền:", error);
    }
  },

  // 🚀 Hàm trừ tiền tạm trên UI cho mượt
  deductLocalCredits: (amount: number) => {
    set((state) => {
      if (!state.user || state.user.isPro) return state; // Tài khoản Pro thì miễn phí
      return {
        user: { ...state.user, credits: Math.max(0, (state.user.credits || 0) - amount) }
      };
    });
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Lỗi khi gọi Supabase signOut:", e);
    }

    set({ user: null, session: null, loading: false });

    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.error("Lỗi khi xóa localStorage:", e);
    }
  },
}));