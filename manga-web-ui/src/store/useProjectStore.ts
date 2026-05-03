import { create } from 'zustand';

interface ProjectState {
  fileQueue: File[];
  currentIndex: number;
  processedUrls: Record<number, string>;

  setFiles: (files: File[]) => void;
  setCurrentIndex: (index: number) => void;
  // 🚀 ĐÃ BỔ SUNG DÒNG KHAI BÁO NÀY ĐỂ TYPESCRIPT NHẬN DIỆN
  setProcessedUrl: (index: number, url: string) => void; 
}

export const useProjectStore = create<ProjectState>((set) => ({
  fileQueue: [],
  currentIndex: -1,
  processedUrls: {},

  setFiles: (files) => set({ fileQueue: files, processedUrls: {} }), 
  setCurrentIndex: (index) => set({ currentIndex: index }),
  setProcessedUrl: (index, url) => set((state) => ({ 
    processedUrls: { ...state.processedUrls, [index]: url } 
  })),
}));