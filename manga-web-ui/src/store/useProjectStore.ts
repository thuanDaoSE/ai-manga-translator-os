import { create } from 'zustand';

export type PageStatus = 'unprocessed' | 'processing' | 'translated';

interface ProjectState {
  fileQueue: File[];
  currentIndex: number;
  processedUrls: Record<number, string>;
  pageStatuses: Record<number, PageStatus>;

  setFiles: (files: File[]) => void;
  setCurrentIndex: (index: number) => void;
  setProcessedUrl: (index: number, url: string) => void;
  setPageStatus: (index: number, status: PageStatus) => void;
  reorderFiles: (oldIndex: number, newIndex: number) => void; // 🚀 Thêm hàm mới
}

export const useProjectStore = create<ProjectState>((set) => ({
  fileQueue: [],
  currentIndex: -1,
  processedUrls: {},
  pageStatuses: {},

  setFiles: (files) => set({ 
    fileQueue: files, 
    processedUrls: {}, 
    pageStatuses: {},
    currentIndex: files.length > 0 ? 0 : -1 
  }),
  
  setCurrentIndex: (index) => set({ currentIndex: index }),
  
  setProcessedUrl: (index, url) => set((state) => ({ 
    processedUrls: { ...state.processedUrls, [index]: url },
    pageStatuses: { ...state.pageStatuses, [index]: 'translated' } 
  })),

  setPageStatus: (index, status) => set((state) => ({
    pageStatuses: { ...state.pageStatuses, [index]: status }
  })),

  // 🚀 Logic hoán đổi vị trí an toàn cho toàn bộ dữ liệu
  reorderFiles: (oldIndex, newIndex) => set((state) => {
    if (oldIndex === newIndex) return state;

    // Đóng gói dữ liệu cũ để tránh nhầm lẫn khi đảo
    const tempArr = state.fileQueue.map((f, i) => ({
      file: f,
      url: state.processedUrls[i],
      status: state.pageStatuses[i]
    }));

    // Cắt phần tử ở vị trí cũ, nhét vào vị trí mới
    const [movedItem] = tempArr.splice(oldIndex, 1);
    tempArr.splice(newIndex, 0, movedItem);

    // Giải nén lại thành các mảng/object như cũ
    const newQueue = tempArr.map(item => item.file);
    const newProcessed: Record<number, string> = {};
    const newStatuses: Record<number, PageStatus> = {};
    
    tempArr.forEach((item, i) => {
      if (item.url) newProcessed[i] = item.url;
      if (item.status) newStatuses[i] = item.status;
    });

    // Cập nhật lại chỉ mục (currentIndex) của trang đang xem
    let newCurrentIndex = state.currentIndex;
    if (state.currentIndex === oldIndex) newCurrentIndex = newIndex;
    else if (state.currentIndex > oldIndex && state.currentIndex <= newIndex) newCurrentIndex--;
    else if (state.currentIndex < oldIndex && state.currentIndex >= newIndex) newCurrentIndex++;

    return {
      fileQueue: newQueue,
      processedUrls: newProcessed,
      pageStatuses: newStatuses,
      currentIndex: newCurrentIndex
    };
  })
}));