import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { MultiStepForm } from './components/MultiStepForm';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { ThemeToggle } from './components/ThemeToggle';
import { InternalDashboard } from './components/InternalDashboard';
import { useLanguage } from './i18n/LanguageContext';
import AdminPage from './pages/AdminPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import PaymentFailedPage from './pages/PaymentFailedPage';
import PaymentRetryPage from './pages/PaymentRetryPage';
import './styles.css';

function AppContent() {
  const { t } = useLanguage();
  const location = useLocation();

  // Hide header/footer for internal dashboard
  const isInternalDash = location.pathname === '/internal-dash';

  if (isInternalDash) {
    return (
      <>
        <Routes>
          <Route path="/internal-dash" element={<InternalDashboard />} />
        </Routes>
        <Toaster position="top-center" />
      </>
    );
  }

  return (
    <div className="min-h-screen">
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
        <div className="container footer-content">
          <p className="footer-text">
            {t('footer')}
          </p>
          <div className="footer-actions">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </footer>

      <Toaster position="top-center" />
    </div>
  );
}

function App() {
  // Effect to apply theme when app loads
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const isDark = savedTheme === 'dark' ||
      (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, []);

  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
