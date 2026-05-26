import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  isHidden?: boolean;
  isLocked?: boolean;
  tailDirection?: 'none' | 'left' | 'right';
  
  // 🚀 BỘ VŨ KHÍ STYLE MỚI
  isBold?: boolean;
  isItalic?: boolean;
  isUppercase?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  hasShadow?: boolean;
}

interface CanvasState {
  bubbles: TextBubble[];
  activeBubbleId: string | null;
  hoveredBubbleId: string | null;
  
  setBubbles: (bubbles: TextBubble[]) => void;
  addBubble: (bubble: Omit<TextBubble, 'id'>) => void;
  updateBubble: (id: string, data: Partial<TextBubble>) => void;
  removeBubble: (id: string) => void;
  setActiveBubble: (id: string | null) => void;
  setHoveredBubble: (id: string | null) => void;
  clearBubbles: () => void;
}

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set) => ({
      bubbles: [],
      activeBubbleId: null,
      hoveredBubbleId: null,

      setBubbles: (bubbles) => set({ bubbles }),
      
      addBubble: (bubbleData) => set((state) => ({
        bubbles: [...state.bubbles, { ...bubbleData, id: Date.now().toString() }]
      })),

      // 🚀 BẢN VÁ QUAN TRỌNG NHẤT: Dùng spread operator {...b, ...data} để cập nhật ĐỘNG mọi thuộc tính
      updateBubble: (id, data) => set((state) => ({
    bubbles: state.bubbles.map((b) => 
      // 🚀 SỬA THÀNH DÒNG NÀY: Gom toàn bộ dữ liệu cũ (...b) và đè dữ liệu mới lên (...data)
      b.id === id ? { ...b, ...data } : b
    )
  })),

      removeBubble: (id) => set((state) => ({
        bubbles: state.bubbles.filter((b) => b.id !== id)
      })),

      setActiveBubble: (id) => set({ activeBubbleId: id }),
      setHoveredBubble: (id) => set({ hoveredBubbleId: id }),
      clearBubbles: () => set({ bubbles: [] })
    }),
    {
      name: 'manga-canvas-storage',
      partialize: (state) => ({ bubbles: state.bubbles }),
    }
  )
);