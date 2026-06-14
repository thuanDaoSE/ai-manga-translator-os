import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useToolStore } from '../../store/useToolStore';
import { loadFont } from '../../utils/fontManager';

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
  // 🚀 BẢN VÁ 1: Theo dõi xem thẻ thoại nào đang được chọn ở kho tổng
  const activeBubbleId = useCanvasStore((state) => state.activeBubbleId);
  const activeMode = useToolStore((state) => state.activeMode);
  const showText = useToolStore((state) => state.showText);

  useEffect(() => {
    if (!containerRef.current || !wrapperRef.current) return;

    wrapperRef.current.innerHTML = '';
    const htmlCanvas = document.createElement('canvas');
    wrapperRef.current.appendChild(htmlCanvas);

    const initW = imgWidth > 0 ? imgWidth : containerRef.current.clientWidth;
    const initH = imgHeight > 0 ? imgHeight : containerRef.current.clientHeight;
    const canvas = new fabric.Canvas(htmlCanvas, {
      width: initW,
      height: initH,
      selection: false,
    });
    fabricCanvas.current = canvas;

    canvas.on('object:modified', (e) => {
      const target = e.target as any;
      if (!target || target.type === 'activeSelection') return;

      const rawAngle = target.angle || 0;
      const normalizedAngle = rawAngle % 360;

      // 🚀 MA THUẬT TOÁN HỌC: Đưa toạ độ Tâm về lại Góc trái trên!
      const newW = target.width * target.scaleX;
      const newH = target.height * target.scaleY;
      const newX = target.left - (newW / 2);
      const newY = target.top - (newH / 2);

      let newFontSize = target.fontSize || 16;
      if (target.scaleX && target.scaleX !== 1) {
        newFontSize = Math.max(8, Math.round(newFontSize * target.scaleX));
        target.set({
          fontSize: newFontSize,
          width: Math.round(target.width * target.scaleX),
          scaleX: 1,
          scaleY: 1
        });
        canvas.requestRenderAll();
      }

      useCanvasStore.getState().updateBubble(target.id, {
        x: Math.round(newX),
        y: Math.round(newY),
        w: Math.round(newW),
        h: Math.round(newH),
        rotation: Math.round(normalizedAngle),
        fontSize: newFontSize,
      });
    });

    canvas.on('text:changed', (e) => {
      if (e.target && (e.target as any).id && e.target instanceof fabric.Textbox) {
        useCanvasStore.getState().updateBubble((e.target as any).id, {
          text: e.target.text || ''
        });
      }
    });

    canvas.on('text:editing:entered', (e) => {
      if (e.target) {
        e.target.set('backgroundColor', 'rgba(244, 63, 94, 0.15)');
        canvas.requestRenderAll();
      }
    });

    canvas.on('text:editing:exited', (e) => {
      if (e.target) {
        e.target.set('backgroundColor', '');
        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:over', (e) => {
      if (e.target && (e.target as any).id) {
        useCanvasStore.getState().setHoveredBubble((e.target as any).id);
      }
    });

    canvas.on('mouse:down', (e) => {
      if (e.target && e.e) {
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

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
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
      // 🚀 TIÊU DIỆT TRIỆT ĐỂ BÓNG MA CANVAS
      if (fabricCanvas.current) {
        fabricCanvas.current.dispose();
        fabricCanvas.current = null;
      }
      if (wrapperRef.current) wrapperRef.current.innerHTML = '';
      useCanvasStore.getState().setHoveredBubble(null);
    };
  }, [imgWidth, imgHeight]);

  // ĐỒNG BỘ ZUSTAND SANG FABRIC
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    // 🚀 BẢN VÁ: VÒNG KHOÁ (BLOCKER) CHỜ LOAD FONT
    const loadFontsAndRender = async () => {
      // 1. Quét xem trên màn hình đang cần dùng những font gì
      const requiredFonts = [...new Set(bubbles.map(b => b.fontFamily.replace(/'/g, '')))];

      // 2. Chặn luồng render, ép tải xong toàn bộ font mới cho đi tiếp
      await Promise.all(requiredFonts.map(fontName => loadFont(fontName)));

      // 🚀 CHỐNG CRASH KHI CANVAS ĐÃ BỊ DISPOSE TRONG QUÁ TRÌNH CHỜ FONT
      if (!fabricCanvas.current || fabricCanvas.current !== canvas) return;

      // 3. FONT ĐÃ SẴN SÀNG -> TIẾN HÀNH VẼ CANVAS
      const existingIds = canvas.getObjects().map((obj: any) => obj.id);

      const updates: { id: string; data: { fontSize: number } }[] = [];

      bubbles.forEach((bubble) => {
        const safeText = bubble.text || "Nhập chữ...";
        const safeColor = bubble.fontColor || '#000000';

        // Lấy thông số Viền & Bóng từ Sidebar
        const currentOutlineColor = bubble.outlineColor || (safeColor.toLowerCase() === '#000000' ? '#ffffff' : '#000000');
        const currentOutlineWidth = bubble.outlineWidth !== undefined ? bubble.outlineWidth : useToolStore.getState().outlineWidth;
        const currentShadow = bubble.hasShadow ? new fabric.Shadow({
          color: 'rgba(0,0,0,0.6)', blur: 4, offsetX: 2, offsetY: 4
        }) : null;

        const defaultFontSize = bubble.fontSize || 20;
        let textObj: fabric.Textbox | undefined;

        // ==========================================
        // 🚀 BẢN VÁ UI KHÓA FABRIC: LOGIC TÍNH TOÁN MÀU SẮC
        // ==========================================
        const isLocked = bubble.isLocked || false;
        const dynamicBorderColor = isLocked ? '#f59e0b' : '#6366f1';        // Khung Cam
        const dynamicCornerColor = isLocked ? '#f59e0b' : '#ffffff';        // Chấm Cam
        const dynamicCornerStrokeColor = isLocked ? '#b45309' : '#6366f1';
        
        // Khi không chọn: Phủ lớp nền vàng siêu nhạt để dễ nhận diện từ xa
        const dynamicBgColor = isLocked ? 'rgba(245, 158, 11, 0.2)' : '';
        
        // Khi click chọn: Đổi nền khung bounding box thành vàng cam nhạt
        const dynamicSelectionBg = isLocked ? 'rgba(245, 158, 11, 0.15)' : '';

        if (!existingIds.includes(bubble.id)) {
          textObj = new fabric.Textbox(safeText, {
            left: bubble.x + (bubble.w / 2),
            top: bubble.y + (bubble.h / 2),
            width: bubble.w,
            angle: bubble.rotation || 0,
            fontFamily: bubble.fontFamily.replace(/'/g, ''),
            fontSize: defaultFontSize,
            originX: 'center',
            originY: 'center',
            fill: safeColor,
            stroke: currentOutlineColor,
            strokeWidth: currentOutlineWidth,
            shadow: currentShadow as any,
            paintFirst: 'stroke',
            strokeLineJoin: 'round',
            textAlign: bubble.textAlign || 'center',
            snapAngle: 45,
            snapThreshold: 5,
            transparentCorners: false,
            
            // 🚀 ÁP DỤNG GIAO DIỆN VÀ KHÓA VÀO FABRIC Ở ĐÂY
            backgroundColor: dynamicBgColor,
            selectionBackgroundColor: dynamicSelectionBg,
            cornerColor: dynamicCornerColor,
            cornerStrokeColor: dynamicCornerStrokeColor,
            borderColor: dynamicBorderColor,
            editingBorderColor: isLocked ? '#f59e0b' : '#f43f5e',
            cursorColor: isLocked ? '#f59e0b' : '#f43f5e',
            
            // Khóa cứng thao tác di chuyển, xoay, scale
            lockMovementX: isLocked,
            lockMovementY: isLocked,
            lockRotation: isLocked,
            lockScalingX: isLocked,
            lockScalingY: isLocked,
            editable: !isLocked,    // Chặn click đúp sửa chữ
            hasControls: !isLocked, // TUYỆT CHIÊU: Giấu 8 ô vuông và cây xoay khi bị khóa!
            
            cornerSize: 16,
            touchCornerSize: 36,
            padding: 16,
            cornerStyle: 'circle',
            cursorWidth: 3,
            cursorDuration: 500,
          });

          textObj.setControlsVisibility({ mt: false, mb: false, ml: true, mr: true });

          if (textObj.controls && textObj.controls.mtr) {
            textObj.controls.mtr.y = 0.5;
            textObj.controls.mtr.offsetY = 60;
            textObj.controls.mtr.render = function (ctx, left, top, styleOverride, fabricObject) {
              const size = 26;
              ctx.save();
              ctx.translate(left, top);
              ctx.beginPath();
              ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = '#6366f1';
              ctx.stroke();
              if (typeof rotateImg !== 'undefined') {
                ctx.drawImage(rotateImg, -8, -8, 16, 16);
              }
              ctx.restore();
            };
          }

          (textObj as any).id = bubble.id;
          canvas.add(textObj);

          if (bubble.text === "Gõ chữ vào đây..." || bubble.text === "Nhập chữ...") {
            canvas.setActiveObject(textObj);
            try {
              textObj.enterEditing();
              textObj.selectAll();
            } catch (err) {
              console.warn("Failed to enter editing:", err);
            }
          }
        } else {
          textObj = canvas.getObjects().find((obj: any) => obj.id === bubble.id) as fabric.Textbox;
          if (textObj && !textObj.isEditing) {
            textObj.set({
              text: safeText,
              fontFamily: bubble.fontFamily.replace(/'/g, ''),
              fill: safeColor,
              stroke: currentOutlineColor,
              strokeWidth: currentOutlineWidth,
              shadow: currentShadow as any,
              paintFirst: 'stroke',
              fontSize: defaultFontSize,
              left: bubble.x + (bubble.w / 2),
              top: bubble.y + (bubble.h / 2),
              width: bubble.w,
              angle: bubble.rotation || 0,
              originX: 'center',
              originY: 'center',
              textAlign: bubble.textAlign || 'center',
              
              // 🚀 CẬP NHẬT TRẠNG THÁI KHÓA LÊN OBJECT ĐÃ TỒN TẠI (KHI SẾP BẤM NÚT MỞ/KHÓA TRÊN THANH NỔI)
              backgroundColor: dynamicBgColor,
              selectionBackgroundColor: dynamicSelectionBg,
              cornerColor: dynamicCornerColor,
              cornerStrokeColor: dynamicCornerStrokeColor,
              borderColor: dynamicBorderColor,
              editingBorderColor: isLocked ? '#f59e0b' : '#f43f5e',
              lockMovementX: isLocked,
              lockMovementY: isLocked,
              lockRotation: isLocked,
              lockScalingX: isLocked,
              lockScalingY: isLocked,
              editable: !isLocked,
              hasControls: !isLocked,
            });
            textObj.setControlsVisibility({ mt: false, mb: false, ml: true, mr: true });
          }
        }

        // ================================================================
        // 🚀 SMART AUTO-FIT (CHỐNG TRÀN CHỮ) CỦA SẾP GIỮ NGUYÊN...
        // ================================================================
        if (textObj && !textObj.isEditing) {
          textObj.initDimensions();
          let fs = defaultFontSize;

          if (textObj.height > bubble.h) {
            let low = 8;
            let high = defaultFontSize;
            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              textObj.set({ fontSize: mid });
              textObj.initDimensions();
              if (textObj.height <= bubble.h) {
                fs = mid;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }
            textObj.set({ fontSize: fs });
            textObj.initDimensions();

            if (bubble.fontSize !== fs) {
              updates.push({ id: bubble.id, data: { fontSize: fs } });
            }
          }
        }
      });

      const currentStoreIds = bubbles.map((b) => b.id);
      canvas.getObjects().forEach((obj: any) => {
        if (obj.id && !currentStoreIds.includes(obj.id)) {
          canvas.remove(obj);
        }
      });

      canvas.renderAll();

      if (updates.length > 0) {
        setTimeout(() => {
          if (!fabricCanvas.current || fabricCanvas.current !== canvas) return;
          useCanvasStore.getState().updateBubbles(updates, true);
        }, 0);
      }
    }; // Kết thúc hàm loadFontsAndRender

    // 🚀 GỌI HÀM KHI CHẠY USEEFFECT
    loadFontsAndRender();
  }, [bubbles, imgWidth, imgHeight]);

  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;
    const isInteractive = activeMode === 'none' && showText;
    canvas.getObjects().forEach((obj) => {
      obj.selectable = isInteractive;
      obj.evented = isInteractive;
    });
    if (!isInteractive) canvas.discardActiveObject();
    canvas.renderAll();
  }, [activeMode, showText, bubbles]);

  // 🚀 BẢN VÁ 2: ĐỒNG BỘ NGƯỢC (TỪ SIDEBAR XUỐNG CANVAS)
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    if (activeBubbleId) {
      // Tìm xem cục chữ nào trên hình mang cái ID đang được chọn
      const targetObj = canvas.getObjects().find((obj: any) => obj.id === activeBubbleId);

      // Nếu tìm thấy, và nó chưa được chọn -> Ép Fabric.js phải chọn (hiện khung xanh)
      if (targetObj && canvas.getActiveObject() !== targetObj) {
        canvas.setActiveObject(targetObj);
        canvas.requestRenderAll();
      }
    } else {
      // Nếu bấm ra ngoài (hủy chọn), báo Fabric.js cất khung xanh đi
      if (canvas.getActiveObject()) {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    }
  }, [activeBubbleId]); // Lắng nghe mỗi khi sếp bấm chọn ở Sidebar


  return (
    <div ref={containerRef} className="absolute inset-0 z-40 pointer-events-none">
      <div ref={wrapperRef} className={`w-full h-full ${(activeMode === 'none' && showText) ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      </div>
    </div>
  );
}