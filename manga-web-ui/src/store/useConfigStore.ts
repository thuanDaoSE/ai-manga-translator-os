import { create } from 'zustand';

export const VALID_LANGUAGES = [
  'Tiếng Việt',
  'English',
  'Bahasa Indonesia',
  'ภาษาไทย (Thai)',
  'Français (French)',
  'Español (Spanish)',
  'Русский (Russian)'
];

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
  targetLanguage: string;
  translationMode: 'fast' | 'deep' | 'studio';
  setTranslationMode: (mode: 'fast' | 'deep' | 'studio') => void;

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
  targetLanguage: 'Tiếng Việt',
  translationMode: 'fast' as 'fast' | 'deep' | 'studio',
  setTranslationMode: (mode) => set({ translationMode: mode }),

  setConfig: (field, value) => set({ [field]: value }),

  loadFromLocal: () => {
    const saved = localStorage.getItem('manga_trans_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.targetLanguage && !VALID_LANGUAGES.includes(parsed.targetLanguage)) {
          parsed.targetLanguage = 'Tiếng Việt';
        }
        set({ ...parsed });
      } catch (err) {
        console.error("Lỗi parse config từ local storage:", err);
      }
    }
  },

  saveToLocal: () => {
    const state = get();
    const dataToSave = {
      genre: state.genre, customGenre: state.customGenre,
      tone: state.tone, customTone: state.customTone,
      pronoun: state.pronoun, customPronoun: state.customPronoun,
      glossary: state.glossary,
      targetLanguage: state.targetLanguage
    };
    localStorage.setItem('manga_trans_settings', JSON.stringify(dataToSave));
    set({ isModalOpen: false }); // Đóng modal sau khi lưu
  },

  importFromFile: (content, isJson) => {
    if (isJson) {
      try {
        const config = JSON.parse(content);
        if (config.targetLanguage && !VALID_LANGUAGES.includes(config.targetLanguage)) {
          config.targetLanguage = 'Tiếng Việt';
        }
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

// Auto-initialize the store from local storage on load
useConfigStore.getState().loadFromLocal();