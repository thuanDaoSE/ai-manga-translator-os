import { create } from 'zustand';
import { temporal } from 'zundo'; // 🚀 Nhập ma thuật Zundo

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
}

interface CanvasState {
  bubbles: TextBubble[];
  activeBubbleId: string | null;
  addBubble: (bubble: Omit<TextBubble, 'id'>) => void;
  updateBubble: (id: string, updates: Partial<TextBubble>) => void;
  removeBubble: (id: string) => void;
  setActiveBubble: (id: string | null) => void;
  clearBubbles: () => void;
  setBubbles: (bubbles: TextBubble[]) => void; // 🚀 Thêm dòng này
  
  pageBubbles: Record<number, TextBubble[]>;
  saveBubblesForPage: (pageIndex: number) => void;
  loadBubblesForPage: (pageIndex: number) => void;

  setBubblesForSpecificPage: (pageIndex: number, bubbles: TextBubble[]) => void;
  hoveredBubbleId: string | null;
  setHoveredBubble: (id: string | null) => void;
}

// 🚀 Bọc toàn bộ logic cũ bằng temporal()
export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set) => ({
      bubbles: [],
      activeBubbleId: null,
      pageBubbles: {},

      // 🚀 SỬA LẠI DÒNG NÀY ĐỂ ĐẢM BẢO ID DUY NHẤT
      addBubble: (bubble) => set((state) => ({
        bubbles: [...state.bubbles, { ...bubble, id: Date.now().toString() + Math.random().toString(36).substring(2, 9) }]
      })),

      updateBubble: (id, updates) => set((state) => ({
        bubbles: state.bubbles.map((b) => (b.id === id ? { ...b, ...updates } : b))
      })),

      removeBubble: (id) => set((state) => ({
        bubbles: state.bubbles.filter((b) => b.id !== id),
        activeBubbleId: state.activeBubbleId === id ? null : state.activeBubbleId
      })),

      setActiveBubble: (id) => set({ activeBubbleId: id }),
      setBubbles: (bubbles) => set({ bubbles, activeBubbleId: null }),
saveBubblesForPage: (pageIndex) => set((state) => ({
        pageBubbles: { ...state.pageBubbles, [pageIndex]: state.bubbles }
      })),
      hoveredBubbleId: null,
      setHoveredBubble: (id) => set({ hoveredBubbleId: id }),
      loadBubblesForPage: (pageIndex) => set((state) => ({
        bubbles: state.pageBubbles[pageIndex] || [],
        activeBubbleId: null
      })),
      // 🚀 THÊM ĐOẠN NÀY ĐỂ LƯU CHỮ CỦA TRANG ĐANG CHẠY NGẦM:
      setBubblesForSpecificPage: (pageIndex, newBubbles) => set((state) => ({
        pageBubbles: { ...state.pageBubbles, [pageIndex]: newBubbles }
      })),
      clearBubbles: () => set({ bubbles: [], activeBubbleId: null }),
    }),
    {
      // 🚀 CẤU HÌNH THÔNG MINH CHO ZUNDO
      // Tối đa lưu 50 bước để bảo vệ RAM tuyệt đối
      limit: 50,
      // Tính năng cực hay: Gom nhóm thao tác kéo thả (Throttle)
      // Nếu user kéo chữ liên tục trong 1 giây, nó chỉ tính là 1 bước Undo!
      partialize: (state) => ({ bubbles: state.bubbles }) 
    }
    
  )
);