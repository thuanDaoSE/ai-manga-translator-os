import { create } from 'zustand';

export const VALID_LANGUAGES = [
  'Tiếng Việt'
];

export const SOURCE_LANGUAGES = [
  { code: 'auto', flag: '✨', label: 'Tự động (AI)', iso: 'AUTO' },
  { code: 'ja', flag: '🇯🇵', label: 'Tiếng Nhật', iso: 'JA' },
  { code: 'en', flag: '🇬🇧', label: 'Tiếng Anh', iso: 'EN' },
  { code: 'zh', flag: '🇨🇳', label: 'Tiếng Trung', iso: 'ZH' },
  { code: 'ko', flag: '🇰🇷', label: 'Tiếng Hàn', iso: 'KO' }
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
  sourceLanguage: string;
  useGpu: boolean;
  setUseGpu: (useGpu: boolean) => void;
  translationMode: 'fast' | 'studio' | 'grok' | 'openai' | 'anytext';
  setTranslationMode: (mode: 'fast' | 'studio' | 'grok' | 'openai' | 'anytext') => void;
  grokSubModel: 'grok-2' | 'grok-imagine';
  setGrokSubModel: (model: 'grok-2' | 'grok-imagine') => void;
  openaiSubModel: 'gpt-4o';
  setOpenaiSubModel: (model: 'gpt-4o') => void;
  studioSubModel: 'google/nano-banana-edit' | 'gpt-image-2-image-to-image' | 'nano-banana-2' | 'nano-banana-pro';
  setStudioSubModel: (model: 'google/nano-banana-edit' | 'gpt-image-2-image-to-image' | 'nano-banana-2' | 'nano-banana-pro') => void;
  kieResolution: '1K' | '2K' | '4K';
  setKieResolution: (res: '1K' | '2K' | '4K') => void;
  kieOutputFormat: 'jpg' | 'png';
  setKieOutputFormat: (format: 'jpg' | 'png') => void;

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
  sourceLanguage: 'auto',
  useGpu: true,
  setUseGpu: (useGpu) => set({ useGpu }),
  translationMode: 'studio' as 'fast' | 'studio' | 'grok' | 'openai' | 'anytext',
  setTranslationMode: (mode) => set({ translationMode: mode }),
  grokSubModel: 'grok-imagine' as 'grok-2' | 'grok-imagine',
  setGrokSubModel: (model) => set({ grokSubModel: model }),
  openaiSubModel: 'gpt-4o' as 'gpt-4o',
  setOpenaiSubModel: (model) => set({ openaiSubModel: model }),
  studioSubModel: 'gpt-image-2-image-to-image' as 'google/nano-banana-edit' | 'gpt-image-2-image-to-image' | 'nano-banana-2' | 'nano-banana-pro',
  setStudioSubModel: (model) => set({ studioSubModel: model }),
  kieResolution: '1K' as '1K' | '2K' | '4K',
  setKieResolution: (res) => set({ kieResolution: res }),
  kieOutputFormat: 'jpg' as 'jpg' | 'png',
  setKieOutputFormat: (format) => set({ kieOutputFormat: format }),

  setConfig: (field, value) => set({ [field]: value }),

  loadFromLocal: () => {
    const saved = localStorage.getItem('manga_trans_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.targetLanguage && !VALID_LANGUAGES.includes(parsed.targetLanguage)) {
          parsed.targetLanguage = 'Tiếng Việt';
        }
        if (parsed.translationMode === 'fast') {
          parsed.translationMode = 'studio';
        }
        // Migrate old studioSubModel to nano-banana-2
        if (parsed.studioSubModel === 'nano-banana-v1' || parsed.studioSubModel === 'nano-banana-v2') {
          parsed.studioSubModel = 'nano-banana-2';
        }
        if (!parsed.sourceLanguage) {
          parsed.sourceLanguage = 'auto';
        }
        if (parsed.useGpu === undefined) {
          parsed.useGpu = true;
        }
        set({ ...parsed });
        localStorage.setItem('has_configured_translation', 'true');
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
      targetLanguage: state.targetLanguage,
      sourceLanguage: state.sourceLanguage,
      useGpu: state.useGpu,
      translationMode: state.translationMode,
      grokSubModel: state.grokSubModel,
      openaiSubModel: state.openaiSubModel,
      studioSubModel: state.studioSubModel,
      kieResolution: state.kieResolution,
      kieOutputFormat: state.kieOutputFormat
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