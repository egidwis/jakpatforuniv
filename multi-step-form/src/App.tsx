import { Suspense, useEffect } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useLanguage } from './i18n/LanguageContext';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import PrivateRoute from './components/PrivateRoute';
import { PublicFormPage } from './pages/public/PublicFormPage';
import { getSubdomainUsername } from './utils/subdomain';
import { SurveyListingPage } from './pages/public/SurveyListingPage';
import { SurveyPage } from './pages/public/SurveyPage';
import { AuthProvider } from './context/AuthContext';
import { CampaignTracker } from './components/CampaignTracker';
import { BootLoader } from './components/BootLoader';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { NotFoundPage } from './pages/NotFoundPage';
import { lazyNamed } from './utils/lazyRoute';
import { authStorageKeyFor, dashboardPreloadsFor, hasStoredSession } from './utils/storedSession';
import { markBootMounted } from './bootSignals';
// ⚠️ Satu-satunya pemuat @tailwind base/components/utilities. Dulu ikut eager
// lewat InternalDashboardWithLayout; kini dashboard admin lazy, jadi diimpor di
// sini — tanpa ini seluruh halaman publik tampil tanpa Tailwind. Wajib SEBELUM
// styles.css (urutan cascade lama). Dijaga src/appCodeSplit.spec.ts.
import './components/InternalDashboard.css';
import './styles.css';

/*
 * ⚠️ CODE SPLITTING. Hanya rute yang dibuka langsung oleh orang luar
 * (responden /pages & /f, login, /c) yang dimuat eager. Semua halaman dashboard
 * & admin lazy — dulu seluruh aplikasi satu berkas 6,2 MB dan /login, /pages
 * blank lama di ponsel. src/appCodeSplit.spec.ts menjaga daftar eager ini.
 */
const loadDashboardLayout = () => import('./components/DashboardLayout');
const loadStatusPage = () => import('./pages/dashboard/StatusPage');
const loadWebinarGate = () => import('./components/webinar/WebinarGate');
const loadWebinarCheckout = () => import('./pages/dashboard/webinar/WebinarCheckoutPage');
const DashboardLayout = lazyNamed(loadDashboardLayout, 'DashboardLayout');
const StatusPage = lazyNamed(loadStatusPage, 'StatusPage');
const MultiStepForm = lazyNamed(() => import('./components/MultiStepForm'), 'MultiStepForm');
const InternalDashboardWithLayout = lazyNamed(() => import('./components/InternalDashboardWithLayout'), 'InternalDashboardWithLayout');
const PaymentSuccessPage = lazyNamed(() => import('./pages/PaymentSuccessPage'), 'default');
const PaymentFailedPage = lazyNamed(() => import('./pages/PaymentFailedPage'), 'default');
const InvoicePage = lazyNamed(() => import('./pages/InvoicePage'), 'InvoicePage');
const WebinarHubPage = lazyNamed(() => import('./pages/dashboard/webinar/WebinarHubPage'), 'WebinarHubPage');
const WebinarTicketRedirect = lazyNamed(() => import('./pages/dashboard/webinar/WebinarHubPage'), 'WebinarTicketRedirect');
const WebinarCheckoutPage = lazyNamed(loadWebinarCheckout, 'WebinarCheckoutPage');
const WebinarWatchPage = lazyNamed(() => import('./pages/dashboard/webinar/WebinarWatchPage'), 'WebinarWatchPage');
const WebinarGate = lazyNamed(loadWebinarGate, 'WebinarGate');
const ChatPage = lazyNamed(() => import('./pages/dashboard/ChatPage'), 'ChatPage');
const ProfilePage = lazyNamed(() => import('./pages/dashboard/ProfilePage'), 'ProfilePage');
const FormListPage = lazyNamed(() => import('./pages/dashboard/FormListPage'), 'FormListPage');
const FormBuilderPage = lazyNamed(() => import('./pages/dashboard/FormBuilderPage'), 'FormBuilderPage');
const FormResponsesPage = lazyNamed(() => import('./pages/dashboard/FormResponsesPage'), 'FormResponsesPage');
const AnalyzerListPage = lazyNamed(() => import('./pages/dashboard/AnalyzerListPage'), 'AnalyzerListPage');
const AnalyzerWorkspacePage = lazyNamed(() => import('./pages/dashboard/AnalyzerWorkspacePage'), 'AnalyzerWorkspacePage');
const PaymentCheckoutPage = lazyNamed(() => import('./pages/PaymentCheckoutPage'), 'PaymentCheckoutPage');
const JadwalDanBayarPage = lazyNamed(() => import('./pages/dashboard/JadwalDanBayarPage'), 'JadwalDanBayarPage');
const JadwalBaruPage = lazyNamed(() => import('./pages/dashboard/JadwalBaruPage'), 'JadwalBaruPage');

// Peneliti yang membuka /dashboard langsung: unduh chunk rute itu SEJAJAR
// dengan pembacaan sesi, bukan berantai sesudahnya. HANYA bila ada sesi
// tersimpan (atau baru kembali dari Google) — pengunjung "Beli tiket" yang
// belum login akan dialihkan ke /login, jadi unduhan itu sia-sia (+0,6 s di 4G
// lambat) dan dibatalkan saat ia menekan Back. Galat diabaikan di sini —
// lazyNamed akan mencoba lagi dan menangani kegagalan.
if (typeof window !== 'undefined') {
  const loc = window.location;
  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { /* mode privat ketat */ }
  const signedIn = hasStoredSession(storage, authStorageKeyFor(import.meta.env.VITE_SUPABASE_URL || ''));
  const loaders = { layout: loadDashboardLayout, status: loadStatusPage, webinarGate: loadWebinarGate, webinarCheckout: loadWebinarCheckout };
  for (const part of dashboardPreloadsFor(loc.pathname, loc.search, loc.hash, signedIn)) {
    loaders[part]().catch(() => {});
  }
}

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

/**
 * `/payment-retry?id=<submission_id>` → halaman Jadwal & Bayar order itu.
 *
 * ⚠️ DULU HALAMAN PUBLIK YANG MENERBITKAN TAGIHAN SENDIRI — pemicu `createPayment`
 * kedua di luar halaman Jadwal & Bayar, tanpa countdown, tanpa kalender, dan
 * tanpa penjaga yang sudah tumbuh di sana. DOKU tidak pernah memanggilnya
 * (callback hanya ke `/payment-success`); yang tersisa cuma link dari
 * `PaymentFailed`. Dialihkan, bukan dihapus, supaya link itu tidak 404.
 */
function PaymentRetryRedirect() {
  const location = useLocation();
  const id = new URLSearchParams(location.search).get('id');
  return <Navigate to={id ? `/dashboard/payment/${encodeURIComponent(id)}` : '/dashboard'} replace />;
}

function AppContent() {
  const { t } = useLanguage();
  const location = useLocation();

  // If accessing via custom wildcard subdomain (e.g. budi.jakpatforuniv.com)
  const subdomainUser = getSubdomainUsername();
  if (subdomainUser && !location.pathname.startsWith('/dashboard') && !location.pathname.startsWith('/login') && !location.pathname.startsWith('/register')) {
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
          <Route path="orders" element={<Navigate to="/dashboard" replace />} />
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
          <Route path="analyzer" element={<AnalyzerListPage />} />
          <Route path="analyzer/:id" element={<AnalyzerWorkspacePage />} />
          <Route element={<WebinarGate />}>
            <Route path="webinar" element={<WebinarHubPage />} />
            <Route path="webinar/beli/:slug" element={<WebinarCheckoutPage />} />
            <Route path="webinar/tiket/:orderId" element={<WebinarTicketRedirect />} />
            <Route path="webinar/tonton/:orderId" element={<WebinarWatchPage />} />
          </Route>
          <Route path="chat" element={<ChatPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="payment/:submissionId" element={<PaymentCheckoutPage />} />
          {/* ⚠️ Rute lama DI ATAS sengaja TETAP HIDUP, tapi sejak 10 Okt 2026
              ia hanya PENERJEMAH: order → jadwal ordinal 1 → `jadwal/:scheduleId`.
              Pintu masuknya berkunci `submission_id` (wizard sesudah kunci,
              Kilat Place Order, "Jadwalkan Ulang" dashboard, /payment-retry).
              Satu halaman, dua alamat. */}
          {/* ⚠️ URUTAN MENGIKAT: `jadwal/baru/...` lebih dulu. React Router v6
              memang memenangkan rute yang lebih spesifik, tapi menuliskannya di
              bawah membuat pembaca berikutnya mengira "baru" bisa terbaca
              sebagai `:scheduleId` — dan kalau itu terjadi, halaman jadwal
              mencari UUID bernama "baru", tidak menemukannya, lalu menampilkan
              "tidak ditemukan" tanpa satu pun galat. */}
          <Route path="jadwal/baru/:submissionId" element={<JadwalBaruPage />} />
          <Route path="jadwal/:scheduleId" element={<JadwalDanBayarPage />} />
        </Route>

        {/* Public Standalone Form Route (without footer wrapper) */}
        <Route path="/f/:formId" element={<PublicFormPage />} />
        <Route path="/f/:username/:slug" element={<PublicFormPage />} />

        {/* Auth Routes - Standalone Full Screen with unified background */}
        <Route path="/login" element={<LoginPage initialMode="login" />} />
        <Route path="/register" element={<LoginPage initialMode="signup" />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Invoice Route - Standalone Full Screen (without container/footer wrapper) */}
        <Route path="/invoices/:paymentId" element={<PrivateRoute><InvoicePage /></PrivateRoute>} />

        {/* Public Survey Directory - Standalone Full-Bleed Shell (selaras dengan landing page `/`) */}
        <Route path="/pages" element={<SurveyListingPage />} />

        {/* Public Content Routes - Wrapped in Container */}
        <Route path="*" element={
          <PublicLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/payment-success" element={<PaymentSuccessPage />} />
              <Route path="/payment-failed" element={<PaymentFailedPage />} />
              <Route path="/payment-retry" element={<PaymentRetryRedirect />} />
              <Route path="/pages/:slug" element={<SurveyPage />} />
              {/* Di apex, middleware melayani halaman legal sebelum SPA; rute ini hanya
                  tercapai di host lain (pages.dev, localhost). Target WAJIB absolut —
                  target relatif `/privacy-policy` akan berputar ke rute ini lagi. */}
              <Route path="/privacy-policy" element={<ExternalRedirect to="https://jakpatforuniv.com/privacy-policy" />} />
              <Route path="/privacy-policy.html" element={<ExternalRedirect to="https://jakpatforuniv.com/privacy-policy" />} />
              <Route path="/terms-conditions" element={<ExternalRedirect to="https://jakpatforuniv.com/terms-conditions" />} />
              <Route path="/terms-conditions.html" element={<ExternalRedirect to="https://jakpatforuniv.com/terms-conditions" />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </PublicLayout>
        } />
      </Routes>
      {/* Di BAWAH navbar sticky (AppNav: h-14 ponsel, h-16 md) + jarak 12–16px.
          Bawaan sonner (24px / 16px dari atas) menindih navbar. */}
      <Toaster position="top-right" offset={{ top: 80 }} mobileOffset={{ top: 68 }} />
    </div>
  );
}

function App() {
  // Effect to apply theme when app loads
  useEffect(() => {
    // Watchdog boot di index.html: JS utama sudah jalan & React sudah commit.
    markBootMounted();
    // Force light theme
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  return (
    <Router>
      <AuthProvider>
        <RouteErrorBoundary>
          <Suspense fallback={<BootLoader />}>
            <AppContent />
          </Suspense>
        </RouteErrorBoundary>
      </AuthProvider>
    </Router>
  );
}

export default App;
