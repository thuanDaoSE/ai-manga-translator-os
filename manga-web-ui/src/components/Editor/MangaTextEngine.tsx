import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import { calculateAutoFitText } from '../../utils/typography';

// 🚀 BÍ QUYẾT 1: Nạp sẵn Logo Xoay vào bộ nhớ (Mô phỏng icon RotateCw của sếp)
const ROTATE_ICON_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'/%3E%3Cpath d='M21 3v5h-5'/%3E%3C/svg%3E";
const rotateImg = new Image();
rotateImg.src = ROTATE_ICON_SVG;

interface MangaTextEngineProps {
  imgWidth: number;
  imgHeight: number;
}

export default function MangaTextEngine({ imgWidth, imgHeight }: MangaTextEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null); 
  const fabricCanvas = useRef<fabric.Canvas | null>(null);
  
  const bubbles = useCanvasStore((state) => state.bubbles);
  const { activeMode } = useToolStore();

  useEffect(() => {
    if (!containerRef.current || !wrapperRef.current) return;

    wrapperRef.current.innerHTML = '';
    const htmlCanvas = document.createElement('canvas');
    wrapperRef.current.appendChild(htmlCanvas);

    // 🚀 FIX: Dùng kích thước pixel thật của ảnh (1:1) thay vì CSS clientWidth
    const initW = imgWidth > 0 ? imgWidth : containerRef.current.clientWidth;
    const initH = imgHeight > 0 ? imgHeight : containerRef.current.clientHeight;
    const canvas = new fabric.Canvas(htmlCanvas, {
      width: initW,
      height: initH,
      selection: false, 
    });
    fabricCanvas.current = canvas;

    canvas.on('object:modified', (e) => {
      if (e.target && (e.target as any).id) {
        const target = e.target as fabric.Textbox;
        const rawAngle = target.angle || 0;
        const normalizedAngle = rawAngle % 360;

        // 🚀 THUẬT TOÁN ĐỒ HỌA: Chuyển đổi độ Scale thành Cỡ chữ (Font Size) thực tế
        let newFontSize = target.fontSize || 16;
        if (target.scaleX && target.scaleX !== 1) {
          // Lấy cỡ chữ nhân với độ giãn
          newFontSize = Math.max(8, Math.round(newFontSize * target.scaleX)); 
          
          // Reset scale về 1 và gán cỡ chữ to lên để chữ không bị méo
          target.set({
            fontSize: newFontSize,
            width: Math.round(target.width! * target.scaleX),
            scaleX: 1,
            scaleY: 1
          });
          canvas.requestRenderAll();
        }

        // Cập nhật lên Store để Điệp viên gửi về Server
        useCanvasStore.getState().updateBubble((target as any).id, {
          x: Math.round(target.left || 0),
          y: Math.round(target.top || 0),
          w: Math.round(target.width || 0),
          h: Math.round(target.height || 0),
          rotation: Math.round(normalizedAngle),
          fontSize: newFontSize, // 🚀 BẢN VÁ: Đã lưu cỡ chữ khi kéo giãn!
        });
      }
    });

    canvas.on('text:changed', (e) => {
      if (e.target && (e.target as any).id && e.target instanceof fabric.Textbox) {
        useCanvasStore.getState().updateBubble((e.target as any).id, {
          text: e.target.text || ''
        });
      }
    });

    // ... code cũ ở trên
    canvas.on('text:changed', (e) => {
      if (e.target && (e.target as any).id && e.target instanceof fabric.Textbox) {
        useCanvasStore.getState().updateBubble((e.target as any).id, {
          text: e.target.text || ''
        });
      }
    });

    // 🚀 BẢN VÁ UX 1: LÀM SÁNG Ô CHỮ KHI BẮT ĐẦU GÕ (EDITING)
    canvas.on('text:editing:entered', (e) => {
      if (e.target) {
        e.target.set('backgroundColor', 'rgba(244, 63, 94, 0.15)'); // Phủ lớp nền đỏ hồng mờ (Rose 500)
        canvas.requestRenderAll();
      }
    });

    // 🚀 BẢN VÁ UX 2: TẮT NỀN SÁNG KHI GÕ XONG (THOÁT EDITING)
    canvas.on('text:editing:exited', (e) => {
      if (e.target) {
        e.target.set('backgroundColor', ''); // Trả về trong suốt
        canvas.requestRenderAll();
      }
    });


    canvas.on('mouse:over', (e) => {
      if (e.target && (e.target as any).id) {
        useCanvasStore.getState().setHoveredBubble((e.target as any).id);
      }
      
    });

    // 🚀 BẢN VÁ UX 4: LỆNH BÀI MIỄN TỬ - CHỐNG RÒ RỈ SỰ KIÊN XUỐNG NỀN
    canvas.on('mouse:down', (e) => {
      // Nếu cú click chuột chạm vào một ô chữ hoặc cục kéo giãn (target tồn tại)
      if (e.target && e.e) {
        // NUỐT TRỌN sự kiện chuột, tuyệt đối không cho rò rỉ xuống Workspace.tsx
        e.e.stopPropagation();
      }
    });


    canvas.on('mouse:out', () => {
      useCanvasStore.getState().setHoveredBubble(null);
    });

    const handleSelection = (e: any) => {
      if (e.selected && e.selected.length > 0) {
        useCanvasStore.getState().setActiveBubble(e.selected[0].id);
      }
    };
    canvas.on('selection:created', handleSelection);
    canvas.on('selection:updated', handleSelection);
    canvas.on('selection:cleared', () => {
      useCanvasStore.getState().setActiveBubble(null);
    });

    // 🚀 FIX: Chỉ resize theo CSS nếu chưa có kích thước ảnh thật
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // Nếu đã có kích thước ảnh thật, ưu tiên dùng nó
        const w = imgWidth > 0 ? imgWidth : entry.contentRect.width;
        const h = imgHeight > 0 ? imgHeight : entry.contentRect.height;
        if (w > 0 && h > 0) {
          canvas.setDimensions({ width: w, height: h });
          canvas.renderAll();
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      canvas.dispose();
      if (wrapperRef.current) wrapperRef.current.innerHTML = ''; 
      useCanvasStore.getState().setHoveredBubble(null);
    };
  }, [imgWidth, imgHeight]);

  // ĐỒNG BỘ ZUSTAND SANG FABRIC
  // ĐỒNG BỘ ZUSTAND SANG FABRIC
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const existingIds = canvas.getObjects().map((obj: any) => obj.id);
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;

    bubbles.forEach((bubble) => {
      const safeText = bubble.text || "Nhập chữ..."; 
      
      // 🚀 BẢN VÁ UX: ĐẶT BIẾN MÀU AN TOÀN ĐỂ KHÔNG BAO GIỜ MẤT VIỀN
      const safeColor = bubble.fontColor || '#000000';
      const safeStroke = safeColor.toLowerCase() === '#000000' ? '#ffffff' : '#000000';

      if (!existingIds.includes(bubble.id)) {
        // 🚀 BẢN VÁ 1: Bỏ hàm ép chữ nhỏ, đặt mặc định chữ to, rõ ràng (28px)
        const defaultFontSize = bubble.fontSize || 28;

        const textObj = new fabric.Textbox(safeText, { 
          // 🚀 1. TÍNH TOÁN ĐIỂM GIỮA CỦA KHUNG XANH LÁ (Tọa độ tuyệt đối)
          left: bubble.x + (bubble.w / 2),
          top: bubble.y + (bubble.h / 2),
          width: bubble.w, 
          angle: bubble.rotation || 0,
          fontFamily: bubble.fontFamily.replace(/'/g, ''),
          fontSize: defaultFontSize,
          
          // 🚀 2. DỜI ĐIỂM NEO CỦA KHUNG ĐỎ VÀO CHÍNH GIỮA (Origin Point)
          originX: 'center',
          originY: 'center',
          
          // Các cấu hình cũ giữ nguyên
          fill: safeColor,
          stroke: safeStroke,
          strokeWidth: Math.max(3, Math.round(defaultFontSize * 0.15)), 
          paintFirst: 'stroke',     
          strokeLineJoin: 'round',
          textAlign: 'center',

          // Vẫn giữ lại Nền Đỏ để soi cho dễ
          backgroundColor: 'rgba(255, 0, 0, 0.4)', 

          snapAngle: 45,       
          snapThreshold: 5,    
          transparentCorners: false,
          cornerColor: '#ffffff',
          cornerStrokeColor: '#6366f1',
          borderColor: '#6366f1',
          
          // 🚀 BẢN VÁ UX: BƠM TO VÙNG BẮT CHUỘT
          cornerSize: 16,        // Chấm tròn hiển thị to hơn một chút
          touchCornerSize: 36,   // 🟢 VÙNG BẤM TÀNG HÌNH KHỔNG LỒ (Chặn mọi cú click trượt)
          padding: 16,           // 🟢 Tăng đệm an toàn bao quanh chữ để không bị lọt click xuống nền
          cornerStyle: 'circle', // Dùng chấm tròn chuẩn Figma// Dùng chấm tròn

          editingBorderColor: '#f43f5e', 
          cursorColor: '#f43f5e',        
          cursorWidth: 3,                
          cursorDuration: 500,     
                
        });

        // 🚀 BẢN VÁ 3: KHÓA KÉO CẠNH (Tắt trên, dưới, trái, phải) - BẮT BUỘC RA MŨI TÊN CHÉO!
        // 🚀 BẢN VÁ UX: PHỤC HỒI KÉO NGANG ĐỂ ÉP XUỐNG DÒNG (WRAP TEXT)
        textObj.setControlsVisibility({
          mt: false, // Khóa cạnh trên (Vô tác dụng vì Textbox tự chỉnh chiều cao)
          mb: false, // Khóa cạnh dưới 
          ml: true,  // 🟢 MỞ LẠI KÉO TRÁI
          mr: true,  // 🟢 MỞ LẠI KÉO PHẢI
        });

        

        // 🚀 BÍ QUYẾT 2: ĐÚC LẠI NÚT XOAY Y HỆT BẢN CŨ CỦA SẾP
        if (textObj.controls && textObj.controls.mtr) {
          textObj.controls.mtr.y = 0.5; // Dời nút xoay xuống cạnh đáy
          textObj.controls.mtr.offsetY = 60; // Kéo dài nó xuống 60px để không bao giờ chạm vào thanh Float
          
          // Ghi đè hàm vẽ mặc định của Fabric bằng nét vẽ tùy chỉnh
          textObj.controls.mtr.render = function(ctx, left, top, styleOverride, fabricObject) {
            const size = 26; // Độ to của hình tròn (Giống cũ)
            ctx.save();
            ctx.translate(left, top);
            
            // 1. Vẽ nền trắng, viền tím mượt mà
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#6366f1';
            ctx.stroke();
            
            // 2. In cái Logo xoay (SVG) vào giữa hồng tâm
            ctx.drawImage(rotateImg, -8, -8, 16, 16);
            ctx.restore();
          };
        }
        
        (textObj as any).id = bubble.id;
        canvas.add(textObj);
        if (bubble.text === "Gõ chữ vào đây..." || bubble.text === "Nhập chữ...") {
          canvas.setActiveObject(textObj); // Chọn ô chữ
          textObj.enterEditing();          // Mở khóa nhấp nháy con trỏ
          textObj.selectAll();             // Bôi đen toàn bộ
          canvas.requestRenderAll();       // Cập nhật giao diện
        }
      } else {
         const existingObj = canvas.getObjects().find((obj: any) => obj.id === bubble.id) as fabric.Textbox;
         if (existingObj && !existingObj.isEditing) {
            const defaultFontSize = bubble.fontSize || 28; 
            
            existingObj.set({
              text: safeText,
              fontFamily: bubble.fontFamily.replace(/'/g, ''),
              fill: safeColor,
              stroke: safeStroke,
              strokeWidth: Math.max(3, Math.round(defaultFontSize * 0.15)),
              paintFirst: 'stroke',
              fontSize: defaultFontSize,

              // 🚀 ÉP LẠI TÂM CHO CHỮ ĐÃ CÓ SẴN
              left: bubble.x + (bubble.w / 2),
              top: bubble.y + (bubble.h / 2),
              originX: 'center',
              originY: 'center',

              cornerSize: 16,        
              touchCornerSize: 36,   
              padding: 16,           
              cornerStyle: 'circle',
              backgroundColor: 'rgba(255, 0, 0, 0.4)',
            });
            existingObj.setControlsVisibility({
              mt: false, 
              mb: false, 
              ml: true,  
              mr: true,  
            });
            canvas.requestRenderAll();
         }
      }
    }); // Kết thúc bubbles.forEach

    const currentStoreIds = bubbles.map((b) => b.id);
    canvas.getObjects().forEach((obj: any) => {
      if (obj.id && !currentStoreIds.includes(obj.id)) {
        canvas.remove(obj);
      }
    });

    canvas.renderAll();
  }, [bubbles]);

  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;
    const isInteractive = activeMode === 'none';
    canvas.getObjects().forEach((obj) => {
      obj.selectable = isInteractive;
      obj.evented = isInteractive;
    });
    if (!isInteractive) canvas.discardActiveObject();
    canvas.renderAll();
  }, [activeMode]);


  return (
    <div ref={containerRef} className="absolute inset-0 z-40 pointer-events-none">
      <div ref={wrapperRef} className={`w-full h-full ${activeMode === 'none' ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      </div>
    </div>
  );
}