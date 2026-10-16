import { useLanguage } from '../i18n/LanguageContext';
import { AD_TIER_LABELS } from '../utils/constants';
import { kilatRateAt } from '../utils/cost-calculator';

/** Satu jumlah soal per tier — cukup untuk membaca tarif tier itu. */
const TIER_SAMPLE_QUESTIONS = [1, 16, 31, 51, 71] as const;

/**
 * Tarif JFU Kilat per gelombang, per tier soal (Phase 5 §5.6).
 *
 * ⚠️ ANGKANYA DIBACA DARI `kilatRateAt(…, sekarang)` — fungsi yang sama dengan
 * Ringkasan dan (lewat salinan literal yang diuji paritas) create-payment.js.
 * Selama `KILAT_TARIFF_FROM` null tabel ini menampilkan RUMUS LAMA (tarif Iklan
 * + add-on), karena itulah yang benar-benar ditagih; begitu tanggal mulai diisi
 * (Push B), tabel Kilat baru tampil tanpa menyentuh komponen ini.
 */
export function KilatRateBlock() {
  const { t } = useLanguage();
  const now = Date.now();
  const rb = (n: number) => `${Math.round(n / 1000).toLocaleString('id-ID')}rb`;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 space-y-2.5">
      <h3 className="text-sm font-semibold text-amber-950">{t('kilatRateTitle')}</h3>
      <div className="overflow-x-auto rounded-xl border border-amber-100 bg-white">
        <table className="w-full text-xs tabular-nums border-collapse">
          <caption className="sr-only">{t('kilatRateTitle')}</caption>
          <thead>
            <tr className="text-left text-slate-600">
              <th scope="col" className="py-2 px-2 font-semibold">{t('rateTableQuestions')}</th>
              <th scope="col" className="py-2 px-2 font-semibold text-right">{t('kilatRatePerWave')}</th>
            </tr>
          </thead>
          <tbody>
            {AD_TIER_LABELS.map((label, tier) => {
              const rate = kilatRateAt(TIER_SAMPLE_QUESTIONS[tier], now);
              const charged = rate.effective + rate.addon;
              const listed = rate.list + rate.addon;
              return (
                <tr key={label} className="border-t border-slate-100">
                  <th scope="row" className="py-1.5 px-2 text-left font-normal text-slate-700 whitespace-nowrap">{label}</th>
                  <td className="py-1.5 px-2 text-right font-semibold text-slate-900">
                    {listed > charged && (
                      <span className="block text-[10px] leading-tight font-normal text-slate-500 line-through">{rb(listed)}</span>
                    )}
                    {rb(charged)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-relaxed text-amber-900">{t('rateTableNoteExcl')}</p>
    </div>
  );
}
