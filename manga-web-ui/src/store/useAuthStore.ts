import { create } from 'zustand';
import { supabase } from '../services/supabaseClient';
import { mangaApi } from '../services/api'; // 🚀 Import API để gọi Backend
import { useProjectStore } from './useProjectStore';

export interface SystemQuota {
  total_limit: number;
  used_pages: number;
  remaining_pages: number;
  is_exhausted: boolean;
  last_reset_at?: string | null;
}

interface AuthState {
  user: any | null;
  session: any | null;
  loading: boolean;
  systemQuota: SystemQuota;
  setUser: (session: any) => void;
  signOut: () => Promise<void>;

  fetchProfile: () => Promise<void>;
  fetchQuota: () => Promise<void>;
  resetQuota: (newLimit?: number) => Promise<void>;
  deductLocalCredits: (amount: number) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  systemQuota: {
    total_limit: 300,
    used_pages: 0,
    remaining_pages: 300,
    is_exhausted: false,
    last_reset_at: null
  },

  setUser: (session) => {
    const currentUser = get().user;

    // 🚀 Lính canh: Cờ đánh dấu xem đây có phải lần đầu đăng nhập không (chưa có user)
    const isFirstLogin = !currentUser && session?.user;

    set({
      session,
      // Ép giữ lại số tiền cũ khi Supabase cập nhật Token để không bị mất hiển thị trên UI
      user: session?.user
        ? { ...session.user, credits: currentUser?.credits ?? 999999, isPro: true, lensFreeRemaining: currentUser?.lensFreeRemaining ?? 9999 }
        : null,
      loading: false
    });

    get().fetchQuota();
    if (isFirstLogin) {
      get().fetchProfile();
    }
  },

  // 🚀 Hàm móc túi Backend lấy thông tin người dùng và quota
  fetchProfile: async () => {
    try {
      const data = await mangaApi.getUserProfile();
      set((state) => ({
        user: state.user ? { ...state.user, credits: data.credits ?? 999999, isPro: true, lensFreeRemaining: data.lens_free_remaining ?? 9999 } : null,
        systemQuota: data.system_quota ? data.system_quota : state.systemQuota
      }));
    } catch (error) {
      console.error("Lỗi lấy thông tin ví tiền:", error);
    }
  },

  // 🚀 Tải trạng thái 300 trang miễn phí của hệ thống
  fetchQuota: async () => {
    try {
      const quota = await mangaApi.getSystemQuota();
      if (quota) {
        set({ systemQuota: quota });
      }
    } catch (error) {
      console.error("Lỗi lấy thông tin system quota:", error);
    }
  },

  // 🔄 Đặt lại 300 trang miễn phí (Dành cho Admin)
  resetQuota: async (newLimit: number = 300) => {
    try {
      const res = await mangaApi.resetSystemQuota(newLimit);
      if (res?.quota) {
        set({ systemQuota: res.quota });
      } else {
        await get().fetchQuota();
      }
    } catch (error) {
      console.error("Lỗi đặt lại system quota:", error);
      throw error;
    }
  },

  deductLocalCredits: (_amount: number) => {
    // Miễn phí toàn bộ: không trừ tiền người dùng
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Lỗi khi gọi Supabase signOut:", e);
    }

    set({ user: null, session: null, loading: false });

    // 🚀 Xóa dự án đang hoạt động khi đăng xuất
    useProjectStore.getState().clearProject();

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