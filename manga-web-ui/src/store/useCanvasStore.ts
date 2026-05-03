import { create } from 'zustand';

export interface TextBubble {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  rotation: number;
  sfxClass?: string;
}

interface CanvasState {
  bubbles: TextBubble[];
  activeBubbleId: string | null;
  addBubble: (bubble: Omit<TextBubble, 'id'>) => void;
  updateBubble: (id: string, updates: Partial<TextBubble>) => void;
  removeBubble: (id: string) => void;
  setActiveBubble: (id: string | null) => void;
  clearBubbles: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  bubbles: [],
  activeBubbleId: null,
  addBubble: (bubble) => set((state) => ({ 
    bubbles: [...state.bubbles, { ...bubble, id: Date.now().toString() }],
    activeBubbleId: Date.now().toString() // Auto chọn khi vừa tạo
  })),
  updateBubble: (id, updates) => set((state) => ({
    bubbles: state.bubbles.map(b => b.id === id ? { ...b, ...updates } : b)
  })),
  removeBubble: (id) => set((state) => ({
    bubbles: state.bubbles.filter(b => b.id !== id),
    activeBubbleId: state.activeBubbleId === id ? null : state.activeBubbleId
  })),
  setActiveBubble: (id) => set({ activeBubbleId: id }),
  clearBubbles: () => set({ bubbles: [], activeBubbleId: null })
}));