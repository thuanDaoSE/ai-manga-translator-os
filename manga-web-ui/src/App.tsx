import { useHotkeys } from 'react-hotkeys-hook';
import Topbar from './components/Layout/Topbar';
import Sidebar from './components/Layout/Sidebar';
import Workspace from './components/Layout/Workspace';
import LayerPanel from './components/Layout/LayerPanel';
import TranslationConfigModal from './components/Modals/TranslationConfigModal';
import { useToolStore } from './store/useToolStore';
import { useCanvasStore } from './store/useCanvasStore';

export default function App() {
  // 🚀 Đã gộp chung vào bên trong hàm App
  const { isZenMode, toggleZenMode, setActiveMode, showLeftPanel, showRightPanel } = useToolStore();

  const { undo, redo } = useCanvasStore.temporal.getState();

  // 🚀 CÀI ĐẶT BỘ PHÍM TẮT CHUẨN NGÀNH
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
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      
      {/* 🚀 KHU VỰC TOPBAR: Dùng Grid 0fr/1fr để tự động co giãn chiều cao mượt mà */}
      <div 
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isZenMode ? '0fr' : '1fr' }}
      >
        <div className="overflow-hidden">
          <Topbar />
        </div>
      </div>

      {/* KHU VỰC MAIN: Trượt 2 thanh Sidebar ra ngoài màn hình */}
      <div 
        className="flex-1 transition-all duration-300 ease-in-out grid"
        style={{
          // 🚀 Nếu đang ZenMode HOẶC bị ẩn -> 0px, ngược lại -> 256px
          gridTemplateColumns: `${isZenMode || !showLeftPanel ? '0px' : '256px'} 1fr ${isZenMode || !showRightPanel ? '0px' : '256px'}`
        }}
      >
        <div className="overflow-hidden bg-sidebar"><Sidebar /></div>
        <div className="overflow-hidden relative flex flex-col"><Workspace /></div>
        <div className="overflow-hidden bg-sidebar"><LayerPanel /></div>
      </div>
      
      <TranslationConfigModal />
    </div>
  );
}