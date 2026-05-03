import { create } from 'zustand';

interface ConfigState {
  // Trạng thái bật/tắt Popup
  isModalOpen: boolean;
  setModalOpen: (isOpen: boolean) => void;

  // Dữ liệu cấu hình
  genre: string;
  customGenre: string;
  tone: string;
  customTone: string;
  pronoun: string;
  customPronoun: string;
  glossary: string;

  // Các hàm cập nhật
  setConfig: (field: string, value: string) => void;
  loadFromLocal: () => void;
  saveToLocal: () => void;
  importFromFile: (content: string, isJson: boolean) => void;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  isModalOpen: false,
  setModalOpen: (isOpen) => set({ isModalOpen: isOpen }),

  genre: 'Shounen (Hành động, nhiệt huyết)',
  customGenre: '',
  tone: 'Tự nhiên, đời thường, ngôn ngữ mạng',
  customTone: '',
  pronoun: 'Tôi - Cậu (Bạn bè ngang hàng)',
  customPronoun: '',
  glossary: '',

  setConfig: (field, value) => set({ [field]: value }),

  loadFromLocal: () => {
    const saved = localStorage.getItem('manga_trans_settings');
    if (saved) {
      set({ ...JSON.parse(saved) });
    }
  },

  saveToLocal: () => {
    const state = get();
    const dataToSave = {
      genre: state.genre, customGenre: state.customGenre,
      tone: state.tone, customTone: state.customTone,
      pronoun: state.pronoun, customPronoun: state.customPronoun,
      glossary: state.glossary
    };
    localStorage.setItem('manga_trans_settings', JSON.stringify(dataToSave));
    set({ isModalOpen: false }); // Đóng modal sau khi lưu
  },

  importFromFile: (content, isJson) => {
    if (isJson) {
      try {
        const config = JSON.parse(content);
        set({ ...config });
      } catch (err) {
        alert("File JSON không hợp lệ!");
      }
    } else {
      // Nếu là file txt, nối thêm vào glossary hiện tại
      const currentGlossary = get().glossary;
      set({ glossary: currentGlossary ? currentGlossary + '\n\n' + content : content });
    }
  }
}));