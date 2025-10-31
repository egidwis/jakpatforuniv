// Import patch URL terlebih dahulu sebelum komponen lain
import './utils/axios-patch'

import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './i18n/LanguageContext'

// Hapus StrictMode untuk menghindari double rendering
createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
)
