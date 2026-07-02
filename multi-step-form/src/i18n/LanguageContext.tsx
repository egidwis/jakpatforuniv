// Language Context for i18n support
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
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

  // Default to Indonesian (Ignore browser preference)
  return 'id';
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  // Persist language changes to localStorage
  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  // Memoized so its reference is stable across renders (only changes when the
  // active language changes), letting React.memo'd consumers skip re-renders.
  const t = useCallback(
    (key: TranslationKey): string => translations[language][key] || key,
    [language]
  );

  // Stable context value — without this, a new object every render would force
  // all 27+ consumers of useLanguage() to re-render on any provider render.
  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, t]
  );

  return (
    <LanguageContext.Provider value={value}>
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
