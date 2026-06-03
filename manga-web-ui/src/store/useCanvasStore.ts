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
  
  isBold?: boolean;
  isItalic?: boolean;
  isUppercase?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  hasShadow?: boolean;

  rawBox?: { x1: number, y1: number, x2: number, y2: number };

  boxX?: number;
  boxY?: number;
  boxW?: number;
  boxH?: number;

  isRestored?: boolean;
}

interface CanvasState {
  bubbles: TextBubble[];
  activeBubbleId: string | null;
  hoveredBubbleId: string | null;
  
  // 🚀 BỔ SUNG: KHO LƯU TRỮ LỊCH SỬ
  past: TextBubble[][];
  future: TextBubble[][];
  
  setBubbles: (bubbles: TextBubble[]) => void;
  addBubble: (bubble: Omit<TextBubble, 'id'>) => void;
  updateBubble: (id: string, data: Partial<TextBubble>) => void;
  removeBubble: (id: string) => void;
  setActiveBubble: (id: string | null) => void;
  setHoveredBubble: (id: string | null) => void;
  clearBubbles: () => void;
  
  // 🚀 BỔ SUNG: HÀM UNDO / REDO
  undo: () => void;
  redo: () => void;
  saveHistory: () => void; // Hàm nội bộ để chốt sổ lịch sử
}

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => ({
      bubbles: [],
      past: [],
      future: [],
      activeBubbleId: null,
      hoveredBubbleId: null,

      // 🚀 LƯU LẠI TRẠNG THÁI TRƯỚC KHI THAY ĐỔI
      saveHistory: () => set((state) => ({
        past: [...state.past, state.bubbles],
        future: [], // Hễ có hành động mới là tương lai bị xóa bỏ
      })),

      // Khi nạp trang mới, xóa sạch lịch sử của trang cũ đi
      // 🚀 BẢN VÁ 1: BÁC SĨ TỰ CHỮA LÀNH (LỌC TRÙNG ID)
      // Khi nạp trang mới, xóa sạch lịch sử của trang cũ đi và CHỮA LÀNH các ID bị trùng
      setBubbles: (bubbles) => {
        const seenIds = new Set();
        const healedBubbles = bubbles.map((b) => {
          if (seenIds.has(b.id)) {
            // Nếu phát hiện ID bị trùng, lập tức rèn cho nó một ID mới tinh
            return { ...b, id: `healed_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` };
          }
          seenIds.add(b.id);
          return b;
        });
        
        set({ bubbles: healedBubbles, past: [], future: [] });
      },
      
      // 🚀 BẢN VÁ 2: SINH ID ĐỘC LẬP TUYỆT ĐỐI (Chống trùng lặp mili-giây)
      addBubble: (bubbleData) => {
        get().saveHistory();
        set((state) => ({
          bubbles: [
            ...state.bubbles, 
            { 
              ...bubbleData, 
              // Ưu tiên dùng ID có sẵn, nếu không có thì nối thêm chuỗi Random dài để chống trùng
              id: bubbleData.id || `bubble_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` 
            }
          ]
        }));
      },

      updateBubble: (id, data) => {
        get().saveHistory();
        set((state) => ({
          bubbles: state.bubbles.map((b) => b.id === id ? { ...b, ...data } : b)
        }));
      },

      removeBubble: (id) => {
        get().saveHistory();
        set((state) => ({
          bubbles: state.bubbles.filter((b) => b.id !== id)
        }));
      },

      setActiveBubble: (id) => set({ activeBubbleId: id }),
      setHoveredBubble: (id) => set({ hoveredBubbleId: id }),
      
      clearBubbles: () => {
        get().saveHistory();
        set({ bubbles: [] });
      },

      // 🚀 HÀM QUAY LẠI QUÁ KHỨ (UNDO)
      undo: () => set((state) => {
        if (state.past.length === 0) return state; // Không có quá khứ thì thôi
        
        const previous = state.past[state.past.length - 1];
        const newPast = state.past.slice(0, state.past.length - 1);
        
        return {
          past: newPast,
          future: [state.bubbles, ...state.future], // Đẩy hiện tại vào tương lai
          bubbles: previous, // Kéo quá khứ lên làm hiện tại
        };
      }),

      // 🚀 HÀM TIẾN TỚI TƯƠNG LAI (REDO)
      redo: () => set((state) => {
        if (state.future.length === 0) return state; // Không có tương lai thì thôi
        
        const next = state.future[0];
        const newFuture = state.future.slice(1);
        
        return {
          past: [...state.past, state.bubbles], // Đẩy hiện tại về quá khứ
          future: newFuture,
          bubbles: next, // Kéo tương lai về làm hiện tại
        };
      }),
    }),
    {
      name: 'manga-canvas-storage-v3', // 🚀 ĐỔI THÀNH V3 ĐỂ RESET CACHE TRÁNH LỖI MÀN HÌNH ĐEN
      // BÍ QUYẾT TỐI ƯU: Tuyệt đối không lưu past/future vào ổ cứng để tránh nặng trình duyệt!
      partialize: (state) => ({ bubbles: state.bubbles }), 
    }
  )
);