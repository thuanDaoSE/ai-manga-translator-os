import Topbar from './components/Layout/Topbar';
import Sidebar from './components/Layout/Sidebar';
import Workspace from './components/Layout/Workspace';
import TranslationConfigModal from './components/Modals/TranslationConfigModal'; // Thêm dòng này

function App() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <Workspace />
      </div>
      {/* Thêm Popup vào đây */}
      <TranslationConfigModal /> 
    </div>
  );
}

export default App;