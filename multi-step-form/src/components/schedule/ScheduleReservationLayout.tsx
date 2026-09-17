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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-16">
      {/*
        Jalan keluar berdiri DI LUAR kartu: ia menjawab "aku di mana, bagaimana
        keluar" — pertanyaan yang muncul sebelum isinya dibaca, dan bukan bagian
        dari tugasnya.
      */}
      <button
        type="button"
        onClick={onBack}
        disabled={isBusy}
        className="inline-flex items-center gap-2 -ml-2 mb-4 px-2 py-2 rounded-lg text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </button>

      {/*
        ⚠️ SATU KARTU, BUKAN TUMPUKAN SIBLING.

        Versi sebelumnya menumpuk judul, panel hold, kalender, dan total sebagai
        saudara `space-y-4` langsung di atas latar halaman. Hanya kalender yang
        punya kartu, jadi layar terbaca sebagai judul nyasar + satu panel + baris
        harga yatim — bukan satu tugas yang utuh. Semua yang MILIK tugas ini
        hidup di dalam satu permukaan; pemisahnya garis, bukan jurang.
      */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <header className="px-5 sm:px-6 pt-5 sm:pt-6 pb-5 space-y-1">
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
          Tiap bagian dipisah GARIS, bukan jarak — di dalam satu kartu, garis
          membaca sebagai "bagian berikutnya dari hal yang sama", sementara
          jarak membaca sebagai "hal lain".
        */}
        {duration && (
          <section className="px-5 sm:px-6 py-5 border-t border-slate-100">{duration}</section>
        )}

        <section className="px-5 sm:px-6 py-5 border-t border-slate-100">
          {calendar}
        </section>

        {reward && (
          <section className="px-5 sm:px-6 py-5 border-t border-slate-100">{reward}</section>
        )}

        {/*
          Harga dan tombolnya BERBAGI satu blok berlatar, dan blok itu menutup
          kartu. Peneliti tidak boleh harus memindai ke tempat lain untuk melihat
          angka yang sedang ia setujui.
        */}
        <div className="px-5 sm:px-6 py-5 border-t border-slate-200 bg-slate-50/70 space-y-3">
          {cost}

          {/*
            ⚠️ KONSEKUENSI BERDIRI TEPAT DI ATAS PENYEBABNYA.

            Dulu catatan ini ada di kepala halaman, dibaca sebelum ia berarti
            apa-apa lalu terlupakan saat peneliti sampai ke tombol. Menekan
            tombol di bawahnya melahirkan tagihan bersekring 60 menit, jadi di
            sinilah tempatnya.

            ⚠️ TETAP BERBOBOT. Versi paling awal layar pertama merendernya
            sebagai teks abu terkecil di halaman — lebih lemah daripada catatan
            cutoff di atasnya — dan itu justru cacat yang kritik tandai. Ikon +
            warna merek menahannya tetap terbaca sebagai pemberitahuan, bukan
            cetakan kecil.
          */}
          <p className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
            <Clock className="w-4 h-4 text-jfu-primary shrink-0 mt-0.5" />
            <span>{t('scheduleHoldHint')}</span>
          </p>

          <div aria-live="polite" className="empty:hidden">{blockedReason}</div>
          {cta}
        </div>
      </div>
    </div>
  );
}
