// Import patch URL terlebih dahulu sebelum komponen lain
import './utils/axios-patch'

import { createRoot } from 'react-dom/client'
// Font DNA JFU (Plus Jakarta Sans, sama dengan landing page) — self-hosted
// via @fontsource (tanpa CDN), dimuat sebelum CSS agar @font-face tersedia.
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './i18n/LanguageContext'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { reportClientEvent } from './utils/clientLog'
import { staticFailureHtml } from './bootSignals'

const rootEl = document.getElementById('root')!

// Rotasi hash JS entry (20 Nov 2026) untuk memutus cache immutable browser
// yang sempat menyimpan fallback text/html di URL index-CRAC9TIn.js.
document.documentElement.dataset.jfuBuild = '20261120'

// ⚠️ Jaring akar (layar putih tanpa jejak, 19 Nov 2026). RouteErrorBoundary
// paling luar menangkap galat render di provider mana pun. Yang lolos juga
// (boundary sendiri melempar) membuat React melepas seluruh pohon → putih;
// onUncaughtError melaporkannya dan memasang tampilan gagal statis.
// Hapus StrictMode untuk menghindari double rendering
createRoot(rootEl, {
  onUncaughtError(error, info) {
    reportClientEvent({ kind: 'react-uncaught', error, detail: info.componentStack ?? undefined })
    setTimeout(() => {
      if (!rootEl.firstElementChild) rootEl.innerHTML = staticFailureHtml()
    }, 0)
  },
}).render(
  <RouteErrorBoundary>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </RouteErrorBoundary>
)
