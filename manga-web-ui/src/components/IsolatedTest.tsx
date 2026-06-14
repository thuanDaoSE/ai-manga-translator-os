import React, { useState, useRef } from 'react';
import { mangaApi } from '../services/api'; 
import { supabase } from '../services/supabaseClient';

interface Bubble {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export default function IsolatedTest() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImageUrl(URL.createObjectURL(file));
      setBubbles([]); 
      setStatusText("");
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImgSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
  };

  const handleTranslate = async () => {
    if (!selectedFile) return alert("Vui lòng chọn ảnh trước!");
    
    setIsLoading(true);
    setBubbles([]);

    try {
      // 🚀 LẤY TOKEN MỚI TINH TỪ SUPABASE
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sếp chưa đăng nhập! Vui lòng F5 trang và đăng nhập ở app chính trước.");

      // 🚀 BƯỚC 1: TẠO PROJECT THẬT
      setStatusText("1/4. Đang tạo dự án Test trong Database...");
      const proj = await mangaApi.createProject("Isolated Test Project");

      // 🚀 BƯỚC 2: UPLOAD ẢNH BẰNG HÀM XỊN CỦA APP
      setStatusText("2/4. Đang tải ảnh lên Backend...");
      const uploadRes = await mangaApi.uploadProjectFile(proj.id, selectedFile);
      const pageId = uploadRes.page_id;

      // 🚀 BƯỚC 3: GỌI LỆNH DỊCH
      setStatusText("3/4. Đang đưa ảnh cho AI...");
      const transRes = await fetch(`http://127.0.0.1:8000/api/pages/${pageId}/translate`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({
          genre: "Truyện tranh", tone: "Tự nhiên", pronouns: "Linh hoạt", glossary: ""
        })
      });
      if (!transRes.ok) throw new Error("Lỗi gọi API Dịch!");
      const transData = await transRes.json();
      const taskId = transData.task_id;

      // 🚀 BƯỚC 4: LẮNG NGHE KẾT QUẢ CELERY
      setStatusText("4/4. Đang chờ AI nấu món... (Vui lòng đợi)");
      let resultData = null;
      for (let i = 0; i < 120; i++) {
        const taskRes = await fetch(`http://127.0.0.1:8000/api/task/${taskId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const taskData = await taskRes.json();
        
        if (taskData.status === "SUCCESS") {
          resultData = taskData.result;
          break;
        } else if (taskData.status === "FAILURE") {
          throw new Error("AI báo lỗi Dịch!");
        }
        
        await new Promise(r => setTimeout(r, 1000));
      }

      // 🚀 XỬ LÝ VÀ CHÈN CHỮ LÊN MÀN HÌNH
      if (resultData && resultData.data) {
        setStatusText("✅ Hoàn tất! Đang dán chữ lên ảnh...");
        
        const newBubbles = resultData.data.map((item: any, index: number) => {
          const origW = item.box_coordinates.x2 - item.box_coordinates.x1;
          const origH = item.box_coordinates.y2 - item.box_coordinates.y1;
          
          const centerX = item.box_coordinates.x1 + (origW / 2);
          const centerY = item.box_coordinates.y1 + (origH / 2);
          const newSize = Math.max(origW, origH) * 1.2;

          return {
            id: `bubble-${index}`,
            x: centerX - (newSize / 2),
            y: centerY - (newSize / 2),
            w: newSize,
            h: newSize,
            text: item.vietnamese || "Lỗi dịch",
          };
        });

        setBubbles(newBubbles);
      } else {
        setStatusText("❌ Lỗi: Chờ quá lâu hoặc không có dữ liệu!");
      }
    } catch (error: any) {
      console.error(error);
      setStatusText("❌ Bị lỗi: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#121212', color: 'white', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '15px', background: '#222', zIndex: 100, display: 'flex', gap: '15px', alignItems: 'center' }}>
        <input type="file" accept="image/*" onChange={handleFileChange} />
        <button 
          onClick={handleTranslate} 
          disabled={isLoading || !selectedFile}
          style={{ padding: '8px 16px', background: isLoading ? '#555' : '#4caf50', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px' }}
        >
          {isLoading ? "⏳ Đang chạy..." : "⚡ Dịch Test"}
        </button>
        <span style={{ fontSize: '14px', color: '#ffeb3b', fontWeight: 'bold' }}>{statusText}</span>
      </div>

      <div style={{ width: '100%', height: '100%', overflow: 'auto', paddingTop: '70px', paddingBottom: '50px', display: 'flex', justifyContent: 'center' }}>
        <div ref={containerRef} style={{ position: 'relative', width: imgSize.w > 0 ? imgSize.w : 'auto', height: imgSize.h > 0 ? imgSize.h : 'auto', border: imageUrl ? '2px solid #444' : 'none', boxShadow: '0 0 20px rgba(0,0,0,0.8)' }}>
          {imageUrl && <img src={imageUrl} onLoad={handleImageLoad} alt="Test Manga" style={{ display: 'block', pointerEvents: 'none' }} className="ph-no-capture" />}
          {bubbles.map((b) => (
            <div key={b.id} style={{ position: 'absolute', left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, border: '2px solid #00ff00', background: 'rgba(0, 255, 0, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '100%', textAlign: 'center', fontSize: '18px', fontFamily: 'sans-serif', fontWeight: 'bold', color: 'black', textShadow: '2px 2px 0 #fff, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff' }}>
                {b.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}