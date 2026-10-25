import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { AD_TIER_LABELS, KILAT_RATE_SCHEDULE, type AdRateEntry } from '../utils/constants';
import { isKilatTariffActive, kilatRateAt } from '../utils/cost-calculator';
import { localizeDateVars } from './CostBreakdown';

/** Satu jumlah soal per tier — cukup untuk membaca tarif tier itu. */
const TIER_SAMPLE_QUESTIONS = [1, 16, 31, 51, 71] as const;

const rb = (n: number) => `${Math.round(n / 1000).toLocaleString('id-ID')}rb`;

/**
 * Kolom tabel tarif Kilat: entri yang berlaku SEKARANG dan sesudahnya — kolom
 * yang sudah lewat dibuang (tabel ini menjawab "berapa kalau saya pesan",
 * bukan sejarah harga). Padanan `rateTableColumns` milik Iklan.
 */
export function kilatRateColumns(nowMs: number): Array<{ entry: AdRateEntry; active: boolean }> {
  let current = 0;
  KILAT_RATE_SCHEDULE.forEach((e, i) => {
    if (e.from !== null && nowMs >= Date.parse(e.from)) current = i;
  });
  return KILAT_RATE_SCHEDULE.slice(current).map((entry, i) => ({ entry, active: i === 0 }));
}

/** Fase kalimat pengumuman, mengikuti entri tarif yang sedang berlaku. */
export function kilatRatePhase(nowMs: number): 'intro' | 'intro2' | 'full' {
  const first = kilatRateColumns(nowMs)[0].entry;
  const i = KILAT_RATE_SCHEDULE.indexOf(first);
  return i === 0 ? 'intro' : i === 1 ? 'intro2' : 'full';
}

/**
 * Blok tarif di modal pintu masuk Kilat — kembaran `RateNoticeBlock` milik
 * Iklan: pengumuman satu kalimat + tabel yang TERTUTUP sampai diklik, dalam
 * palet amber.
 *
 * ⚠️ ANGKANYA DIBACA DARI KODE, bukan ditulis tangan — dan tabelnya mengikuti
 * apa yang benar-benar ditagih:
 *   - sebelum `KILAT_TARIFF_FROM` (Push B): RUMUS LAMA lewat `kilatRateAt`,
 *     satu kolom, tanpa pengumuman "perkenalan" (belum ada diskon berlaku).
 *     Menampilkan tabel perkenalan di sini akan memperlihatkan harga yang
 *     tidak sama dengan tagihan akun uji.
 *   - sejak itu: `KILAT_RATE_SCHEDULE` (s/d 30 Nov → s/d 31 Des → 1 Jan 2027),
 *     tanpa menyentuh komponen ini.
 * `create-payment.js` memegang salinan literal yang dikunci tes paritas.
 */
export function KilatRateBlock() {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const tableId = useId();
  const now = Date.now();
  const tariffActive = isKilatTariffActive(now);

  const columns = tariffActive ? kilatRateColumns(now) : null;
  const phase = tariffActive ? kilatRatePhase(now) : null;

  const title = phase === 'full' || phase === null ? t('kilatRateTitle') : t('kilatRateNoticeTitle');
  const body = phase === 'intro' ? t('kilatRateNoticeIntroBody')
    : phase === 'intro2' ? t('kilatRateNoticeIntro2Body')
      : phase === 'full' ? t('kilatRateNoticeFullBody')
        : null;

  const header = (e: AdRateEntry) => (e.introUntil
    ? t('rateTableUntil', localizeDateVars({ date: e.introUntil }, language))
    : t('rateTableFrom', localizeDateVars({ date: (e.from ?? '').slice(0, 10) }, language)));

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
      <h3 className="text-sm font-semibold text-amber-950">{title}</h3>
      {body && <p className="mt-1 text-sm leading-relaxed text-amber-900">{body}</p>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={tableId}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-amber-800 underline decoration-amber-800/40 underline-offset-2 hover:decoration-amber-800 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
      >
        {open ? t('rateNoticeHideTable') : t('rateNoticeOpenTable')}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      <div id={tableId} hidden={!open} className="mt-3 space-y-2">
        <div className="overflow-x-auto rounded-xl border border-amber-100 bg-white">
          <table className="w-full text-xs tabular-nums border-collapse">
            <caption className="sr-only">{t('kilatRateTitle')}</caption>
            <thead>
              <tr className="text-left text-slate-600">
                <th scope="col" className="py-2 px-2 font-semibold align-bottom">{t('rateTableQuestions')}</th>
                {columns ? columns.map(({ entry, active }) => (
                  <th
                    key={entry.from ?? 'base'}
                    scope="col"
                    className={`py-2 px-2 font-semibold text-right align-bottom ${active ? 'text-amber-800 bg-amber-50' : ''}`}
                  >
                    {header(entry)}
                  </th>
                )) : (
                  <th scope="col" className="py-2 px-2 font-semibold text-right align-bottom">{t('kilatRatePerWave')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {AD_TIER_LABELS.map((label, tier) => (
                <tr key={label} className="border-t border-slate-100">
                  <th scope="row" className="py-1.5 px-2 text-left font-normal text-slate-700 whitespace-nowrap">{label}</th>
                  {columns ? columns.map(({ entry, active }) => (
                    <td
                      key={entry.from ?? 'base'}
                      className={`py-1.5 px-2 text-right ${active ? 'font-semibold text-amber-900 bg-amber-50' : 'text-slate-800'}`}
                    >
                      {entry.list[tier] > entry.effective[tier] && (
                        <span className={`block text-[10px] leading-tight font-normal line-through ${active ? 'text-amber-700' : 'text-slate-500'}`}>
                          {rb(entry.list[tier])}
                        </span>
                      )}
                      {rb(entry.effective[tier])}
                    </td>
                  )) : (() => {
                    const rate = kilatRateAt(TIER_SAMPLE_QUESTIONS[tier], now);
                    const charged = rate.effective + rate.addon;
                    const listed = rate.list + rate.addon;
                    return (
                      <td className="py-1.5 px-2 text-right font-semibold text-slate-900">
                        {listed > charged && (
                          <span className="block text-[10px] leading-tight font-normal text-slate-500 line-through">{rb(listed)}</span>
                        )}
                        {rb(charged)}
                      </td>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-900/90 leading-relaxed">
          {tariffActive && <li>{t('rateTableSubtitle')}</li>}
          {tariffActive && <li>{t('rateTableNoteLocked')}</li>}
          <li>{t('rateTableNoteExcl')}</li>
        </ul>
      </div>
    </div>
  );
}
