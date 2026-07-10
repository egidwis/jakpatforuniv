// Language Switcher Component
import { useLanguage } from '../i18n/LanguageContext';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex items-center p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200/50 dark:border-gray-700/50">
      <button
        onClick={() => setLanguage('id')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
          language === 'id'
            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
        }`}
      >
        <span className="text-sm leading-none">🇮🇩</span>
        <span className="leading-none">ID</span>
      </button>
      <button
        onClick={() => setLanguage('en')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
          language === 'en'
            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
        }`}
      >
        <span className="text-sm leading-none">🇬🇧</span>
        <span className="leading-none">EN</span>
      </button>
    </div>
  );
}

