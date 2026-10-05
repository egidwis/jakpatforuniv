import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { AD_RATE_SCHEDULE, AD_TIER_LABELS, type AdRateEntry } from '../utils/constants';
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

const TIER_LABELS = AD_TIER_LABELS;

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
 * Satu kartu sorotan: isi lembut, tanpa ikon, tanpa hover. Seluruh kartu
 * tidak bisa diklik. Satu-satunya kontrol di sini adalah pengungkap tabel.
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
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
      <h3 className="text-sm font-semibold text-emerald-950">
        {phase === 'full' ? t('rateNoticeFullTitle') : t('rateNoticeTitle')}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-emerald-900">{body}</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={tableId}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-emerald-800 underline decoration-emerald-800/40 underline-offset-2 hover:decoration-emerald-800 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
      >
        {open ? t('rateNoticeHideTable') : t('rateNoticeOpenTable')}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      <div id={tableId} hidden={!open} className="mt-3">
        <RateTable />
      </div>
    </div>
  );
}

/** Tabel tarif + catatannya. Harga normal dicoret DI ATAS harga bayar (bukan
 *  sebaris) supaya kolom tetap sempit di layar ponsel.
 *
 *  `highlightTier` (0–4) menebalkan baris kategori soal milik peneliti —
 *  dipakai tooltip tarif di kartu ringkasan order. `showNotes={false}` untuk
 *  pemanggil yang punya catatannya sendiri. */
export function RateTable({ highlightTier = -1, showNotes = true }: { highlightTier?: number; showNotes?: boolean } = {}) {
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
              <tr
                key={label}
                aria-current={tier === highlightTier ? 'true' : undefined}
                className="border-t border-slate-100"
              >
                {/* Bilah kiri lewat inset shadow, bukan outline pada <tr>: Tailwind 3
                    `outline-2` tanpa gaya tidak terlihat, dan outline baris tabel
                    tidak konsisten antar-browser. */}
                <th
                  scope="row"
                  className={`py-1.5 px-2 text-left whitespace-nowrap ${
                    tier === highlightTier
                      ? 'font-bold text-slate-900 shadow-[inset_3px_0_0_theme(colors.emerald.600)]'
                      : 'font-normal text-slate-700'
                  }`}
                >
                  {label}
                </th>
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

      {showNotes && (
        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-emerald-900/90 leading-relaxed">
          <li>{t('rateTableSubtitle')}</li>
          <li>{t('rateTableNoteLocked')}</li>
          <li>{t('rateTableNoteRebook')}</li>
          <li>{t('rateTableNoteExcl')}</li>
        </ul>
      )}
    </div>
  );
}
