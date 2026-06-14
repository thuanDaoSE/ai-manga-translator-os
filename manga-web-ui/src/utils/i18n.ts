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

// Check if localStorage has language choice, default to 'vi'
const savedLang = localStorage.getItem('ui_language') || 'vi';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLang,
    fallbackLng: 'vi',
    interpolation: {
      escapeValue: false // React already escapes values (prevents XSS)
    }
  });

export default i18n;
