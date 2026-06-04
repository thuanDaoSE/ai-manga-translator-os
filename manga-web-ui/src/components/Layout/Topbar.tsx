import { toJpeg } from "html-to-image";
import {
  PanelLeft, PanelRight, Download, ZoomIn, ZoomOut, Eye, Wand2,
  Languages, ImageDown, Upload, Save, Palette, PartyPopper, AlertTriangle
} from "lucide-react";
import toast from 'react-hot-toast';
import { useToolStore } from "../../store/useToolStore";
import { useProjectStore } from "../../store/useProjectStore";
import { useCanvasStore } from "../../store/useCanvasStore";
import { useConfigStore } from "../../store/useConfigStore";
import { writePsd } from 'ag-psd';
import { saveAs } from 'file-saver';
import { mangaApi } from "../../services/api";

export default function Topbar() {
  const { currentZoom, setZoom, isComparing, setIsComparing } = useToolStore();
  const projectStore = useProjectStore();
  const configStore = useConfigStore();

  const handleExportManga = () => {
    const pageId = useProjectStore.getState().pageIds[useProjectStore.getState().currentIndex];
    if (!pageId) return toast.error("Chưa có trang truyện nào được chọn!");

    window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/pages/${pageId}/export-manga`, '_blank');
    toast.success("Đang tải file dự án về máy!");
  };

  const handleExportImage = async () => {
    const node = document.getElementById("workspace-container");
    if (!node) return toast.error("Chưa có ảnh để xuất!");

    useCanvasStore.getState().setActiveBubble(null);

    const loadingToast = toast.loading("Đang xuất ảnh JPG nét căng...");

    try {
      await new Promise(r => setTimeout(r, 100));

      const originalTransform = node.style.transform;
      node.style.transform = 'scale(1) translate(0px, 0px)';

      const dataUrl = await toJpeg(node, { quality: 0.95 });

      node.style.transform = originalTransform;

      const link = document.createElement("a");
      const pageIndex = useProjectStore.getState().currentIndex + 1;
      link.download = `MangaAI_HoanThien_Trang_${pageIndex}.jpg`;
      link.href = dataUrl;
      link.click();

      toast.success("Đã tải ảnh về máy!", { id: loadingToast });
    } catch (error) {
      console.error(error);
      toast.error("Lỗi khi xuất ảnh!", { id: loadingToast });
    }
  };

  return (
    <div className="bg-panel px-4 py-2.5 flex items-center justify-between border-b border-border z-10 shadow-sm relative">

      {/* TRÁI: Logo và Điều hướng */}
      <div className="flex items-center gap-3">

        <div className="flex items-center gap-2 select-none pr-2">
          <div className="bg-primary/20 p-1.5 rounded-lg border border-primary/30">
            <Wand2 size={16} className="text-primary" />
          </div>
          <span className="font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-text-muted">
            MangaAI Studio
          </span>
        </div>

        {/* Nút: Cấu hình AI */}
        <button
          onClick={() => configStore.setModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/30 rounded-lg transition-colors cursor-pointer shadow-sm"
          title="Dạy AI Văn phong & Từ điển"
        >
          <Languages size={15} />
          <span className="text-[11px] font-bold uppercase tracking-wider">Cấu hình Dịch</span>
        </button>

        {/* Nút: Tải bộ font */}
        <button
          onClick={() => mangaApi.downloadFontPack()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/30 rounded-lg transition-colors cursor-pointer shadow-sm"
          title="Tải bộ Font về máy tính để mở file PSD không bị lỗi Missing Font"
        >
          <Download size={15} />
          <span className="text-[11px] font-bold uppercase tracking-wider">Tải Font</span>
        </button>
      </div>

      {/* GIỮA: Nút So Sánh */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
        <button
          onClick={() => setIsComparing(!isComparing)}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all select-none font-bold text-xs shadow-inner cursor-pointer
            ${isComparing
              ? 'bg-primary text-white border-primary shadow-[0_0_15px_rgba(99,102,241,0.5)]'
              : 'bg-background text-text-muted border-border hover:bg-border hover:text-text-main'}
          `}
          title="Bấm để bật/tắt (Hoặc giữ phím [\\] để xem nhanh)"
        >
          <Eye size={16} /> {isComparing ? "Đang xem bản Gốc" : "Xem ảnh Gốc [ \\ ]"}
        </button>
      </div>

      {/* PHẢI: Zoom & Xuất file */}
      <div className="flex items-center gap-1.5">

        {/* Zoom */}
        <div className="flex items-center">
          <button onClick={() => setZoom(currentZoom - 0.1)} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md cursor-pointer"><ZoomOut size={16} /></button>
          <span className="w-12 text-center font-bold text-xs text-text-main">{Math.round(currentZoom * 100)}%</span>
          <button onClick={() => setZoom(currentZoom + 0.1)} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md cursor-pointer"><ZoomIn size={16} /></button>
        </div>

        <div className="w-px h-5 bg-border mx-2"></div>

        {/* NHÓM XUẤT THÀNH PHẨM ĐƯỢC ĐỒNG BỘ UI */}

        {/* Nút: Xuất File .manga */}
        <button
          onClick={handleExportManga}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white border border-amber-500/30 rounded-lg shadow-sm text-xs font-bold transition-all cursor-pointer"
          title="Tải dự án về máy (Phòng khi server xóa ảnh sau 24h)"
        >
          <Save size={15} />
          <span>Lưu Dự Án</span>
        </button>

        {/* Nút: Xuất PSD */}
        <button
          onClick={async () => {
            const { currentIndex, processedUrls, pageIds } = useProjectStore.getState();
            const pageId = pageIds[currentIndex];
            if (!pageId) return toast.error("Chưa có trang truyện nào!");

            const status = projectStore.pageStatuses[projectStore.currentIndex];
            if (status === "processing") {
              return toast("AI đang xử lý! Vui lòng đợi chạy xong 100% rồi mới tải PSD nhé.", {
                icon: <AlertTriangle className="text-amber-400" size={18} />,
                style: { borderRadius: '10px', background: '#222', color: '#fff', border: '1px solid #333' },
              });
            }

            try {
              toast.loading("Đang đúc file PSD bằng Trình duyệt...", { id: "psd" });

              const imageUrl = processedUrls[currentIndex] || document.querySelector<HTMLImageElement>('img[alt="Manga Raw"]')?.src;
              if (!imageUrl) throw new Error("Không tìm thấy ảnh nền!");

              const img = new Image();
              img.crossOrigin = "anonymous";
              // 🚀 BẢN VÁ: Ép sinh mã thời gian mới để lách cache trình duyệt!
              img.src = `${imageUrl.split('?')[0]}?nocache=${Date.now()}`;
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error("Lỗi tải ảnh nền"));
              });

              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0);

              const bubbles = useCanvasStore.getState().bubbles;

              const psdData: any = {
                width: img.width,
                height: img.height,
                children: [
                  {
                    name: "Background",
                    canvas: canvas,
                  },
                  {
                    name: "Text Layer (AI)",
                    opened: true,
                    children: bubbles.map((b, i) => ({
                      name: b.text ? b.text.substring(0, 15) : `Bubble ${i}`,
                      text: {
                        text: b.text || "...",
                        transform: [1, 0, 0, 1, Math.round(b.x), Math.round(b.y)],
                        shape: 'box',
                        boxBounds: [0, 0, Math.round(b.h), Math.round(b.w)],
                        paragraphStyle: { justification: 'center' },
                        style: {
                          font: { name: b.fontFamily.replace(/'/g, '') || "Arial" },
                          fontSize: b.fontSize || 18,
                          fillColor: { r: 0, g: 0, b: 0, a: 255 }
                        }
                      }
                    }))
                  }
                ]
              };

              const buffer = writePsd(psdData);
              const blob = new Blob([buffer], { type: 'application/octet-stream' });
              saveAs(blob, `Manga_AI_${pageId}.psd`);

              toast.dismiss("psd");

              // Toast Custom Báo thành công (Đã bỏ emoji)
              toast.custom((t) => (
                <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-panel border border-border shadow-2xl rounded-xl pointer-events-auto flex flex-col overflow-hidden`}>
                  <div className="p-4 flex items-start gap-3">
                    <PartyPopper className="text-emerald-400 shrink-0 mt-1" size={28} />
                    <div className="flex-1">
                      <h3 className="text-sm font-bold text-emerald-400">Đã tải file PSD thành công!</h3>
                      <p className="text-xs text-text-muted mt-1.5 leading-relaxed flex items-start gap-1">
                        <AlertTriangle size={14} className="shrink-0 text-amber-400 mt-0.5" />
                        <span>
                          <strong className="text-amber-400">Lưu ý:</strong> Bạn có đang dùng các Font chữ do MangaAI cung cấp không? Nếu có, hãy tải bộ font dưới đây và cài vào máy để Photoshop không bị lỗi định dạng nhé.
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="bg-background/50 border-t border-border px-4 py-3 flex gap-2 justify-end">
                    <button onClick={() => toast.dismiss(t.id)} className="px-4 py-1.5 text-xs font-bold text-text-muted hover:text-text-main cursor-pointer transition-colors">
                      Bỏ qua
                    </button>
                    <button
                      onClick={() => {
                        toast.dismiss(t.id);
                        mangaApi.downloadFontPack();
                      }}
                      className="px-4 py-1.5 text-xs font-bold bg-primary hover:bg-primary-hover text-white rounded-lg shadow-md cursor-pointer flex items-center gap-1.5 transition-colors"
                    >
                      <Download size={14} /> Tải Bộ Font
                    </button>
                  </div>
                </div>
              ), { duration: 15000 });
            } catch (error: any) {
              toast.error(error.message, { id: "psd" });
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-500/30 rounded-lg shadow-sm text-xs font-bold transition-all cursor-pointer"
          title="Lớp chữ và hình được tách riêng biệt"
        >
          <Palette size={15} />
          <span>Xuất PSD</span>
        </button>

        {/* Nút: Xuất Ảnh JPG */}
        <button
          onClick={handleExportImage}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/30 rounded-lg shadow-sm text-xs font-bold transition-all cursor-pointer"
          title="Lưu thành ảnh JPG có chữ"
        >
          <ImageDown size={15} />
          <span>Lưu JPG</span>
        </button>

      </div>
    </div>
  );
}