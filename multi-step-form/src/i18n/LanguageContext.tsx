// Language Context for i18n support
import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { translations } from './translations';
import type { Language, TranslationKey } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'jakpat-language';

// Get initial language with priority: localStorage > browser preference > default (id)
const getInitialLanguage = (): Language => {
  // Check localStorage first
  const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (savedLanguage === 'en' || savedLanguage === 'id') {
    return savedLanguage;
  }

  // Check browser language preference
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('en')) {
    return 'en';
  }
  if (browserLang.startsWith('id')) {
    return 'id';
  }

  // Default to Indonesian
  return 'id';
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  // Persist language changes to localStorage
  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  const t = (key: TranslationKey): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
