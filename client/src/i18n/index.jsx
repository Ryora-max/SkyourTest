import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { detectLanguage, t } from './translations';

const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => detectLanguage());

  useEffect(() => {
    localStorage.setItem('skyourtest-lang', lang);
  }, [lang]);

  const value = {
    lang,
    setLang,
    t: useCallback((key) => t(key, lang), [lang]),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
