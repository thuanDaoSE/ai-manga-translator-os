import { useToolStore } from '../../store/useToolStore';
import { useCanvasStore } from '../../store/useCanvasStore';

export default function LensModal() {
  const { scanModal, setScanModal, setActiveMode } = useToolStore();
  const { addBubble } = useCanvasStore();

  if (!scanModal || !scanModal.isOpen) return null;

  const handleApply = () => {
    addBubble({
      x: Math.min(scanModal.coords.x1, scanModal.coords.x2),
      y: Math.min(scanModal.coords.y1, scanModal.coords.y2),
      w: Math.max(Math.abs(scanModal.coords.x2 - scanModal.coords.x1), 80),
      h: Math.max(Math.abs(scanModal.coords.y2 - scanModal.coords.y1), 40),
      text: scanModal.vie,
      fontSize: useToolStore.getState().fontSize,
      fontColor: useToolStore.getState().fontColor,
      fontFamily: useToolStore.getState().fontFamily,
      rotation: 0
    });
    setScanModal(null);
    setActiveMode('none');
  };

  return (
    <div className="absolute z-[1000] bg-[#222] border border-[#555] p-3 rounded-lg shadow-2xl w-[260px]"
         style={{ left: scanModal.coords.x2, top: scanModal.coords.y2 }}>
      <div className="text-[11px] text-[#aaa] mb-1 tracking-wider uppercase">🇯🇵 Nguyên bản</div>
      <textarea readOnly value={scanModal.jap} className="w-full bg-[#111] text-white border border-[#444] p-2 rounded text-sm mb-3" rows={2} />
      
      <div className="text-[11px] text-[#aaa] mb-1 tracking-wider uppercase">🇻🇳 Bản dịch</div>
      <textarea value={scanModal.vie} onChange={(e) => setScanModal({ ...scanModal, vie: e.target.value })} className="w-full bg-[#111] text-white border border-[#444] p-2 rounded text-sm mb-3 focus:border-[#9c27b0] outline-none" rows={3} />
      
      <div className="flex justify-end gap-2">
        <button onClick={() => setScanModal(null)} className="btn-secondary bg-[#555] hover:bg-gray-600">Hủy</button>
        <button onClick={handleApply} className="btn-primary">✨ Áp dụng</button>
      </div>
    </div>
  );
}