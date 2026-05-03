const API_URL = "http://localhost:8000/api";
const STATIC_URL = "http://localhost:8000/static";

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
    // ... (Giữ nguyên như cũ)
    const formData = new FormData();
    formData.append("file", file);
    formData.append("genre", config.genre);
    formData.append("tone", config.tone);
    formData.append("pronouns", config.pronoun);
    formData.append("glossary", config.glossary);

    const response = await fetch(`${API_URL}/translate-page`, {
      method: "POST",
      body: formData,
    });
    
    if (!response.ok) throw new Error("Server từ chối kết nối (Lỗi CORS hoặc 500)");
    const result = await response.json();
    
    return {
      cleanUrl: `${STATIC_URL}/Clean_${result.file_name}?t=${Date.now()}`,
      bubbles: result.data
    };
  },

  // 🚀 BỔ SUNG: Gọi API Xóa Nền
  eraseMask: async (filename: string, maskBase64: string) => {
    const response = await fetch(`${API_URL}/erase-mask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, mask_base64: maskBase64 }),
    });
    if (!response.ok) throw new Error("Lỗi Server AI");
    const data = await response.json();
    if (data.status !== "success") throw new Error(data.message);
    return `${STATIC_URL}/${data.new_filename}?t=${Date.now()}`;
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
  }
};