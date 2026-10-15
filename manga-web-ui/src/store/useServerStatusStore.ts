import { create } from 'zustand';

export type ServerStatus = 'SLEEPING' | 'STARTING' | 'HOT';

interface ServerStatusState {
  serverStatus: ServerStatus;
  setServerStatus: (status: ServerStatus) => void;
  fetchStatus: () => Promise<void>;
}

export const useServerStatusStore = create<ServerStatusState>((set) => ({
  serverStatus: 'SLEEPING',
  setServerStatus: (status) => set({ serverStatus: status }),
  fetchStatus: async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/server-status`);
      if (response.ok) {
        const data = await response.json();
        set({ serverStatus: data.status as ServerStatus });
      }
    } catch (error) {
      console.error('Error fetching server status:', error);
    }
  }
}));
