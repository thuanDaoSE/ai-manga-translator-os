// ========================================================
// 🚀 QUẢN LÝ FONT CẤP ĐỘ DOANH NGHIỆP (SELF-HOSTED WOFF2)
// Chống lỗi đứt cáp quang và CORS Tainted Canvas
// ========================================================

export const MANGA_FONTS = {
  dialogue: [
    { name: 'Playpen Sans', url: '/fonts/PlaypenSans-Regular.woff2' },
    { name: 'Itim', url: '/fonts/Itim-Regular.woff2' },
    { name: 'Be Vietnam Pro', url: '/fonts/BeVietnamPro-Regular.woff2' }
  ],
  thought: [
    { name: 'Patrick Hand', url: '/fonts/PatrickHand-Regular.woff2' },
    { name: 'Playwrite VN', url: '/fonts/PlaywriteVN-Regular.woff2' },
    { name: 'Caveat', url: '/fonts/Caveat-Regular.woff2' }
  ],
  shouting: [
    { name: 'Bangers', url: '/fonts/Bangers-Regular.woff2' },
    { name: 'Bungee', url: '/fonts/Bungee-Regular.woff2' },
    { name: 'Sedgwick Ave Display', url: '/fonts/SedgwickAveDisplay-Regular.woff2' }
  ],
  sfx: []
};

// Bộ nhớ đệm giữ các font đã load để không phải load lại
const loadedFonts = new Set<string>();

export const loadFont = async (fontFamily: string): Promise<boolean> => {
  // Nếu đã load rồi thì bỏ qua ngay lập tức (Tối ưu tốc độ)
  if (loadedFonts.has(fontFamily)) return true;

  // Truy tìm URL của font trong ma trận
  let fontUrl = '';
  for (const group of Object.values(MANGA_FONTS)) {
    const found = group.find(f => f.name === fontFamily);
    if (found) fontUrl = found.url;
  }

  // Nếu là font mặc định của hệ thống (Arial...) thì không cần load
  if (!fontUrl) return true;

  try {
    // 🚀 MA THUẬT: Dùng CSS Font Loading API bản Native
    const font = new FontFace(fontFamily, `url(${fontUrl})`);

    // BẮT BUỘC CHỜ TRÌNH DUYỆT GIẢI MÃ XONG FILE BINARY
    await font.load();

    // Bơm font vào bộ nhớ hệ thống
    document.fonts.add(font);
    loadedFonts.add(fontFamily);

    console.log(`[Font Manager] Tải thành công siêu tốc: ${fontFamily}`);
    return true;
  } catch (error) {
    console.error(`[Font Manager] Lỗi tải font ${fontFamily}:`, error);
    return false;
  }
};