import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { MultiStepForm } from './components/MultiStepForm';
import { LanguageSwitcher } from './components/LanguageSwitcher';

import { InternalDashboardWithLayout } from './components/InternalDashboardWithLayout';
import { useLanguage } from './i18n/LanguageContext';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import PaymentFailedPage from './pages/PaymentFailedPage';
import PaymentRetryPage from './pages/PaymentRetryPage';
import { InvoicePage } from './pages/InvoicePage';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import PrivateRoute from './components/PrivateRoute';
import { DashboardLayout } from './components/DashboardLayout';
import { StatusPage } from './pages/dashboard/StatusPage';
import { ChatPage } from './pages/dashboard/ChatPage';
import { ProfilePage } from './pages/dashboard/ProfilePage';
import { FormListPage } from './pages/dashboard/FormListPage';
import { FormBuilderPage } from './pages/dashboard/FormBuilderPage';
import { FormResponsesPage } from './pages/dashboard/FormResponsesPage';
import { PublicFormPage } from './pages/public/PublicFormPage';
import { getSubdomainUsername } from './utils/subdomain';
import { PaymentCheckoutPage } from './pages/PaymentCheckoutPage';
import { SurveyListingPage } from './pages/public/SurveyListingPage';
import { SurveyPage } from './pages/public/SurveyPage';
import { AuthProvider } from './context/AuthContext';
import { CampaignTracker } from './components/CampaignTracker';
import './styles.css';

function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.href = to;
  }, [to]);
  return null;
}

/**
 * <Navigate> yang MEMBAWA SERTA query string dan hash.
 *
 * `<Navigate to="/x">` polos membuang keduanya. Untuk redirect kosmetik itu
 * tidak terasa, tapi begitu ada satu saja parameter yang berarti — di sini
 * `?custom_form_id=` dari CTA "Sebar via Jakpat" — hilangnya sunyi: halaman
 * tujuan terbuka normal, cuma tanpa prefill.
 */
function RedirectPreservingQuery({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

function AppContent() {
  const { t } = useLanguage();
  const location = useLocation();

  // If accessing via custom wildcard subdomain (e.g. budi.jakpatforuniv.com)
  const subdomainUser = getSubdomainUsername();
  if (subdomainUser && !location.pathname.startsWith('/dashboard') && !location.pathname.startsWith('/login')) {
    return (
      <Routes>
        <Route path="/f/:formId" element={<PublicFormPage />} />
        <Route path="/f/:username/:slug" element={<PublicFormPage />} />
        <Route path="*" element={<PublicFormPage />} />
      </Routes>
    );
  }

  // Hide header/footer for internal dashboard
  const isInternalDash = location.pathname === '/internal-dash';
  const isCampaignTracker = location.pathname.startsWith('/c/');

  if (isCampaignTracker) {
    return (
      <Routes>
        <Route path="/c/:source" element={<CampaignTracker />} />
      </Routes>
    );
  }

  if (isInternalDash) {
    return (
      <>
        <Routes>
          <Route path="/internal-dash" element={<InternalDashboardWithLayout />} />
        </Routes>
        <Toaster position="top-right" />
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
          <Route index element={<StatusPage />} />
          {/* URL lama tetap hidup sebagai redirect (bookmark/tab lama). Gate
              profil tidak lagi di level route — pindah ke saat pilih metode
              (ProfileCompletionSheet di dalam flow). */}
          <Route path="status" element={<Navigate to="/dashboard" replace />} />
          {/* ⚠️ `replace` SAJA TIDAK CUKUP — query string wajib ikut. CTA "Sebar
              via Jakpat" mengirim `?custom_form_id=…`, dan <Navigate to="/path">
              polos MEMBUANGNYA diam-diam: halaman terbuka normal, cuma tanpa
              prefill, jadi peneliti mengira formnya gagal termuat. Link lama
              yang sudah beredar tetap lewat sini. */}
          <Route path="submit" element={<RedirectPreservingQuery to="/dashboard/submit-iklan" />} />
          <Route path="submit-iklan" element={<MultiStepForm />} />
          <Route path="forms" element={<FormListPage />} />
          <Route path="forms/new" element={<FormBuilderPage />} />
          <Route path="forms/:formId/edit" element={<FormBuilderPage />} />
          <Route path="forms/:formId/responses" element={<FormResponsesPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="payment/:submissionId" element={<PaymentCheckoutPage />} />
        </Route>

        {/* Public Standalone Form Route (without footer wrapper) */}
        <Route path="/f/:formId" element={<PublicFormPage />} />
        <Route path="/f/:username/:slug" element={<PublicFormPage />} />

        {/* Auth Routes - Standalone Full Screen with unified background */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Public Content Routes - Wrapped in Container */}
        <Route path="*" element={
          <PublicLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/payment-success" element={<PaymentSuccessPage />} />
              <Route path="/payment-failed" element={<PaymentFailedPage />} />
              <Route path="/payment-retry" element={<PaymentRetryPage />} />
              <Route path="/invoices/:paymentId" element={<PrivateRoute><InvoicePage /></PrivateRoute>} />
              <Route path="/pages" element={<SurveyListingPage />} />
              <Route path="/pages/:slug" element={<SurveyPage />} />
              <Route path="/privacy-policy" element={<ExternalRedirect to="/homepage/privacy-policy.html" />} />
              <Route path="/privacy-policy.html" element={<ExternalRedirect to="/homepage/privacy-policy.html" />} />
              <Route path="/terms-conditions" element={<ExternalRedirect to="/homepage/terms-conditions.html" />} />
              <Route path="/terms-conditions.html" element={<ExternalRedirect to="/homepage/terms-conditions.html" />} />
            </Routes>
          </PublicLayout>
        } />
      </Routes>
      <Toaster position="top-right" />
    </div>
  );
}

function App() {
  // Effect to apply theme when app loads
  useEffect(() => {
    // Force light theme
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
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
