import { useId, useState } from 'react';
import { ChevronDown, Tag, Zap } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { formatIDR } from '../utils/currency';
import type { MoneyLine } from '../utils/scheduleMoney';

/**
 * Rincian biaya — SATU komponen, dua kedalaman.
 *
 * ⚠️ SEBELUM INI ADA, rincian muncul di empat tempat dengan tiga cara berbeda:
 * Ringkasan (kartu penuh, `calculateTotalCost`), halaman bayar (total MENTAH
 * dari `submission.total_cost`), dan kartu jadwal (total + "Lihat rincian",
 * `deriveScheduleMoney`). Tiga cara berarti tiga kesempatan untuk berselisih —
 * dan `recordedVsBilled` sudah membuktikan `total_cost` bisa menyimpang dari
 * `invoices.amount`.
 *
 * Bentuknya diangkat dari `ScheduleBanner` (SchedulePhase.tsx) yang sudah
 * teruji di produksi: total dulu, rincian atas permintaan, tone
 * `discount`/`addon`, dan `costIsEstimateNote` saat angkanya belum ditagih.
 *
 * ⚠️ KOMPONEN INI TIDAK MENGHITUNG APA PUN. Ia menerima `MoneyLine[]` yang
 * sudah jadi — dari `deriveScheduleMoney` (yang memegang aturan `fundsPrizePool`
 * asal sql/37) atau `calculateTotalCost`. Menghitung ulang di lapisan tampilan
 * adalah cacat yang baru saja ditutup; jangan dibuka lagi lewat pintu ini.
 */

/**
 * Apakah rinciannya terlihat sekarang? — diangkat keluar dari komponen supaya
 * bisa diuji tanpa merender apa pun.
 *
 * Proyek ini menguji logika murni, bukan DOM (nol `@testing-library` di
 * `package.json`), jadi keputusan yang layak dikunci tes harus bisa dipanggil
 * sebagai fungsi. Yang dikunci di sini: `full` SELALU terbuka — `defaultOpen`
 * maupun klik tidak bisa menutupnya — sementara `compact` mengikuti state.
 */
export function isDetailVisible(
  variant: 'full' | 'compact',
  isOpen: boolean,
): boolean {
  return variant === 'full' ? true : isOpen;
}

export interface CostBreakdownProps {
  total: number;
  /** `null` = rincian tidak tersimpan untuk jadwal ini (order pra-PPN). */
  lines: MoneyLine[] | null;
  /** Kenapa rinciannya tidak ada, kalau memang tidak ada. */
  note?: string;
  /** Angkanya hitungan tarif hari ini, belum pernah ditagih. */
  isEstimate?: boolean;
  /**
   * `'full'`    — selalu terbuka, tanpa tombol. Untuk Ringkasan, tempat angkanya
   *               MASIH BISA DIUBAH (durasi, hadiah, voucher) sehingga rincian
   *               penuh memang yang sedang diputuskan.
   * `'compact'` — total dulu, rincian atas permintaan. Untuk halaman jadwal,
   *               tempat harganya sudah ditetapkan dan yang diputuskan TANGGAL;
   *               rincian penuh di sana cuma bersaing dengan kalender.
   */
  variant?: 'full' | 'compact';
  /**
   * Buka rincian sejak awal meski `compact`.
   *
   * ⚠️ WAJIB `true` untuk PERPANJANGAN: tidak ada Ringkasan di belakangnya,
   * jadi layar jadwal satu-satunya tempat harga pernah muncul sama sekali.
   */
  defaultOpen?: boolean;
  /** Label total. Bawaannya `totalPaymentLabel`. */
  totalLabel?: string | null;
  /**
   * Redam warnanya — untuk jadwal yang sudah tidak aktif (dibatalkan, terlewat).
   *
   * ⚠️ Bukan sekadar estetika: total yang tetap biru-aktif pada jadwal batal
   * membuatnya terbaca seperti tagihan berjalan. `SchedulePhase` sudah
   * meredam SELURUH isi kartunya lewat `valueTone(muted)`; kalau angka ini
   * tidak ikut, ia jadi satu-satunya yang menyala di kartu yang mati.
   */
  muted?: boolean;
  className?: string;
}

/**
 * Tanggal `YYYY-MM-DD` di variabel i18n → "30 Nov 2026" / "30 Des 2026".
 *
 * `scheduleMoney` modul murni tanpa bahasa, jadi ia mengirim tanggal mentah;
 * yang tahu bahasanya komponen ini. Kalender WIB: tanggalnya dibaca sebagai
 * tanggal kalender, bukan instan, supaya tidak bergeser sehari di zona lain.
 */
export function localizeDateVars(
  vars: Record<string, string | number> | undefined,
  language: string,
): Record<string, string | number> | undefined {
  if (!vars) return vars;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(vars)) {
    const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
    out[k] = m
      ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'id-ID', {
          day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
        }).format(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
      : v;
  }
  return out;
}

/** Satu baris rincian — bentuknya identik di kedua varian, sengaja. */
function BreakdownLine({ line }: { line: MoneyLine }) {
  const { t, language } = useLanguage();
  /*
    ⚠️ Kunci i18n diutamakan di atas teks siap-pakai. `scheduleMoney` dan
    `orderMoneyLines` adalah modul murni tanpa konteks React, jadi mereka tidak
    bisa memanggil `t()` sendiri — akibatnya seluruh label biaya dulu tercetak
    Indonesia juga di mode Inggris. `label` tetap jadi cadangan supaya pemanggil
    lama tidak pecah.
  */
  const label = line.labelKey ? t(line.labelKey as never, line.labelVars) : line.label;
  const hint = line.hintKey ? t(line.hintKey as never, localizeDateVars(line.hintVars, language)) : line.hint;
  return (
    /* Baris rangkuman (Subtotal/DPP) diberi garis pemisah di ATASnya: ia
       merangkum baris sebelumnya, bukan menambah biaya baru. Tanpa pemisah
       itu kolomnya terbaca seperti daftar yang bisa dijumlah — dan
       menjumlahkannya menghitung ganda. */
    <div className={`flex justify-between items-center gap-3 text-sm ${
      line.isSubtotal ? 'border-t border-slate-200/90 pt-2.5 mt-1.5' : ''
    }`}>
      <span className="min-w-0 text-slate-700">
        {line.tone === 'addon' ? (
          <span className="inline-flex items-center gap-1 font-medium">
            <Zap className="w-4 h-4 fill-amber-500 text-amber-500 shrink-0" /> {label}
          </span>
        ) : (
          <span className="font-medium">{label}</span>
        )}
        {hint && line.kind !== 'intro' && (
          <span className="text-xs sm:text-[13px] text-slate-500 font-normal"> ({hint})</span>
        )}
      </span>
      {/* ⚠️ -700, bukan -600. Pada latar `slate-50/70` varian 600 terukur
          3,60:1 (emerald) dan 3,04:1 (amber) — gagal ambang teks 4,5:1, dan ini
          justru angka yang paling penting dibaca benar. */}
      <span className={`font-semibold shrink-0 tabular-nums text-sm sm:text-base ${
        line.tone === 'discount' ? 'text-emerald-700'
          : line.tone === 'addon' ? 'text-amber-700'
            : 'text-slate-900'
      }`}>
        {line.amount < 0 ? `-${formatIDR(Math.abs(line.amount))}` : formatIDR(line.amount)}
      </span>
    </div>
  );
}

/**
 * Hemat yang diklaim chip — VOUCHER saja.
 *
 * ⚠️ Baris "Harga perkenalan" (`kind: 'intro'`) SENGAJA dikeluarkan
 * (keputusan 29 Sep 2026). Di Okt–Nov harga efektifnya persis harga lama;
 * menulis "Kamu hemat Rp400.000" terhadap harga katalog yang belum pernah
 * ditagih terbaca seperti harga coret palsu. Tanggal berakhirnya disebut
 * sekali, sebagai kalimat di bawah total, bukan chip promo.
 */
export function savingOf(lines: MoneyLine[] | null): number {
  return (lines ?? [])
    .filter((l) => l.tone === 'discount' && l.kind !== 'intro')
    .reduce((sum, l) => sum + Math.abs(l.amount), 0);
}

/** Tanggal akhir harga perkenalan di rincian ini, kalau ada. */
export function introUntilOf(lines: MoneyLine[] | null): string | null {
  const intro = (lines ?? []).find((l) => l.kind === 'intro');
  const date = intro?.hintVars?.date;
  return typeof date === 'string' ? date : null;
}

export function CostBreakdown({
  total,
  lines,
  note,
  isEstimate = false,
  variant = 'compact',
  defaultOpen = false,
  totalLabel,
  muted = false,
  className = '',
}: CostBreakdownProps) {
  const { t, language } = useLanguage();
  // `full` tidak punya tombol, jadi state-nya tidak pernah dibaca di sana.
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const detailId = useId();

  const hasDetail = !!(lines || note);

  /*
    Diskon dibingkai sebagai KEUNTUNGAN, bukan cuma pengurangan.

    ⚠️ Terukur di produksi: Rp 1.500.000 dengan voucher −Rp 1.499.000 membuat
    total Rp 1.110. Berdampingan, angka itu terbaca seperti BUG, dan respons
    rasional terhadap "harganya kelihatan rusak" adalah berhenti dan bertanya ke
    admin — tepat di depan tombol yang melahirkan tagihan. Satu kalimat
    menjadikannya kabar baik, bukan kesalahan sistem.
  */
  const saving = savingOf(lines);
  const introUntil = introUntilOf(lines);
  const showDetail = isDetailVisible(variant, isOpen);

  const detail = hasDetail && showDetail && (
    <div id={detailId} className="rounded-xl border border-slate-200/90 bg-white sm:bg-slate-50/80 p-3.5 sm:p-4 space-y-2.5 sm:space-y-3 text-sm font-normal text-slate-700 shadow-2xs">
      {lines
        ? lines.map((line, i) => <BreakdownLine key={`${line.label}-${i}`} line={line} />)
        : <p className="leading-relaxed text-sm text-slate-600">{note}</p>}
    </div>
  );

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Label bisa dimatikan (`totalLabel: null`) untuk pemanggil yang sudah
            punya labelnya sendiri — kartu jadwal memakai kolom kiri `RowGrid`. */}
        {totalLabel !== null && (
          <span className="text-sm font-semibold text-slate-800">
            {totalLabel ?? t('totalPaymentLabel')}
          </span>
        )}
        <div className="flex items-center gap-2.5">
          <span className={`text-lg sm:text-xl font-bold tabular-nums ${muted ? 'text-slate-400' : 'text-jfu-primary'}`}>
            {formatIDR(total)}
          </span>
          {/* Tombol hanya untuk `compact` — di `full` rinciannya memang selalu
              terbuka, jadi tombol yang tidak pernah menutup apa pun cuma bising. */}
          {variant === 'compact' && hasDetail && (
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              aria-expanded={isOpen}
              /* `aria-controls` menunjuk panel yang dibuka — tanpa itu
                 hubungannya tidak bisa ditentukan secara programatik. */
              aria-controls={detailId}
              className="inline-flex shrink-0 items-center gap-1 min-h-10 px-2 text-sm font-medium text-slate-600 hover:text-jfu-primary transition-colors rounded-lg hover:bg-slate-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 cursor-pointer"
            >
              <span>{isOpen ? t('hideCostBreakdown') : t('viewCostBreakdown')}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>


      {introUntil && (
        <p className={`text-xs sm:text-[13px] leading-relaxed ${muted ? 'text-slate-400' : 'text-slate-600'}`}>
          {t('costIntroLockNote', localizeDateVars({ date: introUntil }, language))}
        </p>
      )}

      {saving > 0 && (
        <p className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-800">
          <Tag className="w-3.5 h-3.5 shrink-0" />
          {t('costSavingLabel')} {formatIDR(saving)}
        </p>
      )}

      {detail}
    </div>
  );
}
