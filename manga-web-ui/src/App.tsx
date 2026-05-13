import { useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import Topbar from './components/Layout/Topbar';
import Sidebar from './components/Layout/Sidebar';
import Workspace from './components/Layout/Workspace';
import LayerPanel from './components/Layout/LayerPanel';
import TranslationConfigModal from './components/Modals/TranslationConfigModal';
import LensModal from './components/Modals/LensModal';
import AuthModal from './components/Modals/AuthModal'; // 🚀 Kéo AuthModal vào
import { useToolStore } from './store/useToolStore';
import { useCanvasStore } from './store/useCanvasStore';
import { useAuthStore } from './store/useAuthStore'; // 🚀 Kéo AuthStore vào
import { supabase } from './services/supabaseClient';
import { Toaster } from 'react-hot-toast';

export default function App() {
  const { isZenMode, toggleZenMode, setActiveMode, showLeftPanel, showRightPanel } = useToolStore();
  const { undo, redo } = useCanvasStore.temporal.getState();
  const { setUser } = useAuthStore();

  // 🚀 TỰ ĐỘNG KIỂM TRA ĐĂNG NHẬP KHI BẬT WEB
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session);
    });

    return () => subscription.unsubscribe();
  }, [setUser]);

  // CÀI ĐẶT BỘ PHÍM TẮT CHUẨN NGÀNH
  useHotkeys('v', () => setActiveMode('none'), { enableOnFormTags: false });
  useHotkeys('b', () => setActiveMode('restore'), { enableOnFormTags: false });
  useHotkeys('e', () => setActiveMode('erase'), { enableOnFormTags: false });
  useHotkeys('s', () => setActiveMode('scan'), { enableOnFormTags: false });
  useHotkeys('tab', (e) => { 
    e.preventDefault(); 
    toggleZenMode(); 
  }, { enableOnFormTags: false });
  useHotkeys('mod+z', (e) => { e.preventDefault(); undo(); }, { enableOnFormTags: false });
  useHotkeys('mod+y, mod+shift+z', (e) => { e.preventDefault(); redo(); }, { enableOnFormTags: false });

  return (
    <div className="flex flex-col h-screen bg-background text-text-main overflow-hidden font-sans">
      <Toaster position="top-center" reverseOrder={false} /> {/* 🚀 Thêm dòng này */}
      <AuthModal /> 

      <div 
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isZenMode ? '0fr' : '1fr' }}
      >
        <div className="overflow-hidden">
          <Topbar />
        </div>
      </div>

      <div 
        className="flex-1 transition-all duration-300 ease-in-out grid"
        style={{
          gridTemplateColumns: `${isZenMode || !showLeftPanel ? '0px' : '256px'} 1fr ${isZenMode || !showRightPanel ? '0px' : '256px'}`
        }}
      >
        <div className="overflow-hidden bg-sidebar"><Sidebar /></div>
        <div className="overflow-hidden relative flex flex-col"><Workspace /></div>
        <div className="overflow-hidden bg-sidebar"><LayerPanel /></div>
      </div>
      
      <TranslationConfigModal />
      <LensModal />
    </div>
  );
}