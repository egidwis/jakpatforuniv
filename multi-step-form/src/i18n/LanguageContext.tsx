// Language Context for i18n support
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { translations } from './translations';
import type { Language, TranslationKey } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  /**
   * `vars` mengisi placeholder `{nama}` di dalam string terjemahan.
   *
   * Ditambahkan supaya kalimat panjang tidak perlu dipecah jadi potongan
   * "bagian1 / bagian2 / bagian3" — pola itu memaksa urutan kata Inggris ke
   * bahasa lain dan membuat copy hampir mustahil disunting tanpa membaca JSX-nya.
   */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
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
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const raw = translations[language][key] || key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
      );
    },
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
