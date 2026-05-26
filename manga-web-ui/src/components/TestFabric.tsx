import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric'; 
import { useDynamicFont, calculateAutoFitText, MANGA_FONTS } from '../utils/typography';

export default function TestFabric() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const font = MANGA_FONTS[0];
  const { isLoaded, error } = useDynamicFont(font.name, font.url);

  useEffect(() => {
    if (!isLoaded || !canvasRef.current) return;

    // 1. Khởi tạo Fabric Canvas với nền xám đậm
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#555555' 
    });

    const longText = "Chết tiệt! Sức mạnh của hắn đang tăng lên một cách chóng mặt! Mình phải dùng tuyệt chiêu cuối cùng thôi!!!";
    const boxWidth = 200;
    const boxHeight = 150;

    // 2. Tính toán Auto-Fit
    const ctx = canvas.getContext();
    const { optimalSize, wrappedText } = calculateAutoFitText(ctx, {
      text: longText,
      fontFamily: font.name,
      maxWidth: boxWidth,
      maxHeight: boxHeight,
      minSize: 12,
      maxSize: 40
    });

    // 3. Vẽ chữ thẳng lên Canvas (không thèm đợi ảnh ngoài nữa)
    const mangaText = new fabric.Textbox(wrappedText, {
      left: 300,
      top: 200,
      width: boxWidth,
      fontFamily: font.name,
      fontSize: optimalSize, 
      fill: "#000000",       
      stroke: "#FFFFFF",     
      strokeWidth: 8,        
      paintFirst: "stroke",  
      strokeLineJoin: "round", 
      textAlign: "center",
      splitByGrapheme: true,
    });

    canvas.add(mangaText);
    canvas.renderAll();

    return () => { canvas.dispose(); };
  }, [isLoaded]);

  if (error) return <div className="text-white p-10">Lỗi tải font: {error.message}</div>;
  if (!isLoaded) return <div className="text-white p-10">Đang tải Font Việt Hóa siêu nét...</div>;

  return (
    <div className="p-10 flex flex-col items-center">
      <h2 className="text-white mb-4 text-xl font-bold">TEST SPRINT 1: FABRIC.JS & AUTO-FIT</h2>
      <div className="border-4 border-primary rounded-lg overflow-hidden shadow-2xl bg-white">
        <canvas ref={canvasRef} />
      </div>
      <p className="text-text-muted mt-4">
        Hãy click đúp vào đoạn chữ để chỉnh sửa, kéo các góc để xem viền chữ trắng không bao giờ lẹm vào chữ đen!
      </p>
    </div>
  );
}