import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export type AdsFlowStep = 'method' | 'import' | 'fields';

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
 * Cap identik untuk `method` ↔ `import`, tidak bercabang — itulah yang dulu
 * memperbaiki transisi berkedip antar dua layar itu, dan tetap berlaku.
 * Tombol kembali TIDAK hidup di cap ini; sudah pindah ke heading body
 * (`StepOneGoogleForm`), jadi kedua step itu benar-benar nol elemen baru.
 *
 * `fields` DIKECUALIKAN dari invarian tersebut — dan sekarang malah tanpa cap
 * SAMA SEKALI, bukan cuma dipadatkan. Judul & navigasi-mundur layar ini sudah
 * pindah ke `UnifiedHeader` (floating bar bawah), satu-satunya chrome yang
 * tampil bersamaan dengan layar ini (`StepSurveyDetails` sengaja menyembunyikan
 * `UnifiedHeader` justru saat cap besar method/import tampil, jadi keduanya
 * tidak pernah tabrakan). Tanpa cap warna, trik full-bleed mobile
 * (`-mt-8 -mx-6 rounded-none border-0`) juga tidak relevan lagi — `fields`
 * pakai kartu bordered biasa di semua lebar.
 *
 * Kontras gradien (dihitung, bukan selera, berlaku untuk cap method/import):
 * putih di atas jfu-light cuma 2,65:1 — gagal bahkan ambang teks besar (3:1);
 * text-white/80 di atas jfu-primary cuma 3,5:1; /90 baru 4,04:1. Maka gradien
 * WAJIB `from-jfu-primary to-jfu-dark` (makin gelap ke bawah) dan teks
 * minimal `text-white/90`. Pola `ctaRoyal` (`to-jfu-light`, lihat
 * ReviewPhase.tsx) aman untuk label tombol pendek & tebal, TIDAK untuk
 * paragraf.
 */
export function AdsFlowCard({ step, children }: AdsFlowCardProps) {
  const { t } = useLanguage();

  const hasCap = step !== 'fields';

  const shellClass = hasCap
    ? '-mt-8 -mx-6 md:mt-0 md:mx-auto w-auto md:w-full max-w-none md:max-w-xl rounded-none md:rounded-2xl border-0 md:border md:border-gray-300 bg-white shadow-none md:shadow-sm overflow-hidden'
    : 'mx-auto w-full max-w-xl';

  const bodyClass = hasCap
    ? 'bg-white px-4 md:px-5 py-4 md:py-5'
    : 'w-full';

  return (
    <div className={shellClass}>
      {hasCap && (
        <div className="relative overflow-hidden bg-gradient-to-r from-jfu-primary via-[#1E88E5] to-jfu-light text-center px-5 py-6">
          <span aria-hidden="true" className="pointer-events-none absolute -top-10 -right-8 w-32 h-32 rounded-full bg-white/[0.12]" />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 -left-10 w-36 h-36 rounded-full bg-white/[0.08]" />

          <span className="relative inline-flex w-12 h-12 rounded-2xl bg-white/20 ring-1 ring-white/30 text-white items-center justify-center mb-3 shadow-xs">
            <BarChart3 className="w-6 h-6" />
          </span>

          <h1 className="relative font-bold text-white text-xl md:text-2xl drop-shadow-xs">
            {t('productAdsTitle')}
          </h1>

          <p className="relative text-sm text-white/95 mt-2 max-w-sm mx-auto leading-relaxed">
            {t('adsEntryHeroDesc')}
          </p>
        </div>
      )}

      <div className={bodyClass}>
        <div key={step}>
          {children}
        </div>
      </div>
    </div>
  );
}
