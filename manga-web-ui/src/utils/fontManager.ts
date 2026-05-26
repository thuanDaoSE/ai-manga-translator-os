// File: src/utils/fontManager.ts

const DB_NAME = 'MangaTranslatorDB';
const STORE_NAME = 'CustomFonts';

// Khởi tạo IndexedDB (Ổ cứng ảo của Trình duyệt)
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Bơm Font thẳng vào DOM để Fabric.js và CSS nhận diện được ngay lập tức
export const injectFontToDOM = async (fontName: string, buffer: ArrayBuffer) => {
  try {
    const font = new FontFace(fontName, buffer);
    const loadedFont = await font.load();
    document.fonts.add(loadedFont);
    return true;
  } catch (e) {
    console.error(`Lỗi nhúng font ${fontName}:`, e);
    return false;
  }
};

// Hàm xử lý khi User bấm tải file .ttf / .otf lên
export const saveFontToBrowser = async (file: File): Promise<string> => {
  const db = await initDB();
  const arrayBuffer = await file.arrayBuffer();
  
  // Lấy tên file bỏ đuôi, xóa dấu cách để làm tên Font chuẩn
  const fontName = file.name.replace(/\.[^/.]+$/, "").replace(/\s+/g, '_');

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ name: fontName, data: arrayBuffer });

    request.onsuccess = async () => {
        await injectFontToDOM(fontName, arrayBuffer);
        resolve(fontName);
    };
    request.onerror = () => reject(request.error);
  });
};

// Gọi hàm này lúc mới mở Web để Load lại toàn bộ font cũ của User
export const loadAllSavedFonts = async (): Promise<string[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = async () => {
      const fonts = request.result;
      const loadedNames: string[] = [];
      for (const f of fonts) {
        await injectFontToDOM(f.name, f.data);
        loadedNames.push(f.name);
      }
      resolve(loadedNames);
    };
    request.onerror = () => reject(request.error);
  });
};