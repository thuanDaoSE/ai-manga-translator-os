import { useState } from 'react';
import toast from 'react-hot-toast';
import { mangaApi } from '../services/api';
import { useProjectStore } from '../store/useProjectStore';
import { useAuthStore } from '../store/useAuthStore';

export interface UseMangaUploadReturn {
  isAgreed: boolean;
  setIsAgreed: (agreed: boolean) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleImportManga: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  checkAuth: () => boolean;
}

export function useMangaUpload(): UseMangaUploadReturn {
  const projectStore = useProjectStore();
  const [isAgreed, setIsAgreedState] = useState<boolean>(() => {
    return localStorage.getItem('manga_policy_agreed') === 'true';
  });

  const setIsAgreed = (agreed: boolean) => {
    setIsAgreedState(agreed);
    localStorage.setItem('manga_policy_agreed', agreed ? 'true' : 'false');
  };

  const checkAuth = (): boolean => {
    const session = useAuthStore.getState().session;
    if (!session) {
      toast.error('Vui lòng đăng nhập để sử dụng tính năng này!');
      return false;
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!checkAuth()) {
      e.target.value = '';
      return;
    }

    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      if (files.length > 500) {
        toast.error('Hệ thống hỗ trợ tải lên tối đa 500 trang cho mỗi phiên làm việc!');
        e.target.value = '';
        return;
      }

      const badFile = files.find((f) => f.size > 10 * 1024 * 1024);
      if (badFile) {
        toast.error(`File ${badFile.name} vượt quá 10MB!`);
        e.target.value = '';
        return;
      }

      projectStore.uploadProjectFiles(files);
    }
  };

  const handleImportManga = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!checkAuth()) {
      e.target.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const loadId = toast.loading(`Đang khôi phục: ${file.name}...`);
    try {
      const projectName = file.name.replace('.manga', '');
      const newProject = await mangaApi.createProject(projectName);
      projectStore.setProjectId(newProject.id);

      await mangaApi.importManga(newProject.id, file);

      toast.success('Khôi phục thành công! Đang tải...', { id: loadId });
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khôi phục', { id: loadId });
    }
    e.target.value = '';
  };

  return {
    isAgreed,
    setIsAgreed,
    handleFileChange,
    handleImportManga,
    checkAuth,
  };
}
