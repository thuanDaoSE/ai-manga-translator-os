import { useHotkeys } from 'react-hotkeys-hook';
import Topbar from './components/Layout/Topbar';
import Sidebar from './components/Layout/Sidebar';
import Workspace from './components/Layout/Workspace';
import { useEffect, useRef, useState } from 'react';
import AuthModal from './components/Modals/AuthModal';
import LandingPage from './components/LandingPage';
import { useToolStore } from './store/useToolStore';
import { useCanvasStore } from './store/useCanvasStore';
import { useProjectStore } from './store/useProjectStore';
import { useAuthStore } from './store/useAuthStore';
import { useConfigStore } from './store/useConfigStore';
import { supabase } from './services/supabaseClient';
import toast, { Toaster } from 'react-hot-toast';
import RightSidebar from './components/Layout/RightSidebar';
import { notify } from './utils/toast';

const darkToastOptions = {
  duration: 4000,
  style: {
    background: 'rgba(15, 23, 42, 0.95)',
    color: '#f8fafc',
    border: '1px solid rgba(51, 65, 85, 0.8)',
    borderRadius: '12px',
    padding: '10px 16px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(12px)',
    fontSize: '13px',
    maxWidth: '460px',
  },
  success: {
    iconTheme: {
      primary: '#10b981',
      secondary: '#0f172a',
    },
  },
  error: {
    iconTheme: {
      primary: '#f43f5e',
      secondary: '#0f172a',
    },
  },
  loading: {
    iconTheme: {
      primary: '#6366f1',
      secondary: '#0f172a',
    },
  },
};

import { mangaApi } from './services/api';

// 🚀 BẢN VÁ: Import hàm quản lý Font cá nhân

export default function App() {
  const { isZenMode, toggleZenMode, setActiveMode, showLeftPanel, scanModal, showRightPanel, activeMode, actionPosition, setShowRightPanel } = useToolStore();
  const { setUser, session, user, loading } = useAuthStore();
  const { projectId } = useProjectStore();
  const bubbles = useCanvasStore((state) => state.bubbles);
  const activeBubbleId = useCanvasStore((state) => state.activeBubbleId);
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
    const cleanTrailingHash = () => {
      if (window.location.href.includes('#')) {
        const hash = window.location.hash;
        // Only strip the hash if it is empty or just '#' (i.e. Supabase has finished processing the token)
        if (hash === '' || hash === '#') {
          const cleanUrl = window.location.href.split('#')[0];
          window.history.replaceState(null, document.title, cleanUrl);
        }
      }
    };

    const mockUser = {
      id: "default-mock-user",
      email: "td2005dataeg@gmail.com",
      user_metadata: { email: "td2005dataeg@gmail.com" },
      credits: 1200,
      isPro: false
    };
    const mockSession = {
      access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZWZhdWx0LW1vY2stdXNlciIsImVtYWlsIjoidGQyMDA1ZGF0YWVnQGdtYWlsLmNvbSJ9.signature",
      user: mockUser
    };

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session || mockSession);
        cleanTrailingHash();
      })
      .catch((err) => {
        console.warn("Supabase getSession fallback to mock session:", err);
        setUser(mockSession);
        cleanTrailingHash();
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session || mockSession);
      // Wait a moment for Supabase client to finish parsing and clearing its hash params before we strip the remaining '#'
      setTimeout(cleanTrailingHash, 300);
    });

    // Run clean up immediately on mount
    cleanTrailingHash();

    return () => subscription.unsubscribe();
  }, [setUser]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlProjectId = urlParams.get('project') || urlParams.get('project_id');
    const targetProjectId = urlProjectId || localStorage.getItem('active_manga_project_id');

    // Nếu có đăng nhập, có ID dự án, VÀ CHƯA TỪNG KHÔI PHỤC TRONG PHIÊN NÀY
    if (session?.user?.id && targetProjectId && !hasRestored.current) {
      console.log("🔄 Đang khôi phục phiên làm việc cho Dự án:", targetProjectId);

      hasRestored.current = true; // 🚀 Kéo cờ lên ngay lập tức để chặn ngắt vòng lặp!
      localStorage.setItem('active_manga_project_id', targetProjectId);
      useProjectStore.setState({ projectId: targetProjectId });

      mangaApi.getProjectPages(targetProjectId)
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
  useHotkeys('y', () => setActiveMode('restore'), { enableOnFormTags: false });
  useHotkeys('e', () => setActiveMode('erase'), { enableOnFormTags: false });
  useHotkeys('w', () => setActiveMode('scan'), { enableOnFormTags: false });
  useHotkeys('s', () => setActiveMode('clone'), { enableOnFormTags: false });
  useHotkeys('b', () => setActiveMode('speedline'), { enableOnFormTags: false });
  useHotkeys('i', () => {
    setActiveMode('speedline');
    useToolStore.getState().setSpeedlineType('eyedropper');
  }, { enableOnFormTags: false });
  useHotkeys('r', () => {
    const isFluxReady = useToolStore.getState().isFluxReady;
    if (!isFluxReady) {
      useToolStore.getState().triggerHighlightFluxBadge();
      notify.warning(
        'Yêu cầu mở khóa FLUX.1-Fill',
        'Nhấn vào nút "FLUX Fill" ở góc trên để tải mô hình (~6.3GB) và mở khóa tính năng này.'
      );
      return;
    }
    setActiveMode('redraw');
  }, { enableOnFormTags: false });
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

  // 🚀 TỰ ĐỘNG ẨN/HIỆN RIGHT SIDEBAR THÔNG MINH (Không tự ý đè kín màn hình trên Mobile)
  useEffect(() => {
    const isSmallScreen = window.innerWidth < 768;
    if (bubbles.length === 0) {
      setShowRightPanel(false);
    } else if (!isSmallScreen) {
      setShowRightPanel(true);
    }
  }, [bubbles.length, setShowRightPanel]);

  useEffect(() => {
    const isSmallScreen = window.innerWidth < 768;
    if (activeBubbleId && !isSmallScreen) {
      setShowRightPanel(true);
    }
  }, [activeBubbleId, setShowRightPanel]);

  // 🚀 ĐẾM THỜI GIAN THỰC THI CỦA TÁC VỤ AI (REQUEST TIMER)
  const isProcessing = useToolStore((state) => state.isProcessing);
  const setElapsedSeconds = useToolStore((state) => state.setElapsedSeconds);

  useEffect(() => {
    let timerId: any = null;
    if (isProcessing) {
      setElapsedSeconds(0);
      timerId = setInterval(() => {
        const currentSec = useToolStore.getState().elapsedSeconds;
        useToolStore.getState().setElapsedSeconds(currentSec + 1);
      }, 1000);
    }
    return () => {
      if (timerId) {
        clearInterval(timerId);
      }
    };
  }, [isProcessing, setElapsedSeconds]);



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
        <Toaster position="top-center" reverseOrder={false} toastOptions={darkToastOptions} />
        <LandingPage onOpenAuth={() => setShowAuthModal(true)} />
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </>
    );
  }


  return (
    <div className="flex flex-col h-screen bg-background text-text-main overflow-hidden font-sans">
      <Toaster position="top-center" reverseOrder={false} toastOptions={darkToastOptions} />

      <div className="grid transition-[grid-template-rows] duration-300 ease-in-out" style={{ gridTemplateRows: isZenMode ? '0fr' : '1fr' }}>
        <div className={`min-h-0 ${isZenMode ? 'overflow-hidden' : ''}`}><Topbar /></div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">

        {/* 1. LEFT SIDEBAR (Desktop: row item; Mobile: Sliding Drawer with Backdrop) */}
        {(!isZenMode && showLeftPanel) && (
          <>
            {/* Mobile backdrop */}
            <div 
              className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 md:hidden animate-in fade-in duration-200"
              onClick={() => useToolStore.getState().setShowLeftPanel(false)}
            />
            {/* Drawer */}
            <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] md:relative md:w-auto md:max-w-none md:z-20 md:flex animate-in slide-in-from-left duration-200 shadow-2xl md:shadow-none">
              <Sidebar />
            </div>
          </>
        )}

        {/* 2. CENTER WORKSPACE (Nằm giữa, 100% diện tích trên mobile) */}
        <div className="flex-1 relative flex flex-col overflow-hidden w-full">
          <Workspace />
        </div>

        {/* 🚀 4. RIGHT SIDEBAR (Desktop: row item; Mobile: Sliding Drawer with Backdrop) */}
        {(!isZenMode && (showRightPanel || scanModal?.isOpen || (activeMode === 'redraw' && !!actionPosition))) && (
          <>
            {/* Mobile backdrop */}
            <div 
              className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 md:hidden animate-in fade-in duration-200"
              onClick={() => useToolStore.getState().setShowRightPanel(false)}
            />
            {/* Drawer */}
            <div className="fixed inset-y-0 right-0 z-50 w-80 max-w-[90vw] md:relative md:w-auto md:max-w-none md:z-20 md:flex animate-in slide-in-from-right duration-200 shadow-2xl md:shadow-none">
              <RightSidebar />
            </div>
          </>
        )}

      </div>
    </div>
  );
}