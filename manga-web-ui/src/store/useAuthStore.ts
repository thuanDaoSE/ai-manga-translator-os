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
    await supabase.auth.signOut();
    set({ user: null, session: null });
  }
}));