import { create } from "zustand";

// SỬA DÒNG NÀY (Thêm "error" vào cuối)
export type PageStatus = "unprocessed" | "processing" | "translated" | "error";
import { supabase } from "../services/supabaseClient";
export interface ProgressData {
  percent: number;
  message: string;
}

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

interface ProjectState {
  projectId: string | null;
  pageIds: Record<number, string>;
  fileQueue: File[];
  currentIndex: number;
  processedUrls: Record<number, string>;
  pageStatuses: Record<number, PageStatus>;
  progresses: Record<number, ProgressData>;

  uploadProjectFiles: (files: File[]) => Promise<void>;
  setCurrentIndex: (index: number) => void;
  setProcessedUrl: (index: number, url: string) => void;
  setPageStatus: (index: number, status: PageStatus) => void;
  reorderFiles: (oldIndex: number, newIndex: number) => void;
  startListeningProgress: (index: number, taskId: string) => void;
  clearProgress: (index: number) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectId: null,
  pageIds: {},
  fileQueue: [],
  currentIndex: -1,
  processedUrls: {},
  pageStatuses: {},
  progresses: {},

  // 🚀 TỰ ĐỘNG TẠO DỰ ÁN VÀ LƯU ẢNH VÀO CƠ SỞ DỮ LIỆU

  uploadProjectFiles: async (files: File[]) => {
    const API_URL = `${import.meta.env.VITE_API_URL}/api`;
    
    // 1. Khóa tất cả các ảnh ở trạng thái "processing" để hiện vòng xoay (Không cho Xóa nền/Dịch)
    const initialStatuses: Record<number, PageStatus> = {};
    for (let i = 0; i < files.length; i++) {
      initialStatuses[i] = "processing";
    }

    set({ 
      fileQueue: files, 
      pageIds: {}, // Reset thành Object rỗng
      pageStatuses: initialStatuses,
      processedUrls: {},
      progresses: {},
      currentIndex: 0
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // 2. Tạo Project 
      const projRes = await fetch(`${API_URL}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, 
        },
        body: JSON.stringify({ name: "Dự án AI Manga" })
      });
      const projData = await projRes.json();
      const projectId = projData.project_id || projData.id;
      set({ projectId });

      // 3. UPLOAD CUỐN CHIẾU: Xong ảnh nào, Mở khóa ảnh đó!
      for (let i = 0; i < files.length; i++) {
        // Thông báo cho UI biết đang tải ảnh này
        set((state) => ({
           progresses: { ...state.progresses, [i]: { percent: 50, message: "Đang Upload..." } }
        }));

        const formData = new FormData();
        formData.append("file", files[i]);
        const uploadRes = await fetch(`${API_URL}/projects/${projectId}/upload`, {
          method: "POST",
          body: formData
        });
        const data = await uploadRes.json();
        
        // Nhận được ID từ Server -> Lưu ID và Đổi trạng thái thành "unprocessed" để hiện nút Dịch
        set((state) => {
          const newProgresses = { ...state.progresses };
          delete newProgresses[i]; // Tắt thông báo Upload
          
          return {
            pageIds: { ...state.pageIds, [i]: data.page_id },
            pageStatuses: { ...state.pageStatuses, [i]: "unprocessed" }, // 🚀 NÚT DỊCH SẼ HIỆN RA
            progresses: newProgresses
          };
        });
      }

    } catch (error) {
      console.error("Upload thất bại:", error);
    }
  },

  setCurrentIndex: (index) => set({ currentIndex: index }),

  setProcessedUrl: (index, url) =>
    set((state) => ({
      processedUrls: { ...state.processedUrls, [index]: url },
      pageStatuses: { ...state.pageStatuses, [index]: "translated" },
    })),

  setPageStatus: (index, status) =>
    set((state) => ({
      pageStatuses: { ...state.pageStatuses, [index]: status },
    })),

  clearProgress: (index) =>
    set((state) => {
      const newProgresses = { ...state.progresses };
      delete newProgresses[index];
      return { progresses: newProgresses };
    }),

  startListeningProgress: (index, taskId) => {
    const eventSource = new EventSource(
      `${API_URL}/stream/${taskId}`,
    );
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      set((state) => ({
        progresses: {
          ...state.progresses,
          [index]: { percent: data.progress, message: data.message },
        },
      }));
      if (data.state === "SUCCESS" || data.state === "FAILURE")
        eventSource.close();
    };
    eventSource.onerror = () => eventSource.close();
  },

  reorderFiles: (oldIndex, newIndex) =>
    set((state) => {
      if (oldIndex === newIndex) return state;
      const tempArr = state.fileQueue.map((f, i) => ({
        file: f,
        url: state.processedUrls[i],
        status: state.pageStatuses[i],
        progress: state.progresses[i],
        pageId: state.pageIds[i], // 🚀 Đảm bảo kéo theo Page ID
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
      else if (state.currentIndex > oldIndex && state.currentIndex <= newIndex)
        newCurrentIndex--;
      else if (state.currentIndex < oldIndex && state.currentIndex >= newIndex)
        newCurrentIndex++;

      return {
        fileQueue: newQueue,
        processedUrls: newProcessed,
        pageStatuses: newStatuses,
        progresses: newProgresses,
        pageIds: newPageIds,
        currentIndex: newCurrentIndex,
      };
    }),
}));
