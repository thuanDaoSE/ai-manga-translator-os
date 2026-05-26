import { create } from 'zustand';

type AppMode = 'none' | 'erase' | 'scan' | 'restore' | 'redraw';
type RestoreType = 'raw' | 'clean';

interface ToolState {
  activeMode: AppMode;
  restoreType: RestoreType;
  setActiveMode: (mode: AppMode) => void;
  toggleRestoreType: () => void;

  brushSize: number;
  setBrushSize: (size: number) => void;

  currentZoom: number;
  setZoom: (zoom: number) => void;

  fontSize: number;
  setFontSize: (size: number) => void;
  fontColor: string;
  setFontColor: (color: string) => void;
  fontFamily: string;
  setFontFamily: (font: string) => void;
  
  // 🚀 ĐÃ BỔ SUNG ĐẦY ĐỦ CÁC HÀM STYLE
  isBold: boolean;
  setIsBold: (val: boolean) => void;
  isItalic: boolean;
  setIsItalic: (val: boolean) => void;
  isUppercase: boolean;
  setIsUppercase: (val: boolean) => void;

  showText: boolean;
  setShowText: (show: boolean) => void;

  customFonts: { name: string, value: string }[];
  addCustomFont: (font: { name: string, value: string }) => void;

  scanModal: { isOpen: boolean, jap: string, vie: string, coords: any } | null;
  setScanModal: (data: any) => void;

  isZenMode: boolean;
  toggleZenMode: () => void;

  showLeftPanel: boolean;
  showRightPanel: boolean;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;

  isComparing: boolean;
  setIsComparing: (isComparing: boolean) => void;

  actionPosition: { x: number, y: number } | null;
  setActionPosition: (pos: { x: number, y: number } | null) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeMode: 'none',
  restoreType: 'raw',
  setActiveMode: (mode) => set({ activeMode: mode }),
  toggleRestoreType: () => set((state) => ({ restoreType: state.restoreType === 'raw' ? 'clean' : 'raw' })),
  
  brushSize: 25,
  setBrushSize: (size) => set({ brushSize: size }),
  
  currentZoom: 1.0,
  setZoom: (zoom) => set({ currentZoom: Math.max(0.1, Math.min(zoom, 5.0)) }),

  fontSize: 18,
  setFontSize: (size) => set({ fontSize: Math.max(8, Math.min(size, 150)) }),
  fontColor: '#000000',
  setFontColor: (color) => set({ fontColor: color }),
  fontFamily: "'Comic Neue', cursive",
  setFontFamily: (font) => set({ fontFamily: font }),
  
  // 🚀 ĐÃ BỔ SUNG GIÁ TRỊ THỰC THI CHO CÁC HÀM STYLE
  isBold: false,
  setIsBold: (val) => set({ isBold: val }),
  isItalic: false,
  setIsItalic: (val) => set({ isItalic: val }),
  isUppercase: false,
  setIsUppercase: (val) => set({ isUppercase: val }),

  showText: true,
  setShowText: (show) => set({ showText: show }),

  customFonts: [],
  addCustomFont: (font) => set((state) => ({ customFonts: [font, ...state.customFonts] })),

  scanModal: null,
  setScanModal: (data) => set({ scanModal: data }),

  isZenMode: false,
  toggleZenMode: () => set((state) => ({ isZenMode: !state.isZenMode })),
  
  showLeftPanel: true,
  showRightPanel: true,
  toggleLeftPanel: () => set((state) => ({ showLeftPanel: !state.showLeftPanel })),
  toggleRightPanel: () => set((state) => ({ showRightPanel: !state.showRightPanel })),
  
  isComparing: false,
  setIsComparing: (val) => set({ isComparing: val }),

  actionPosition: null,
  setActionPosition: (pos) => set({ actionPosition: pos })
}));