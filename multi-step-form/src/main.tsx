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

// Hapus StrictMode untuk menghindari double rendering
createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
)
