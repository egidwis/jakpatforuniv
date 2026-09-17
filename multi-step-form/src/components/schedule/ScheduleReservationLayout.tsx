import type { ReactNode } from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

/**
 * Kerangka layar "pilih tanggal tayang" — SATU pemilik urutan, dua pengisi.
 *
 * ⚠️ KENAPA KOMPONEN, BUKAN KESEPAKATAN. Sebelum ini jadwal ke-1 dan
 * perpanjangan mengerjakan tugas yang sama lewat dua rangka berbeda, dan
 * kritik mengukur 15 divergensi: tombol kembali di ATAS judul pada satu layar
 * dan di BAWAH pada yang lain, catatan hold sebagai panel biru tebal vs
 * catatan kaki abu 12px, harga ada vs tidak ada.
 *
 * Sebabnya kepemilikan, bukan gaya: judulnya dirender induk (`MultiStepForm`)
 * sementara tombol kembalinya dirender anak (`StepSchedule`), jadi anak
 * MUSTAHIL menempatkan diri di atas header induk. Dua komentar di kedua berkas
 * sama-sama menyatakan niat "bentuknya harus sama" — dan prosa bukan penegak
 * invarian. Komponen ini yang menegakkannya.
 *
 * Urutan slot dikunci di sini dan tidak bisa ditawar pemanggil:
 *
 *   kembali → konteks order → judul → subjudul → catatan hold
 *   → durasi → tanggal → harga → alasan-terblokir → CTA
 *
 * ⚠️ Catatan hold BUKAN opsional dan BUKAN catatan kaki. Menekan tombol di
 * bawahnya melahirkan tagihan bersekring 60 menit; kritik menemukan layar
 * pertama merendernya sebagai teks abu terkecil di halaman — lebih lemah
 * daripada catatan cutoff di atasnya. Di sini ia panel, sama untuk kedua layar.
 */
export interface ScheduleReservationLayoutProps {
  /** Tindakan keluar. Selalu di ATAS judul — tak ada varian. */
  onBack: () => void;
  backLabel: string;
  isBusy?: boolean;

  /** Survei yang sedang dijadwalkan. Peneliti bisa punya beberapa order. */
  orderLabel?: string;
  title: string;
  subtitle?: string;

  /** Panel durasi. Hanya perpanjangan memilikinya (jadwal ke-1 sudah memilih di Ringkasan). */
  duration?: ReactNode;
  /** Kalender + catatan cutoff. */
  calendar: ReactNode;
  /** Panel hadiah batch baru, bila ada. */
  reward?: ReactNode;
  /** Rincian biaya. WAJIB diisi keduanya — lihat catatan di bawah. */
  cost: ReactNode;
  /** Kalimat kenapa tombol mati, bila mati. */
  blockedReason?: ReactNode;
  /** Tombol kunci. */
  cta: ReactNode;
}

export function ScheduleReservationLayout({
  onBack,
  backLabel,
  isBusy = false,
  orderLabel,
  title,
  subtitle,
  duration,
  calendar,
  reward,
  cost,
  blockedReason,
  cta,
}: ScheduleReservationLayoutProps) {
  const { t } = useLanguage();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-12 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/*
        Jalan keluar SELALU di sini — menjawab "aku di mana, bagaimana keluar",
        pertanyaan yang muncul sebelum isinya dibaca.
      */}
      <button
        type="button"
        onClick={onBack}
        disabled={isBusy}
        className="inline-flex items-center gap-2 -ml-1 px-2 py-2 rounded-lg text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </button>

      <header className="space-y-1">
        {orderLabel && (
          <p className="text-sm text-slate-500">
            <span className="text-slate-400">{t('scheduleForOrderLabel')} </span>
            <span className="font-medium text-slate-600">{orderLabel}</span>
          </p>
        )}
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 leading-snug tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-slate-500 leading-relaxed">{subtitle}</p>
        )}
      </header>

      {/*
        ⚠️ KONSEKUENSI DINYATAKAN SEBELUM TERJADI, dengan bobot yang sepadan.
        Identik di kedua layar — inilah yang dulu berbeda paling tajam.
      */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
        <Clock className="w-4 h-4 text-jfu-primary shrink-0 mt-0.5" />
        <p className="text-sm text-blue-900 leading-relaxed">{t('scheduleHoldHint')}</p>
      </div>

      {duration}
      {calendar}
      {reward}
      {cost}

      {/*
        CTA dan alasannya menempel: sebuah tombol mati yang tidak menyebutkan
        sebabnya adalah jalan buntu. `aria-live` supaya pembaca layar ikut
        mendengar saat sebabnya berubah.
      */}
      <div className="space-y-2">
        <div aria-live="polite">{blockedReason}</div>
        {cta}
      </div>
    </div>
  );
}
