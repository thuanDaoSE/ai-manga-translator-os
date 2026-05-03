import { create } from 'zustand';

type AppMode = 'none' | 'erase' | 'scan' | 'restore';
type RestoreType = 'raw' | 'clean';

interface ToolState {
  // Modes
  activeMode: AppMode;
  restoreType: RestoreType;
  setActiveMode: (mode: AppMode) => void;
  toggleRestoreType: () => void;

  // Brush
  brushSize: number;
  setBrushSize: (size: number) => void;

  // Zoom
  currentZoom: number;
  setZoom: (zoom: number) => void;

  // Text Styling
  fontSize: number;
  setFontSize: (size: number) => void;
  fontColor: string;
  setFontColor: (color: string) => void;
  fontFamily: string;
  setFontFamily: (font: string) => void;
  showText: boolean;
  setShowText: (show: boolean) => void;

  customFonts: { name: string, value: string }[];
  addCustomFont: (font: { name: string, value: string }) => void;

  scanModal: { isOpen: boolean, jap: string, vie: string, coords: any } | null;
  setScanModal: (data: any) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeMode: 'none',
  restoreType: 'raw',
  setActiveMode: (mode) => set((state) => ({ activeMode: state.activeMode === mode ? 'none' : mode })),
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
  showText: true,
  setShowText: (show) => set({ showText: show }),

  customFonts: [],
  addCustomFont: (font) => set((state) => ({ 
    customFonts: [font, ...state.customFonts] 
  })),

  scanModal: null,
  setScanModal: (data) => set({ scanModal: data }),
}));