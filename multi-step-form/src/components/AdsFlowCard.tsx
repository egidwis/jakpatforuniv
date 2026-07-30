import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Info } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export type AdsFlowStep = 'method' | 'import';

interface AdsFlowCardProps {
  step: AdsFlowStep;
  children: ReactNode;
}

/**
 * Shell dual-tone yang membungkus SELURUH flow pintu-masuk Iklan Survei —
 * bukan cuma layar pilih-metode. Layar berikutnya (import Google Form) dulu
 * punya kartu, lebar, dan biru sendiri, jadi berpindah ke sana terasa seperti
 * pindah aplikasi. Menghoist kartu ke StepSurveyDetails membuat node-nya
 * PERSIST di DOM saat body berganti — cap & footer tidak pernah unmount,
 * cuma `children` yang cross-fade lewat `key={step}` di pemanggilnya.
 *
 * Cap SENGAJA identik untuk kedua step, tidak bercabang (permintaan eksplisit
 * user setelah melihat draft dengan cap ringkas). Tombol kembali TIDAK lagi
 * hidup di cap ini — sudah pindah ke heading body (`StepOneGoogleForm`),
 * jadi cap benar-benar nol perubahan antar step, termasuk nol elemen baru.
 *
 * Footer disclaimer T&C persis sama alasannya: hidup DI LUAR pembungkus
 * ber-`key` milik pemanggil supaya tidak ikut fade saat step berganti — diam
 * di tempat, memperkuat kesan "kartu yang sama" alih-alih chrome berkedip.
 * Jangan dihapus saat diet copy berikutnya — dengan judul "Review otomatis"
 * di body, disclaimer ini yang menjaga agar tidak terbaca sebagai "tidak
 * direview sama sekali".
 *
 * Kontras gradien (dihitung, bukan selera): putih di atas jfu-light cuma
 * 2,65:1 — gagal bahkan ambang teks besar (3:1); text-white/80 di atas
 * jfu-primary cuma 3,5:1; /90 baru 4,04:1. Maka gradien WAJIB
 * `from-jfu-primary to-jfu-dark` (makin gelap ke bawah) dan teks minimal
 * `text-white/90`. Pola `ctaRoyal` (`to-jfu-light`, lihat ReviewPhase.tsx)
 * aman untuk label tombol pendek & tebal, TIDAK untuk paragraf.
 */
export function AdsFlowCard({ step, children }: AdsFlowCardProps) {
  const { t } = useLanguage();

  return (
    <div className="-mt-8 -mx-6 md:mt-0 md:mx-auto w-auto md:w-full max-w-none md:max-w-xl rounded-none md:rounded-2xl border-0 md:border md:border-gray-200 bg-white shadow-none md:shadow-sm overflow-hidden">
      <div className="relative overflow-hidden bg-gradient-to-b from-jfu-primary to-jfu-dark px-5 py-6 text-center">
        <span aria-hidden="true" className="pointer-events-none absolute -top-10 -right-8 w-32 h-32 rounded-full bg-white/[0.07]" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 -left-10 w-36 h-36 rounded-full bg-white/[0.05]" />

        <span className="relative inline-flex w-12 h-12 rounded-2xl bg-white/15 ring-1 ring-white/20 text-white items-center justify-center mb-3">
          <BarChart3 className="w-6 h-6" />
        </span>
        <h1 className="relative text-xl md:text-2xl font-bold text-white">{t('productAdsTitle')}</h1>
        <p className="relative text-sm text-white/90 mt-2 max-w-sm mx-auto leading-relaxed">
          {t('adsEntryHeroDesc')}
        </p>
      </div>

      <div className="bg-white px-4 md:px-5 py-4 md:py-5">
        <div key={step}>
          {children}
        </div>
      </div>
    </div>
  );
}
