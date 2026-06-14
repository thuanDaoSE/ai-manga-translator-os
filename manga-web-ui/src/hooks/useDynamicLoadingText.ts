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
      "⚡ Đang gọi GPU (Lần đầu có thể mất 1-2 phút do khởi động lạnh)...",
      "📦 Đang nạp mô hình AI lên VRAM...",
      "🤖 Kết nối thành công! AI đang xử lý...",
      "🎨 Đang hoàn thiện các nét vẽ & screentones...",
      "⏳ Chờ thêm một tẹo nữa thôi sếp nhé...",
      "🐌 Mạng hoặc GPU đang bận, AI vẫn đang cố hết sức..."
    ];
    
    // Đặt text đầu tiên ngay lập tức thay vì đợi 2.5s
    setText(messages[0]);
    
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