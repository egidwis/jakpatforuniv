import { useId, useState } from 'react';
import { ChevronDown, Tag } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { AD_RATE_SCHEDULE, type AdRateEntry } from '../utils/constants';
import { adRateEntryAt } from '../utils/cost-calculator';
import { localizeDateVars } from './CostBreakdown';

/**
 * Pengumuman tarif iklan bertanggal (1 Okt 2026 → 1 Jan 2027) + tabel tarif.
 *
 * Rumahnya langkah 1 `AdsEntryModal` — dibaca tepat saat peneliti berniat
 * memesan. Dulu berupa strip selebar layar di bawah navbar, tapi menumpuk
 * dengan marquee "Riset Non-Survei" dan terbaca sebagai satu blok iklan.
 *
 * ⚠️ SELURUH ANGKA DIBACA DARI `AD_RATE_SCHEDULE` — tabel yang sama dengan
 * checkout dan create-payment.js. Tabel yang ditulis tangan di JSX sudah
 * pernah menyimpang dari kode di proyek ini (katalog voucher, Agu 2026).
 *
 * Tiga fase kalimat, satu komponen:
 *   sebelum 1 Des → "Sampai 30 Nov harga masih sama"
 *   Desember      → "Harga perkenalan tahap 2 s/d 31 Des"
 *   Januari       → "Tarif baru berlaku sejak 1 Jan 2027"
 *   mulai 1 Feb   → tidak tampil sama sekali
 */

const FULL_PRICE_FROM = AD_RATE_SCHEDULE[AD_RATE_SCHEDULE.length - 1].from!;
const HIDE_FROM = '2027-02-01T00:00:00+07:00';

export type RateNoticePhase = 'intro' | 'intro2' | 'full' | null;

export function rateNoticePhase(nowMs: number): RateNoticePhase {
  if (nowMs >= Date.parse(HIDE_FROM)) return null;
  if (nowMs >= Date.parse(FULL_PRICE_FROM)) return 'full';
  const entry = adRateEntryAt(nowMs);
  // Entri Desember = entri perkenalan KEDUA (indeks 2).
  return entry === AD_RATE_SCHEDULE[2] ? 'intro2' : 'intro';
}

const TIER_LABELS = ['1–15', '16–30', '31–50', '51–70', '>70'];

/**
 * Kolom tabel tarif: entri yang berlaku SEKARANG dan sesudahnya. Kolom yang
 * sudah lewat dibuang — tabel ini menjawab "berapa kalau saya pesan", bukan
 * sejarah harga. Sebelum 1 Okt, entri Oktober dianggap "sekarang" (angkanya
 * sama dengan harga lama).
 */
export function rateTableColumns(nowMs: number): Array<{ entry: AdRateEntry; active: boolean }> {
  const current = adRateEntryAt(Math.max(nowMs, Date.parse(AD_RATE_SCHEDULE[1].from!)));
  const start = AD_RATE_SCHEDULE.indexOf(current);
  return AD_RATE_SCHEDULE.slice(start).map((entry, i) => ({ entry, active: i === 0 }));
}

/**
 * Blok pengumuman di langkah 1 modal pintu masuk iklan. Tabel dibuka DI
 * TEMPAT (bukan dialog kedua): modal ini bottom sheet buatan sendiri yang
 * mengunci scroll body — sheet di atas sheet di ponsel rawan bentrok z-index.
 * Tanpa tombol tutup: blok ini hanya muncul saat peneliti memang mau memesan.
 */
export function RateNoticeBlock() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const tableId = useId();
  const phase = rateNoticePhase(Date.now());
  if (!phase) return null;

  const body = phase === 'intro' ? t('rateNoticeIntroBody')
    : phase === 'intro2' ? t('rateNoticeIntro2Body')
      : t('rateNoticeFullBody');

  return (
    <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-100">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-white border border-emerald-200/80 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
          <Tag className="w-4 h-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs sm:text-sm font-bold text-emerald-950">
            {phase === 'full' ? t('rateNoticeFullTitle') : t('rateNoticeTitle')}
          </h3>
          <p className="text-xs text-emerald-900 leading-relaxed mt-0.5">{body}</p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={tableId}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            {open ? t('rateNoticeHideTable') : t('rateNoticeOpenTable')}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        </div>
      </div>

      {/* Selebar blok, tidak menjorok di bawah ikon — supaya 4 kolom muat di 375px. */}
      <div id={tableId} hidden={!open} className="mt-3">
        <RateTable />
      </div>
    </div>
  );
}

/** Tabel tarif + catatannya. Harga normal dicoret DI ATAS harga bayar (bukan
 *  sebaris) supaya kolom tetap sempit di layar ponsel. */
export function RateTable() {
  const { t, language } = useLanguage();
  const columns = rateTableColumns(Date.now());
  const rb = (n: number) => `${Math.round(n / 1000)}rb`;
  const header = (e: AdRateEntry) => {
    if (e.introUntil) {
      return t('rateTableUntil', localizeDateVars({ date: e.introUntil }, language));
    }
    return t('rateTableFrom', localizeDateVars({ date: (e.from ?? '').slice(0, 10) }, language));
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-emerald-100 bg-white">
        <table className="w-full text-xs tabular-nums border-collapse">
          <caption className="sr-only">{t('rateTableTitle')}</caption>
          <thead>
            <tr className="text-left text-slate-600">
              <th scope="col" className="py-2 px-2 font-semibold align-bottom">{t('rateTableQuestions')}</th>
              {columns.map(({ entry, active }) => (
                <th
                  key={entry.from ?? 'base'}
                  scope="col"
                  className={`py-2 px-2 font-semibold text-right align-bottom ${active ? 'text-emerald-800 bg-emerald-50' : ''}`}
                >
                  {header(entry)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIER_LABELS.map((label, tier) => (
              <tr key={label} className="border-t border-slate-100">
                <th scope="row" className="py-1.5 px-2 font-normal text-left text-slate-700 whitespace-nowrap">{label}</th>
                {columns.map(({ entry, active }) => (
                  <td
                    key={entry.from ?? 'base'}
                    className={`py-1.5 px-2 text-right ${active ? 'font-semibold text-emerald-900 bg-emerald-50' : 'text-slate-800'}`}
                  >
                    {entry.list[tier] > entry.effective[tier] && (
                      <span className={`block text-[10px] leading-tight font-normal line-through ${active ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {rb(entry.list[tier])}
                      </span>
                    )}
                    {rb(entry.effective[tier])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-emerald-900/90 leading-relaxed">
        <li>{t('rateTableSubtitle')}</li>
        <li>{t('rateTableNoteLocked')}</li>
        <li>{t('rateTableNoteRebook')}</li>
        <li>{t('rateTableNoteExcl')}</li>
      </ul>
    </div>
  );
}
