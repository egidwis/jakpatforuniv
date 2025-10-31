import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { MultiStepForm } from './components/MultiStepForm';
import { ThemeToggle } from './components/ThemeToggle';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useLanguage } from './i18n/LanguageContext';
import AdminPage from './pages/AdminPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import PaymentFailedPage from './pages/PaymentFailedPage';
import PaymentRetryPage from './pages/PaymentRetryPage';
import './styles.css';

function App() {
  const { t } = useLanguage();

  // Effect to apply theme when app loads
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const isDark = savedTheme === 'dark' ||
      (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, []);

  return (
    <Router>
      <div className="min-h-screen">
        <header className="header">
          <div className="container">
            <div className="flex justify-end items-center gap-4 mb-4">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <h1>{t('appTitle')}</h1>
            <p>{t('appTagline')}</p>
          </div>
        </header>

        <main className="container py-8">
          <Routes>
            <Route path="/" element={<MultiStepForm />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/payment-success" element={<PaymentSuccessPage />} />
            <Route path="/payment-failed" element={<PaymentFailedPage />} />
            <Route path="/payment-retry" element={<PaymentRetryPage />} />
          </Routes>
        </main>

        <footer className="footer">
          <div className="container">
            <p>
              {t('footer')}
            </p>
          </div>
        </footer>

        <Toaster position="top-center" />
      </div>
    </Router>
  );
}

export default App;
