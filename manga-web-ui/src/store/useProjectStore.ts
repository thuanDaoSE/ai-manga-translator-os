import { create } from "zustand";
import { mangaApi } from "../services/api"; // 🚀 Đã đổi sang dùng API trung tâm
import toast from 'react-hot-toast';  

// 🚀 1. THÊM "cleaned" VÀO ĐÂY:
// 🚀 Thêm "translating" và "completed" vào danh sách
export type PageStatus = "unprocessed" | "processing" | "cleaned" | "translating" | "completed" | "error" | "trash";

export interface ProgressData {
  percent: number;
  message: string;
}

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api`;

interface ProjectState {
  projectId: string | null;
  pageIds: Record<number, string>;
  fileQueue: File[];
  currentIndex: number;
  processedUrls: Record<number, string>;
  pageStatuses: Record<number, PageStatus>;
  progresses: Record<number, ProgressData>;
  
  pastUrls: Record<number, string[]>;
  futureUrls: Record<number, string[]>;

  uploadProjectFiles: (files: File[]) => Promise<void>;
  setCurrentIndex: (index: number) => void;
  setProcessedUrl: (index: number, url: string) => void;
  setPageStatus: (index: number, status: PageStatus) => void;
  reorderFiles: (oldIndex: number, newIndex: number) => void;
  startListeningProgress: (index: number, taskId: string) => void;
  clearProgress: (index: number) => void;
  
  undoUrl: () => void;
  redoUrl: () => void;
  removePage: (index: number) => Promise<void>;

  setProjectId: (id: string) => void;
  clearProject: () => void;

  restoreProject: (pages: any[]) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectId: localStorage.getItem('active_manga_project_id') || null,
  
  pageIds: {},
  fileQueue: [],
  currentIndex: -1,
  processedUrls: {},
  pageStatuses: {},
  progresses: {},
  pastUrls: {},
  futureUrls: {},

  uploadProjectFiles: async (files: File[]) => {
    const currentState = useProjectStore.getState();
    const startIndex = currentState.fileQueue.length;

    set((state) => {
      const newStatuses = { ...state.pageStatuses };
      for (let i = 0; i < files.length; i++) {
        newStatuses[startIndex + i] = "processing";
      }
      return {
        fileQueue: [...state.fileQueue, ...files],
        pageStatuses: newStatuses,
        currentIndex: state.currentIndex === -1 ? 0 : state.currentIndex,
      };
    });

    try {
      let currentProjectId = useProjectStore.getState().projectId;
      
      // 🚀 NẾU CHƯA CÓ PROJECT, DÙNG MANGA API ĐỂ TẠO (Sẽ tự động bắt lỗi 401)
      if (!currentProjectId) {
        const projData = await mangaApi.createProject("Dự án AI Manga");
        currentProjectId = projData.project_id || projData.id;
        if (!currentProjectId) throw new Error("Server không cấp mã ID Dự án!");
        
        // 🚀 THÊM DÒNG NÀY: Khắc cốt ghi tâm cái ID này vào ổ cứng
        localStorage.setItem('active_manga_project_id', currentProjectId);
        
        set({ projectId: currentProjectId });
      }

      for (let i = 0; i < files.length; i++) {
        const actualIndex = startIndex + i;
        set((state) => ({ progresses: { ...state.progresses, [actualIndex]: { percent: 50, message: "Đang Upload..." } } }));

        try {
          // 🚀 GỌI UPLOAD QUA MANGA API (Đảm bảo Token luôn tươi mới)
          const data = await mangaApi.uploadProjectFile(currentProjectId as string, files[i]);
          
          set((state) => {
            const newProgresses = { ...state.progresses };
            delete newProgresses[actualIndex]; 
            return { pageIds: { ...state.pageIds, [actualIndex]: data.page_id }, pageStatuses: { ...state.pageStatuses, [actualIndex]: "unprocessed" }, progresses: newProgresses };
          });
        } catch (fileError: any) {
          // Nếu lỗi là 401, mangaApi đã tự ném ra và đá văng người dùng rồi, ta dừng vòng lặp luôn
          if (fileError.message === "Phiên đăng nhập đã hết hạn!") {
              throw fileError; 
          }
          
          toast.error(`Lỗi file ${files[i].name}: ${fileError.message}`);
          set((state) => {
            const newProgresses = { ...state.progresses };
            delete newProgresses[actualIndex]; 
            return { pageStatuses: { ...state.pageStatuses, [actualIndex]: "trash" as any }, progresses: newProgresses };
          });
        }
      } 

      set((state) => {
        const validFiles: File[] = [];
        const newPageIds: Record<number, string> = {};
        const newPageStatuses: Record<number, PageStatus> = {};
        const newProcessedUrls: Record<number, string> = {};
        const newProgresses: Record<number, ProgressData> = {};
        const newPastUrls: Record<number, string[]> = {};
        const newFutureUrls: Record<number, string[]> = {};
        let newIndex = 0;
        let newCurrentIndex = state.currentIndex;

        state.fileQueue.forEach((file, oldIndex) => {
          if (state.pageStatuses[oldIndex] !== "trash") {
            validFiles.push(file);
            if (state.pageIds[oldIndex]) newPageIds[newIndex] = state.pageIds[oldIndex];
            if (state.pageStatuses[oldIndex]) newPageStatuses[newIndex] = state.pageStatuses[oldIndex];
            if (state.processedUrls[oldIndex]) newProcessedUrls[newIndex] = state.processedUrls[oldIndex];
            if (state.progresses[oldIndex]) newProgresses[newIndex] = state.progresses[oldIndex];
            if (state.pastUrls[oldIndex]) newPastUrls[newIndex] = state.pastUrls[oldIndex];
            if (state.futureUrls[oldIndex]) newFutureUrls[newIndex] = state.futureUrls[oldIndex];
            if (state.currentIndex === oldIndex) newCurrentIndex = newIndex;
            newIndex++;
          }
        });
        return {
          fileQueue: validFiles, pageIds: newPageIds, pageStatuses: newPageStatuses,
          processedUrls: newProcessedUrls, progresses: newProgresses, pastUrls: newPastUrls,
          futureUrls: newFutureUrls, currentIndex: validFiles.length > 0 ? newCurrentIndex : -1
        };
      });
    } catch (error: any) {
        // Chỉ báo lỗi nếu không phải là lỗi 401 (vì 401 đã hiện toast ở api.ts rồi)
        if (error.message !== "Phiên đăng nhập đã hết hạn!") {
            toast.error(error.message || "Không thể khởi tạo dự án!");
        }
    }
  },

  setCurrentIndex: (index) => set({ currentIndex: index }),

  setProcessedUrl: (index, url) =>
    set((state) => {
      const currentUrl = state.processedUrls[index] || ""; 
      const pageHistory = state.pastUrls[index] || [];
      return {
        processedUrls: { ...state.processedUrls, [index]: url },
        pageStatuses: { ...state.pageStatuses, [index]: "cleaned" },
        pastUrls: { ...state.pastUrls, [index]: [...pageHistory, currentUrl].slice(-30) },
        futureUrls: { ...state.futureUrls, [index]: [] } 
      };
    }),

  removePage: async (indexToRemove) => {
      const currentState = useProjectStore.getState();
      const pageId = currentState.pageIds[indexToRemove];

      if (pageId) {
        try {
          // 🚀 Đã chuyển qua dùng API trung tâm
          await mangaApi.deletePage(pageId);
        } catch (err) {
          console.error("Lỗi xóa trang:", err);
        }
      }

      set((state) => {
        const tempArr = state.fileQueue.map((f, i) => ({
          file: f, url: state.processedUrls[i], status: state.pageStatuses[i],
          progress: state.progresses[i], pageId: state.pageIds[i], past: state.pastUrls[i], future: state.futureUrls[i]
        }));

        tempArr.splice(indexToRemove, 1);

        const newQueue = tempArr.map(item => item.file);
        const newProcessed: Record<number, string> = {};
        const newStatuses: Record<number, PageStatus> = {};
        const newProgresses: Record<number, ProgressData> = {};
        const newPageIds: Record<number, string> = {};
        const newPast: Record<number, string[]> = {};
        const newFuture: Record<number, string[]> = {};

        tempArr.forEach((item, i) => {
          if (item.url) newProcessed[i] = item.url;
          if (item.status) newStatuses[i] = item.status;
          if (item.progress) newProgresses[i] = item.progress;
          if (item.pageId) newPageIds[i] = item.pageId;
          if (item.past) newPast[i] = item.past;
          if (item.future) newFuture[i] = item.future;
        });

        let newCurrentIndex = state.currentIndex;
        if (state.currentIndex === indexToRemove) {
            newCurrentIndex = tempArr.length > 0 ? Math.max(0, indexToRemove - 1) : -1;
        } else if (state.currentIndex > indexToRemove) {
            newCurrentIndex--;
        }
        toast.success("Đã xóa trang và giải phóng bộ nhớ máy chủ!");
        return {
          fileQueue: newQueue, processedUrls: newProcessed, pageStatuses: newStatuses,
          progresses: newProgresses, pageIds: newPageIds, pastUrls: newPast, futureUrls: newFuture,
          currentIndex: newCurrentIndex
        };
      });
  },

  setPageStatus: (index, status) => set((state) => ({ pageStatuses: { ...state.pageStatuses, [index]: status } })),
  clearProgress: (index) => set((state) => {
      const newProgresses = { ...state.progresses };
      delete newProgresses[index];
      return { progresses: newProgresses };
  }),
  startListeningProgress: (index, taskId) => {
    const eventSource = new EventSource(`${API_URL}/stream/${taskId}`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      set((state) => ({ progresses: { ...state.progresses, [index]: { percent: data.progress, message: data.message } } }));
      if (data.state === "SUCCESS" || data.state === "FAILURE") eventSource.close();
    };
    eventSource.onerror = () => eventSource.close();
  },
  reorderFiles: (oldIndex, newIndex) => set((state) => {
      if (oldIndex === newIndex) return state;
      const tempArr = state.fileQueue.map((f, i) => ({
        file: f, url: state.processedUrls[i], status: state.pageStatuses[i],
        progress: state.progresses[i], pageId: state.pageIds[i], 
      }));
      const [movedItem] = tempArr.splice(oldIndex, 1);
      tempArr.splice(newIndex, 0, movedItem);

      const newQueue = tempArr.map((item) => item.file);
      const newProcessed: Record<number, string> = {};
      const newStatuses: Record<number, PageStatus> = {};
      const newProgresses: Record<number, ProgressData> = {};
      const newPageIds: Record<number, string> = {};

      tempArr.forEach((item, i) => {
        if (item.url) newProcessed[i] = item.url;
        if (item.status) newStatuses[i] = item.status;
        if (item.progress) newProgresses[i] = item.progress;
        if (item.pageId) newPageIds[i] = item.pageId;
      });
      let newCurrentIndex = state.currentIndex;
      if (state.currentIndex === oldIndex) newCurrentIndex = newIndex;
      else if (state.currentIndex > oldIndex && state.currentIndex <= newIndex) newCurrentIndex--;
      else if (state.currentIndex < oldIndex && state.currentIndex >= newIndex) newCurrentIndex++;

      return {
        fileQueue: newQueue, processedUrls: newProcessed, pageStatuses: newStatuses,
        progresses: newProgresses, pageIds: newPageIds, currentIndex: newCurrentIndex,
      };
  }),
  undoUrl: () => set((state) => {
    const idx = state.currentIndex;
    const history = state.pastUrls[idx] || [];
    if (history.length === 0) return state; 
    const newHistory = [...history];
    const prevUrl = newHistory.pop()!;
    const currentUrl = state.processedUrls[idx] || ""; 
    const futures = state.futureUrls[idx] || [];
    return {
      processedUrls: { ...state.processedUrls, [idx]: prevUrl },
      pastUrls: { ...state.pastUrls, [idx]: newHistory },
      futureUrls: { ...state.futureUrls, [idx]: [currentUrl, ...futures] } 
    };
  }),
  redoUrl: () => set((state) => {
    const idx = state.currentIndex;
    const futures = state.futureUrls[idx] || [];
    if (futures.length === 0) return state; 
    const newFutures = [...futures];
    const nextUrl = newFutures.shift()!;
    const currentUrl = state.processedUrls[idx] || "";
    const history = state.pastUrls[idx] || [];
    return {
      processedUrls: { ...state.processedUrls, [idx]: nextUrl },
      pastUrls: { ...state.pastUrls, [idx]: [...history, currentUrl] },
      futureUrls: { ...state.futureUrls, [idx]: newFutures }
    };
  }),

  setProjectId: (id: string) => {
    localStorage.setItem('active_manga_project_id', id);
    set({ projectId: id, fileQueue: [], pageIds: {}, processedUrls: {}, currentIndex: -1 });
  },
  clearProject: () => {
    localStorage.removeItem('active_manga_project_id');
    set({ projectId: null, fileQueue: [], pageIds: {}, processedUrls: {}, currentIndex: -1 });
  }, // 🚀 THUẬT TOÁN BUNG DỮ LIỆU BẰNG FILE ẢO 0-BYTE
  restoreProject: (pages) => {
    const newPageIds: Record<number, string> = {};
    const newPageStatuses: Record<number, PageStatus> = {};
    const newProcessedUrls: Record<number, string> = {};
    const newQueue: File[] = [];

    pages.forEach((page, index) => {
      newPageIds[index] = page.id;
      
      // 🚀 2. TÔN TRỌNG TRẠNG THÁI TỪ SERVER:
      // Nếu server có gửi status thì dùng, không thì tự suy luận: có ảnh sạch -> cleaned, chưa có -> unprocessed
      // 🚀 Tôn trọng Status thực tế từ DB
      newPageStatuses[index] = page.status || (page.clean_url ? "cleaned" : "unprocessed");
      
      if (page.clean_url) {
        newProcessedUrls[index] = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${page.clean_url}?t=${Date.now()}`;
      }
      
      newQueue.push(new File([""], page.filename, { type: "image/jpeg" }));
    });

    set({
      pageIds: newPageIds,
      pageStatuses: newPageStatuses,
      processedUrls: newProcessedUrls,
      fileQueue: newQueue,
      currentIndex: pages.length > 0 ? 0 : -1
    });
  },
}));