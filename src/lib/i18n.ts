import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import 'dayjs/locale/fr';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'ht', label: 'Haitian Creole', nativeLabel: 'Kreyòl Ayisyen' },
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['code'];

const DAYJS_LOCALE_MAP: Record<string, string> = {
  en: 'en',
  es: 'es',
  fr: 'fr',
  ht: 'fr', // Day.js has no ht locale; French is the closest
};

export function applyDayjsLocale(lang: string) {
  const dayjsLocale = DAYJS_LOCALE_MAP[lang] ?? 'en';
  dayjs.locale(dayjsLocale);
}

export const i18nReady = i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'fr', 'ht'],
    defaultNS: 'common',
    ns: ['common', 'garden', 'modals', 'settings', 'notifications', 'harvest', 'onboarding', 'garden_shared'],
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'garden-language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

i18n.on('languageChanged', (lang) => {
  applyDayjsLocale(lang);
  document.documentElement.lang = lang;
});

// Apply Day.js locale on initial load
applyDayjsLocale(i18n.language);

export default i18n;
