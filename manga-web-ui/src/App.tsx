import { useHotkeys } from 'react-hotkeys-hook';
import Topbar from './components/Layout/Topbar';
import Sidebar from './components/Layout/Sidebar';
import Workspace from './components/Layout/Workspace';
import TranslationConfigModal from './components/Modals/TranslationConfigModal';
import { useEffect, useRef, useState } from 'react';
import AuthModal from './components/Modals/AuthModal';
import LandingPage from './components/LandingPage';
import { useToolStore } from './store/useToolStore';
import { useCanvasStore } from './store/useCanvasStore';
import { useProjectStore } from './store/useProjectStore';
import { useAuthStore } from './store/useAuthStore';
import { supabase } from './services/supabaseClient';
import { Toaster } from 'react-hot-toast';
import RightSidebar from './components/Layout/RightSidebar';

import TestFabric from './components/TestFabric';
import { mangaApi } from './services/api';

// 🚀 BẢN VÁ: Import hàm quản lý Font cá nhân

export default function App() {
  const { isZenMode, toggleZenMode, setActiveMode, showLeftPanel, scanModal, showRightPanel } = useToolStore();
  const { setUser, session, user, loading } = useAuthStore();
  const { projectId } = useProjectStore();
  const hasRestored = useRef(false);

  // 🚀 KHÔI PHỤC FONT TỪ TRÌNH DUYỆT LÊN NGAY KHI MỞ WEB
  // useEffect(() => {
  //   loadAllSavedFonts()
  //     .then(fonts => {
  //       if (fonts.length > 0) console.log("✅ Đã khôi phục các font cá nhân:", fonts);
  //     })
  //     .catch(console.error);
  // }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session));
    return () => subscription.unsubscribe();
  }, [setUser]);

  useEffect(() => {
    const savedProjectId = localStorage.getItem('active_manga_project_id');

    // Nếu có đăng nhập, có ID dự án, VÀ CHƯA TỪNG KHÔI PHỤC TRONG PHIÊN NÀY
    if (session?.user?.id && savedProjectId && !hasRestored.current) {
      console.log("🔄 Đang khôi phục phiên làm việc cho Dự án:", savedProjectId);

      hasRestored.current = true; // 🚀 Kéo cờ lên ngay lập tức để chặn ngắt vòng lặp!

      mangaApi.getProjectPages(savedProjectId)
        .then((data) => {
          if (data && data.pages && data.pages.length > 0) {
            useProjectStore.getState().restoreProject(data.pages);
          }
        })
        .catch((err) => {
          console.error("Không thể khôi phục:", err);
          useProjectStore.getState().clearProject();
        });
    }
  }, [session?.user?.id]);

  useHotkeys('v', () => setActiveMode('none'), { enableOnFormTags: false });
  useHotkeys('b', () => setActiveMode('restore'), { enableOnFormTags: false });
  useHotkeys('e', () => setActiveMode('erase'), { enableOnFormTags: false });
  useHotkeys('s', () => setActiveMode('scan'), { enableOnFormTags: false });
  useHotkeys('r', () => setActiveMode('redraw'), { enableOnFormTags: false });
  useHotkeys('tab', (e) => { e.preventDefault(); toggleZenMode(); }, { enableOnFormTags: false });

  // 🚀 Phím tắt Undo/Redo an toàn
  useHotkeys('mod+z', (e) => {
    e.preventDefault();
    useProjectStore.getState().undoUrl();
    useCanvasStore.getState().undo();
  }, { enableOnFormTags: false });

  useHotkeys('mod+y, mod+shift+z', (e) => {
    e.preventDefault();
    useProjectStore.getState().redoUrl();
    useCanvasStore.getState().redo();
  }, { enableOnFormTags: false });

  const [showAuthModal, setShowAuthModal] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Toaster position="top-center" reverseOrder={false} />
        <LandingPage onOpenAuth={() => setShowAuthModal(true)} />
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-text-main overflow-hidden font-sans">
      <Toaster position="top-center" reverseOrder={false} />

      {/* 🚀 FIX: KHÔI PHỤC LẠI MODAL CẤU HÌNH DỊCH VÀO ĐÂY */}
      <TranslationConfigModal />

      <div className="grid transition-[grid-template-rows] duration-300 ease-in-out" style={{ gridTemplateRows: isZenMode ? '0fr' : '1fr' }}>
        <div className={`min-h-0 ${isZenMode ? 'overflow-hidden' : ''}`}><Topbar /></div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* 1. LEFT SIDEBAR (Đã tháo thẻ div bọc ngoài để nó tự do co giãn) */}
        {(!isZenMode && showLeftPanel) && <Sidebar />}

        {/* 2. CENTER WORKSPACE (Nằm giữa) */}
        <div className="flex-1 relative flex flex-col overflow-hidden">
          <Workspace />
        </div>

        {/* 🚀 4. RIGHT SIDEBAR (Nằm gọn gàng bên phải và Tích hợp LensModal) */}
        {(!isZenMode && (showRightPanel || scanModal?.isOpen)) && <RightSidebar />}

      </div>

      {/* 🗑️ Lưu ý: Sếp nhớ XÓA bỏ dòng <TranslationConfigModal /> cũ ở đây nhé, vì mình bỏ nó rồi! */}
    </div>
  );
}