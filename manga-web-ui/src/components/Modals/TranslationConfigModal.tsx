import { useEffect } from 'react';
import { useConfigStore } from '../../store/useConfigStore';

export default function TranslationConfigModal() {
  const config = useConfigStore();

  // Tự động load cấu hình cũ khi bật App
  useEffect(() => {
    config.loadFromLocal();
  }, []);

  if (!config.isModalOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      config.importFromFile(content, file.name.endsWith('.json'));
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000]">
      <div className="bg-[#1e1e1e] p-6 rounded-lg border border-gray-600 w-[450px] shadow-2xl">
        <h3 className="mt-0 mb-4 text-primary text-lg font-bold">⚙️ Cấu hình AI DeepSeek</h3>

        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label className="text-[11px] text-gray-400 block mb-1">THỂ LOẠI</label>
            <select value={config.genre} onChange={(e) => config.setConfig('genre', e.target.value)} className="w-full bg-[#111] text-white border border-gray-600 p-2 rounded text-sm mb-1">
              <option value="Shounen (Hành động, nhiệt huyết)">Shounen (Hành động)</option>
              <option value="Shoujo (Lãng mạn, tình cảm)">Shoujo (Lãng mạn)</option>
              <option value="Isekai (Xuyên không, phép thuật)">Isekai (Xuyên không)</option>
              <option value="custom">✍️ Tự nhập...</option>
            </select>
            {config.genre === 'custom' && (
              <input type="text" value={config.customGenre} onChange={(e) => config.setConfig('customGenre', e.target.value)} placeholder="Nhập thể loại..." className="w-full bg-[#111] text-white border border-gray-600 p-2 rounded text-sm mt-1" />
            )}
          </div>

          <div className="flex-1">
            <label className="text-[11px] text-gray-400 block mb-1">VĂN PHONG</label>
            <select value={config.tone} onChange={(e) => config.setConfig('tone', e.target.value)} className="w-full bg-[#111] text-white border border-gray-600 p-2 rounded text-sm mb-1">
              <option value="Tự nhiên, đời thường, ngôn ngữ mạng">Đời thường / Hiện đại</option>
              <option value="Trang trọng, cổ trang, kiếm hiệp">Cổ trang / Nghiêm túc</option>
              <option value="Hài hước, lầy lội">Hài hước / Lầy lội</option>
              <option value="custom">✍️ Tự nhập...</option>
            </select>
            {config.tone === 'custom' && (
              <input type="text" value={config.customTone} onChange={(e) => config.setConfig('customTone', e.target.value)} placeholder="Nhập văn phong..." className="w-full bg-[#111] text-white border border-gray-600 p-2 rounded text-sm mt-1" />
            )}
          </div>
        </div>

        <label className="text-[11px] text-gray-400 block mb-1">XƯNG HÔ CHUNG</label>
        <select value={config.pronoun} onChange={(e) => config.setConfig('pronoun', e.target.value)} className="w-full bg-[#111] text-white border border-gray-600 p-2 rounded text-sm mb-2">
          <option value="Tôi - Cậu (Bạn bè ngang hàng)">Tôi - Cậu (Bạn bè)</option>
          <option value="Anh - Em (Nam lớn tuổi hơn nữ)">Anh - Em</option>
          <option value="Ta - Ngươi (Kẻ thù, cổ trang)">Ta - Ngươi</option>
          <option value="Mày - Tao (Kẻ thù, giang hồ)">Mày - Tao (Gắt)</option>
          <option value="custom">✍️ Tự nhập...</option>
        </select>
        {config.pronoun === 'custom' && (
          <input type="text" value={config.customPronoun} onChange={(e) => config.setConfig('customPronoun', e.target.value)} placeholder="Ví dụ: Lão phu - Tiểu tử..." className="w-full bg-[#111] text-white border border-gray-600 p-2 rounded text-sm mb-2" />
        )}

        <div className="flex justify-between items-center mt-3 mb-1">
          <label className="text-[11px] text-gray-400">📚 TỪ ĐIỂN NHÂN VẬT (GLOSSARY)</label>
          <label className="btn-secondary bg-secondary px-2 py-1 text-[11px] cursor-pointer hover:bg-blue-600 rounded">
            📂 Nhập từ File (.txt, .json)
            <input type="file" accept=".txt,.json" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
        <textarea 
          value={config.glossary} onChange={(e) => config.setConfig('glossary', e.target.value)}
          className="w-full bg-[#111] text-white border border-gray-600 p-2 rounded text-sm min-h-[100px] resize-y" 
          placeholder="Nhập theo mẫu:&#10;Naruto = Naruto (Xưng: Tớ - Cậu)&#10;Sasuke = Sasuke (Xưng: Tôi - Cậu)"
        />

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => config.setModalOpen(false)} className="btn-secondary bg-gray-600 hover:bg-gray-500">Đóng</button>
          <button onClick={() => { config.saveToLocal(); alert("✅ Đã lưu cấu hình!"); }} className="btn-primary">💾 Lưu Cấu Hình</button>
        </div>
      </div>
    </div>
  );
}