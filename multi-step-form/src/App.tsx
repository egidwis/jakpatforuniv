import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { MultiStepForm } from './components/MultiStepForm';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { ThemeToggle } from './components/ThemeToggle';
import { InternalDashboardWithLayout } from './components/InternalDashboardWithLayout';
import { useLanguage } from './i18n/LanguageContext';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import PaymentFailedPage from './pages/PaymentFailedPage';
import PaymentRetryPage from './pages/PaymentRetryPage';
import { InvoicePage } from './pages/InvoicePage';
import LoginPage from './pages/LoginPage';
import PrivateRoute from './components/PrivateRoute';
import { DashboardLayout } from './components/DashboardLayout';
import { StatusPage } from './pages/dashboard/StatusPage';
import { ChatPage } from './pages/dashboard/ChatPage';
import { AuthProvider } from './context/AuthContext';
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
          <Route path="/internal-dash" element={<InternalDashboardWithLayout />} />
        </Routes>
        <Toaster position="top-center" />
      </>
    );
  }

  const PublicLayout = ({ children }: { children: React.ReactNode }) => (
    <>
      <main className="container py-8">
        {children}
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
    </>
  );

  return (
    <div className="min-h-screen">
      <Routes>
        {/* Dashboard Routes - Full Screen Logic */}
        <Route path="/dashboard" element={
          <PrivateRoute>
            <DashboardLayout />
          </PrivateRoute>
        }>
          <Route index element={<Navigate to="/dashboard/submit" replace />} />
          <Route path="submit" element={<MultiStepForm />} />
          <Route path="status" element={<StatusPage />} />
          <Route path="chat" element={<ChatPage />} />
        </Route>

        {/* Public Routes - Wrapped in Container */}
        <Route path="*" element={
          <PublicLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard/submit" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/payment-success" element={<PaymentSuccessPage />} />
              <Route path="/payment-failed" element={<PaymentFailedPage />} />
              <Route path="/payment-retry" element={<PaymentRetryPage />} />
              <Route path="/invoices/:paymentId" element={<InvoicePage />} />
            </Routes>
          </PublicLayout>
        } />
      </Routes>
      <Toaster position="top-center" />
    </div>
  );
}

function App() {
  // Effect to apply theme when app loads
  // Effect to apply theme when app loads
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const isDark = savedTheme === 'dark' ||
      (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
