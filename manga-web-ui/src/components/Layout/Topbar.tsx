import { toJpeg } from "html-to-image";
import { Undo2, Redo2, PanelLeft, PanelRight, Download, ZoomIn, ZoomOut, Eye, Wand2, FileCode, Languages, ImageDown,Upload } from "lucide-react";
import toast from 'react-hot-toast';
import { useToolStore } from "../../store/useToolStore";
import { useProjectStore } from "../../store/useProjectStore";
import { useCanvasStore } from "../../store/useCanvasStore";
import { useConfigStore } from "../../store/useConfigStore";
import { writePsd } from 'ag-psd';
import { saveAs } from 'file-saver';
import { mangaApi } from "../../services/api";

export default function Topbar() {
  const { showLeftPanel, showRightPanel, toggleLeftPanel, toggleRightPanel, currentZoom, setZoom, isComparing, setIsComparing } = useToolStore();
  const projectStore = useProjectStore();
  const configStore = useConfigStore();

  const handleExportManga = () => {
    const pageId = useProjectStore.getState().pageIds[useProjectStore.getState().currentIndex];
    if (!pageId) return toast.error("Chưa có trang truyện nào được chọn!");
    
    // Mở URL tải xuống, trình duyệt sẽ tự động cúp file về máy!
    window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/pages/${pageId}/export-manga`, '_blank');
    toast.success("Đang tải file dự án về máy!");
  };

  // 🚀 HÀM MỚI: XUẤT ẢNH JPG TRỰC TIẾP TỪ WEB
  const handleExportImage = async () => {
    const node = document.getElementById("workspace-container");
    if (!node) return toast.error("Chưa có ảnh để xuất!");
    
    // Bỏ chọn text để xóa cái viền đứt nét (nếu có) trước khi chụp ảnh
    useCanvasStore.getState().setActiveBubble(null); 
    
    const loadingToast = toast.loading("Đang xuất ảnh JPG nét căng...");
    
    try {
      // Đợi 100ms để React kịp xóa cái viền đứt nét
      await new Promise(r => setTimeout(r, 100));

      // MẸO UX/UI: Tạm thời reset Zoom về 100% để tool chụp được độ phân giải gốc của ảnh
      const originalTransform = node.style.transform;
      node.style.transform = 'scale(1) translate(0px, 0px)'; 
      
      const dataUrl = await toJpeg(node, { quality: 0.95 }); // Chụp ảnh chất lượng cao 95%
      
      // Trả lại độ Zoom cũ cho người dùng
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

  // 🚀 HÀM TẢI SCRIPT JSX 
  const handleDownloadJSX = () => {
    const bubbles = useCanvasStore.getState().bubbles;
    
    if (!bubbles || bubbles.length === 0) {
      return toast.error("Chưa có chữ nào trên trang!");
    }

    const js_data = bubbles
      .filter(b => b.text && b.text.trim() !== "")
      .map(b => ({
        text: b.text,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        fontSize: b.fontSize || 16,
        fontColor: (b.fontColor || "#000000").replace("#", ""),
        fontFamily: b.fontFamily || "Arial" 
      }));

    if (js_data.length === 0) {
      return toast.error("Các hộp thoại đều đang trống!");
    }

    const loadingToast = toast.loading("Đang đóng gói Script...");

    try {
      const js_array_str = JSON.stringify(js_data);
      const jsx_content = `// Script Tu Dong Hoa Typesetting
if (app.documents.length > 0) {
    var doc = app.activeDocument;
    app.preferences.rulerUnits = Units.PIXELS;
    var mangaData = ${js_array_str};
    var textGroup;
    try {
        textGroup = doc.layerSets.getByName("[3] Text (Tu Dong)");
        try { textGroup.artLayers.getByName("Cam_Xoa_Layer_Nay").remove(); } catch(err) {}
    } catch(e) {
        textGroup = doc.layerSets.add();
        textGroup.name = "[3] Text (Tu Dong)";
    }
    for (var i = 0; i < mangaData.length; i++) {
        var item = mangaData[i];
        var textLayer = textGroup.artLayers.add();
        textLayer.kind = LayerKind.TEXT;
        var ti = textLayer.textItem;
        ti.kind = TextType.PARAGRAPHTEXT;
        ti.width = item.w;
        ti.height = item.h;
        ti.position = [item.x, item.y];
        ti.contents = item.text;
        try {
            ti.size = new UnitValue(item.fontSize, "px");
            ti.justification = Justification.CENTER;
            ti.font = item.fontFamily;
            var textColor = new SolidColor();
            textColor.rgb.hexValue = item.fontColor;
            ti.color = textColor;
        } catch(e) {}
    }
    alert("Thành công! Đã chèn xong " + mangaData.length + " bong bóng thoại!");
} else {
    alert("Vui lòng mở file PSD lên trước khi chạy script!");
}`;

      const blob = new Blob([jsx_content], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const pageIndex = useProjectStore.getState().currentIndex + 1;
      link.setAttribute('download', `MangaAI_TextScript_Page_${pageIndex}.jsx`); 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Tải Script JSX thành công!", { id: loadingToast });
    } catch (error) {
      toast.error("Có lỗi xảy ra khi tạo file Script!", { id: loadingToast });
    }
  };

  const handleDownloadPSD = async () => {
    const currentPageId = projectStore.pageIds[projectStore.currentIndex];
    if (!currentPageId) return toast.error("Chưa có trang nào được chọn!");
    
    const status = projectStore.pageStatuses[projectStore.currentIndex];
    if (status === "processing") {
        return toast("⏳ AI đang xử lý! Vui lòng đợi chạy xong 100% rồi mới tải PSD nhé.", {
          icon: '⚠️',
          style: { borderRadius: '10px', background: '#333', color: '#fff' },
        });
    }
    
    const loadingToast = toast.loading("Đang tạo file PSD...");
    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/pages/${currentPageId}/download-psd`);
        if (!response.ok) throw new Error("Lỗi tải PSD");
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `MangaAI_Page_${projectStore.currentIndex + 1}.psd`); 
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Tải PSD thành công!", { id: loadingToast });
    } catch (error) {
        toast.error("Lỗi: Hãy chắc chắn ảnh đã được Dịch/Tẩy nền!", { id: loadingToast });
    }
  };

  return (
    <div className="bg-panel px-4 py-2.5 flex items-center justify-between border-b border-border z-10 shadow-sm relative">
      
      {/* TRÁI: Logo và Điều hướng */}
      <div className="flex items-center gap-3">
       
        <div className="flex items-center gap-2 select-none">
          <div className="bg-primary/20 p-1.5 rounded-lg border border-primary/30">
            <Wand2 size={16} className="text-primary" />
          </div>
          <span className="font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-text-muted">MangaAI Studio</span>
        </div>
        
        {/* 🚀 ĐÃ SỬA: Biến Cài đặt AI thành nút to, có chữ, nhúng màu xanh lá (Emerald) rực rỡ */}
        <button 
          onClick={() => configStore.setModalOpen(true)} 
          className="flex items-center gap-1.5 px-3 py-1.5 ml-4 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-full transition-colors cursor-pointer shadow-sm" 
          title="Dạy AI Văn phong & Từ điển"
        >
          <Languages size={16} />
          <span className="text-[11px] font-bold uppercase tracking-wider">Cấu hình Dịch</span>
        </button>

        {/* NÚT: TẢI BỘ FONT (TỪ SERVER VỀ MÁY) */}
        <button 
          onClick={() => mangaApi.downloadFontPack()} 
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30 rounded-full transition-colors cursor-pointer shadow-sm" 
          title="Tải bộ Font về máy tính để mở file PSD không bị lỗi Missing Font"
        >
          <Download size={16} />
          <span className="text-[11px] font-bold uppercase tracking-wider">Tải Font</span>
        </button>

        {/* 🚀 NÚT MỚI: THÊM FONT (TỪ MÁY LÊN SERVER) */}
        <input 
          type="file" 
          id="font-upload-input" 
          accept=".ttf,.otf" 
          className="hidden" 
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              toast.loading("Đang tải font lên Server...", { id: "uploadFont" });
              await mangaApi.uploadFont(file);
              toast.success("Thêm Font thành công! Bấm F5 để tải lại Web nhé sếp.", { id: "uploadFont" });
            } catch (error: any) {
              toast.error(error.message || "Lỗi tải font", { id: "uploadFont" });
            }
          }}
        />
        <button 
          onClick={() => document.getElementById('font-upload-input')?.click()} 
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 rounded-full transition-colors cursor-pointer shadow-sm" 
          title="Tải font chữ mới (.ttf, .otf) lên kho dùng chung"
        >
          <Upload size={16} />
          <span className="text-[11px] font-bold uppercase tracking-wider">Thêm Font</span>
        </button>
      </div>

      {/* GIỮA: Nút So Sánh (Né vùng làm việc) */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
        <button
          // 🚀 ĐÃ SỬA: Chuyển từ Hold (Giữ) sang Toggle (Công tắc 1 click)
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

      {/* PHẢI: Zoom, Undo, Xuất file */}
      <div className="flex items-center gap-1">
        
        {/* 🚀 BỔ SUNG 2 NÚT UNDO / REDO Ở ĐÂY */}
        <button 
          onClick={() => useCanvasStore.getState().undo()} 
          disabled={useCanvasStore.getState().past.length === 0}
          className={`p-1.5 rounded-md transition-colors ${useCanvasStore.getState().past.length === 0 ? 'text-gray-600/50 cursor-not-allowed' : 'text-text-muted hover:text-text-main hover:bg-border cursor-pointer'}`}
          title="Hoàn tác (Ctrl+Z)"
        >
          <Undo2 size={18} />
        </button>
        <button 
          onClick={() => useCanvasStore.getState().redo()} 
          disabled={useCanvasStore.getState().future.length === 0}
          className={`p-1.5 rounded-md transition-colors ${useCanvasStore.getState().future.length === 0 ? 'text-gray-600/50 cursor-not-allowed' : 'text-text-muted hover:text-text-main hover:bg-border cursor-pointer'}`}
          title="Làm lại (Ctrl+Y)"
        >
          <Redo2 size={18} />
        </button>
        
        <div className="w-px h-5 bg-border mx-2"></div>
        {/* KẾT THÚC BỔ SUNG UNDO/REDO */}

        <button onClick={() => setZoom(currentZoom - 0.1)} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md cursor-pointer"><ZoomOut size={18} /></button>
        <span className="w-12 text-center font-bold text-xs text-text-main">{Math.round(currentZoom * 100)}%</span>
        <button onClick={() => setZoom(currentZoom + 0.1)} className="p-1.5 text-text-muted hover:text-text-main hover:bg-border rounded-md cursor-pointer"><ZoomIn size={18} /></button>
        
        <div className="w-px h-5 bg-border mx-2"></div>

        <button 
    onClick={handleExportManga}
    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded shadow-md text-sm font-bold flex items-center gap-2"
    title="Tải dự án về máy (Phòng khi server xóa ảnh sau 24h)"
  >
    💾 Xuất file (.manga)
  </button>

        {/* 🚀 NHÓM 3 NÚT XUẤT THÀNH PHẨM (SCRIPT - PSD - JPG) */}
        <button 
          onClick={handleDownloadJSX} 
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text-main hover:bg-border rounded-md transition-colors cursor-pointer"
          title="Tải Script chèn chữ tự động (.jsx)"
        >
          <FileCode size={16} />
          <span>Script</span>
        </button>

        {/* NÚT TẢI PSD NGUYÊN BẢN (CHẠY THẲNG TRÊN TRÌNH DUYỆT) */}
          <button
            onClick={async () => {
              const { currentIndex, processedUrls, pageIds } = useProjectStore.getState();
              const pageId = pageIds[currentIndex];
              if (!pageId) return toast.error("Chưa có trang truyện nào!");

              try {
                toast.loading("Đang đúc file PSD bằng Trình duyệt...", { id: "psd" });

                // 1. Lấy ảnh nền (Ảnh Clean hoặc Raw) đang hiện trên màn hình
                const imageUrl = processedUrls[currentIndex] || document.querySelector<HTMLImageElement>('img[alt="Manga Raw"]')?.src;
                if (!imageUrl) throw new Error("Không tìm thấy ảnh nền!");

                // 2. Tải ảnh vào Canvas HTML để lấy dữ liệu Pixel
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = imageUrl;
                await new Promise((resolve, reject) => {
                  img.onload = resolve;
                  img.onerror = () => reject(new Error("Lỗi tải ảnh nền"));
                });

                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);

                // 3. Lấy chữ từ trạng thái của Zustand
                const bubbles = useCanvasStore.getState().bubbles;

                // 4. XÂY DỰNG CẤU TRÚC FILE PSD (Theo chuẩn ag-psd)
                const psdData: any = {
                  width: img.width,
                  height: img.height,
                  children: [
                    {
                      name: "Background", // Lớp 1: Ảnh truyện
                      canvas: canvas, 
                    },
                    {
                      name: "Text Layer (AI)", // Lớp 2: Group chứa các bong bóng chữ
                      opened: true,
                      children: bubbles.map((b, i) => ({
                        name: b.text ? b.text.substring(0, 15) : `Bubble ${i}`,
                        text: {
                          text: b.text || "...",
                          transform: [1, 0, 0, 1, Math.round(b.x), Math.round(b.y)], 
                          
                          // 🚀 BÍ QUYẾT 1: Ép thành chế độ Text Box (Tự động xuống dòng)
                          shape: 'box',
                          boxBounds: [0, 0, Math.round(b.h), Math.round(b.w)], // Tọa độ: [top, left, bottom, right]
                          
                          // 🚀 BÍ QUYẾT 2: Căn giữa chữ chuẩn Manga
                          paragraphStyle: { 
                            justification: 'center' 
                          },

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

                // 5. Gói thành file PSD nhị phân và Tải về
                const buffer = writePsd(psdData);
                const blob = new Blob([buffer], { type: 'application/octet-stream' });
                saveAs(blob, `Manga_AI_${pageId}.psd`);

                // Tắt cái toast loading đi
                toast.dismiss("psd");

                // 🚀 BÍ QUYẾT UX: Hiện thông báo thành công KÈM NÚT TẢI FONT
                // 🚀 BÍ QUYẾT UX: Hiện thông báo thành công KÈM NÚT TẢI FONT (Đã sửa Văn phong)
                toast.custom((t) => (
                  <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-panel border border-border shadow-2xl rounded-2xl pointer-events-auto flex flex-col overflow-hidden`}>
                    <div className="p-4 flex items-start gap-3">
                      <div className="text-3xl">🎉</div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-emerald-400">Đã tải file PSD thành công!</h3>
                        <p className="text-xs text-text-muted mt-1 leading-relaxed">
                          ⚠️ <strong className="text-amber-400">Lưu ý:</strong> Bạn có đang dùng các Font chữ do MangaAI cung cấp không? Nếu có, hãy tải bộ font dưới đây và cài vào máy để Photoshop không bị lỗi định dạng chữ nhé!
                        </p>
                      </div>
                    </div>
                    <div className="bg-background/50 border-t border-border px-4 py-3 flex gap-2 justify-end">
                      <button
                        onClick={() => toast.dismiss(t.id)}
                        className="px-4 py-1.5 text-xs font-bold text-text-muted hover:text-text-main cursor-pointer"
                      >
                        Bỏ qua
                      </button>
                      <button
                        onClick={() => {
                          toast.dismiss(t.id);
                          mangaApi.downloadFontPack(); // Tự động gọi API tải Font Pack
                        }}
                        className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-md cursor-pointer flex items-center gap-1.5"
                      >
                        📥 Tải Bộ Font MangaAI
                      </button>
                    </div>
                  </div>
                ), { duration: 15000 }); // Cho nó hiện lâu lâu 15 giây để user kịp đọc
              } catch (error: any) {
                toast.error(error.message, { id: "psd" });
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-all cursor-pointer text-sm shadow-sm"
          >
            🎨 Xuất PSD
          </button>
          {/* NÚT TẢI BỘ FONT CHO PHOTOSHOP */}
       
        <button 
          onClick={handleExportImage} 
          className="flex items-center gap-1.5 px-3 py-1.5 ml-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all cursor-pointer hover:scale-105"
          title="Lưu thành ảnh JPG có chữ"
        >
          <ImageDown size={16} />
          <span>Lưu Ảnh</span>
        </button>

      </div>
    </div>
  );
}