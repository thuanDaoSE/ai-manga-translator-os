import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import translationVI from '../locales/vi/translation.json';
import translationEN from '../locales/en/translation.json';

const resources = {
  vi: {
    translation: translationVI
  },
  en: {
    translation: translationEN
  }
};

const getInitialLanguage = () => {
  // Ưu tiên 1: Tôn trọng sự lựa chọn (User Preference) lưu trong localStorage với key 'lang' hoặc 'ui_language'
  const savedLang = localStorage.getItem('lang') || localStorage.getItem('ui_language');
  if (savedLang === 'vi' || savedLang === 'en') {
    return savedLang;
  }

  // Tạm dừng cơ chế chọn ngôn ngữ tự động của trình duyệt để mặc định là Việt Nam
  /*
  const browserLang = navigator.language || (navigator.languages && navigator.languages[0]) || '';
  if (browserLang.toLowerCase().startsWith('vi')) {
    return 'vi';
  }
  return 'en';
  */

  return 'vi';
};

const initialLang = getInitialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLang,
    fallbackLng: 'vi',
    interpolation: {
      escapeValue: false // React already escapes values (prevents XSS)
    }
  });

export default i18n;
