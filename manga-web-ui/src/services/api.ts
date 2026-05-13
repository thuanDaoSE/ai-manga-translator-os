const BASE_URL = import.meta.env.VITE_API_URL;
const API_URL = `${BASE_URL}/api`;
const STATIC_URL = `${BASE_URL}/static`;

export const mangaApi = {
  uploadRaw: async (file: File) => {
    // ... (Giữ nguyên như cũ)
    const formData = new FormData();
    formData.append("file", file);
    try {
      await fetch(`${API_URL}/upload-raw`, { method: "POST", body: formData });
      console.log(`Đã upload ngầm thành công: ${file.name}`);
    } catch (err) {
      console.error("Lỗi upload ngầm:", err);
    }
  },

  translatePage: async (file: File, config: any) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("genre", config.genre);
    formData.append("tone", config.tone);
    formData.append("pronouns", config.pronoun);
    formData.append("glossary", config.glossary);

    // BƯỚC 1: Gửi ảnh cho FastAPI để đưa vào hàng đợi Celery
    const response = await fetch(`${API_URL}/translate`, {
      // 🚀 Sửa API URL thành /translate
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Server từ chối kết nối!");
    const data = await response.json();

    if (data.status !== "queued") throw new Error("Lỗi không thể xếp hàng");
    const taskId = data.task_id;

    // BƯỚC 2: Vòng lặp liên tục hỏi thăm tiến độ (Polling) mỗi 1 giây
    while (true) {
      // Nghỉ 1 giây rồi mới hỏi tiếp để tránh spam Server
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const pollRes = await fetch(`${API_URL}/task/${taskId}`);
      const pollData = await pollRes.json();

      if (pollData.state === "SUCCESS") {
        // AI Xử lý xong! Trả kết quả về cho Topbar hiển thị
        return {
          cleanUrl: pollData.result.clean_url,
          bubbles: pollData.result.data, // 🚀 ĐÃ SỬA: Hứng dữ liệu tọa độ thật từ AI thay vì mảng rỗng
        };
      } else if (pollData.state === "FAILURE") {
        throw new Error("Lỗi khi AI xử lý ảnh!");
      } else if (pollData.state === "PROCESSING") {
        // In tiến độ ra Console để bạn xem (sau này ta sẽ gắn nó vào thanh UI)
        console.log(
          `[CELERY] Tiến độ: ${pollData.progress}% - ${pollData.message}`,
        );
      }
    }
  },

  // 🚀 ĐÃ SỬA: Nhận imageUrl thay vì filename
  eraseMask: async (imageUrl: string, maskBase64: string) => {
    const response = await fetch(`${API_URL}/erase-mask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, mask_base64: maskBase64 }),
    });
    if (!response.ok) throw new Error("Lỗi Server AI");
    const data = await response.json();
    if (data.status !== "success") throw new Error(data.message);
    return `${data.new_url}?t=${Date.now()}`; // 🚀 Backend sẽ trả về URL chuẩn
  },

  // 🚀 ĐÃ SỬA: Nhận imageUrl thay vì filename
  redrawMask: async (imageUrl: string, maskBase64: string, prompt: string) => {
    const response = await fetch(`${API_URL}/redraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, mask_base64: maskBase64, prompt }),
    });
    if (!response.ok) throw new Error("Lỗi Server Redraw AI");
    const data = await response.json();
    if (data.status !== "success") throw new Error(data.message);
    return `${data.new_url}?t=${Date.now()}`;
  },

  // 🚀 BỔ SUNG: Gọi API Quét Lens
  quickScan: async (payload: any) => {
    const response = await fetch(`${API_URL}/quick-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Lỗi Server AI");
    return await response.json();
  },
};
