import { useLanguage } from '../i18n/LanguageContext';

export function SidebarHeader() {
  const { t } = useLanguage();

  return (
    <div className="sidebar-header">
      <h2 className="sidebar-header-title">{t('appTitle')}</h2>
      <p className="sidebar-header-tagline">{t('appTagline')}</p>
    </div>
  );
}
