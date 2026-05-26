import { useState, useEffect } from 'react';

export const useDynamicLoadingText = (isProcessing: boolean) => {
  const [text, setText] = useState("Đang khởi động AI...");
  
  useEffect(() => {
    // Nếu không có lệnh xử lý nào, reset về câu gốc
    if (!isProcessing) {
      setText("Đang khởi động AI...");
      return;
    }

    const messages = [
      "🔍 Đang phân tích vùng chọn...",
      "🤖 Đang kết nối tới máy chủ AI...",
      "🧠 AI đang cật lực xử lý...",
      "🎨 Đang hoàn thiện nét vẽ...",
      "⏳ Chờ thêm một tẹo nữa thôi sếp nhé...",
      "🐌 Mạng hơi chậm, AI đang cố gắng hết sức..."
    ];
    
    let index = 0;
    // Cứ 2.5 giây đổi chữ một lần để mắt người dùng luôn được "bận rộn"
    const interval = setInterval(() => {
      index = Math.min(index + 1, messages.length - 1); // Dừng lại ở câu cuối
      setText(messages[index]);
    }, 2500);

    return () => clearInterval(interval);
  }, [isProcessing]);

  return text;
};