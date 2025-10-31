// Language Switcher Component
import { useLanguage } from '../i18n/LanguageContext';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-2">
      <Globe className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as 'en' | 'id')}
        className="bg-transparent border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
      >
        <option value="id">🇮🇩 Bahasa Indonesia</option>
        <option value="en">🇬🇧 English</option>
      </select>
    </div>
  );
}
