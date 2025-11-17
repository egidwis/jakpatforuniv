// Language Switcher Component
import { useLanguage } from '../i18n/LanguageContext';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="language-switcher">
      <Globe className="language-switcher-icon" />
      <button
        className={`language-button ${language === 'id' ? 'active' : ''}`}
        onClick={() => setLanguage('id')}
      >
        🇮🇩 ID
      </button>
      <span className="language-divider">|</span>
      <button
        className={`language-button ${language === 'en' ? 'active' : ''}`}
        onClick={() => setLanguage('en')}
      >
        🇬🇧 EN
      </button>
    </div>
  );
}
