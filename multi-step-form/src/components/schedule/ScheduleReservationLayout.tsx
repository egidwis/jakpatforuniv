import type { ReactNode } from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

/**
 * Kerangka layar "pilih tanggal tayang" dan "bayar" — SATU pemilik urutan,
 * empat pengisi (wizard langkah 3, bayar order ke-1, Jadwal & Bayar per
 * jadwal, perpanjangan).
 *
 * ⚠️ KENAPA KOMPONEN, BUKAN KESEPAKATAN. Sebelum ini jadwal ke-1 dan
 * perpanjangan mengerjakan tugas yang sama lewat dua rangka berbeda, dan
 * kritik mengukur 15 divergensi: tombol kembali di ATAS judul pada satu layar
 * dan di BAWAH pada yang lain, catatan hold sebagai panel biru tebal vs
 * catatan kaki abu 12px, harga ada vs tidak ada. Komponen ini yang menegakkan
 * bentuknya; prosa di dua berkas tidak pernah bisa.
 *
 * ⚠️ DUA KOLOM, POLA LANGKAH 1–2 WIZARD (`StepCheckout`): kiri `lg:col-span-7`
 * berisi apa yang DIPILIH (durasi, kalender, hadiah), kanan `lg:col-span-5`
 * sticky berisi apa yang DISETUJUI (ringkasan, harga, konsekuensi, tombol).
 * Pindah dari pilih → bayar → waktu habis hanya mengganti ISI kolom, bukan
 * bentuk halaman — dulu satu boolean menukar seluruh kartu dan dua keadaan
 * halaman yang sama terbaca sebagai dua halaman.
 *
 * Urutan slot dikunci di sini dan tidak bisa ditawar pemanggil:
 *
 *   kembali → konteks order → judul → subjudul
 *   kiri : peringatan → durasi → tanggal → hadiah
 *   kanan: ringkasan → harga → catatan hold/countdown → alasan-terblokir
 *          → CTA → aksi sekunder
 *
 * ⚠️ DI BAWAH `lg` CTA PINDAH KE BAR BAWAH YANG MENEMPEL. Di ponsel kolom kanan
 * jatuh di bawah kalender 2×7 dan tombol bayarnya baru terlihat setelah dua
 * layar gulir — padahal countdown-nya berjalan. Bar membawa total, countdown
 * (lewat `mobileBarInfo`), dan CTA utama yang SAMA; aksi sekunder tetap di
 * kartu.
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

  /**
   * Dirender di dalam wizard, yang sudah memberi lebar & gutter sendiri
   * (`.form-content`). Tanpa ini langkah 3 menyusut 48px dibanding langkah 2
   * dan kolom kanannya bergeser tepat saat peneliti berpindah langkah.
   */
  embedded?: boolean;

  /** Banner peringatan/status kontekstual (misal: reservasi sebelumnya dilepas/dibatalkan). */
  alertBanner?: ReactNode;

  /** Panel durasi. Hanya perpanjangan memilikinya (jadwal ke-1 sudah memilih di Ringkasan). */
  duration?: ReactNode;
  /** Kalender (hidup atau beku) + catatan cutoff, atau kartu jadwal terkunci. */
  calendar: ReactNode;
  /** Panel hadiah batch baru, bila ada. */
  reward?: ReactNode;

  /** Ringkasan pesanan di kepala kolom kanan: tanggal, durasi, dsb. */
  summary?: ReactNode;
  /** Rincian biaya. WAJIB diisi keempatnya — angka yang disetujui tidak boleh hilang. */
  cost: ReactNode;
  /** Pesan penjelas sebelum tombol aksi (countdown masuk di sini). Bila tidak diisi, default ke teks hold 1 jam. Bila null, disembunyikan. */
  bottomNotice?: ReactNode | null;
  /** Kalimat kenapa tombol mati, bila mati. */
  blockedReason?: ReactNode;
  /** Tombol UTAMA (kunci / bayar). Di bawah `lg` ia tinggal di bar bawah. */
  cta: ReactNode;
  /** Aksi sekunder (cek status, batalkan). Selalu di kartu, tidak ikut ke bar. */
  secondaryActions?: ReactNode;
  /** Sisi kiri bar bawah ponsel: total, countdown. */
  mobileBarInfo?: ReactNode;
}

export function ScheduleReservationLayout({
  onBack,
  backLabel,
  isBusy = false,
  orderLabel,
  title,
  subtitle,
  embedded = false,
  alertBanner,
  duration,
  calendar,
  reward,
  summary,
  cost,
  bottomNotice,
  blockedReason,
  cta,
  secondaryActions,
  mobileBarInfo,
}: ScheduleReservationLayoutProps) {
  const { t } = useLanguage();

  /*
    ⚠️ KELAS DIPILIH MENGHINDARI `styles.css` WARISAN. Berkas itu dimuat
    SESUDAH Tailwind dan mendefinisikan `.px-4`, `.px-6`, `.py-6`, `.p-4`,
    `.gap-*`, `.text-xl`, `.border-t` (warnanya ikut!)… polos; kelas dasar itu MENGALAHKAN varian
    responsifnya sendiri (`px-4 md:px-6` merender 16px di semua lebar). Gutter
    di sini memakai nilai yang tidak dimiliki berkas itu (`px-5`, `sm:px-7`).
  */
  const wrapper = embedded ? 'pb-28 lg:pb-4' : 'max-w-5xl mx-auto px-4 sm:px-5 lg:px-6 pt-5 pb-28 lg:pb-16';

  return (
    <div className={wrapper}>
      {/*
        Jalan keluar dan judul berdiri DI LUAR kartu, sama seperti kepala
        langkah 1–2 (`OrderFormHeader`): mereka menjawab "aku di mana" sebelum
        isinya dibaca, dan bukan bagian dari tugasnya.
      */}
      <button
        type="button"
        onClick={onBack}
        disabled={isBusy}
        className="inline-flex items-center gap-2 -ml-2 mb-3 px-2 py-2 rounded-lg text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </button>

      <header className="mb-6 min-w-0 space-y-1">
        {orderLabel && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
            <span className="text-slate-400 shrink-0">{t('scheduleForOrderLabel')}</span>
            <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60 truncate">{orderLabel}</span>
          </div>
        )}
        {/* Kelas judul = `OrderFormHeader`, supaya langkah 2 → 3 tidak melompat. */}
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 leading-snug tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs md:text-sm text-slate-500 leading-relaxed">{subtitle}</p>
        )}
      </header>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* ── KIRI: yang dipilih ── */}
        <div className="lg:col-span-7 space-y-4 min-w-0">
          {alertBanner}

          {/*
            SATU KARTU untuk tugas memilih. Tiap bagian dipisah GARIS, bukan
            jarak — di dalam satu kartu, garis membaca sebagai "bagian
            berikutnya dari hal yang sama", jarak membaca sebagai "hal lain".
          */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden divide-y divide-slate-100">
            {duration && <section className="px-4 sm:px-5 py-5">{duration}</section>}
            <section className="px-4 sm:px-5 py-5">{calendar}</section>
            {reward && <section className="px-4 sm:px-5 py-5">{reward}</section>}
          </div>
        </div>

        {/* ── KANAN: yang disetujui. Sticky di desktop, seperti StepCheckout. ── */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-24 min-w-0">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden divide-y divide-slate-200">
            {summary && <div className="px-5 pt-5 pb-4">{summary}</div>}

            {/*
              Harga dan tombolnya BERBAGI satu blok berlatar. Peneliti tidak
              boleh harus memindai ke tempat lain untuk melihat angka yang
              sedang ia setujui.
            */}
            <div className="px-5 py-5 bg-slate-50/70 space-y-3.5">
              {cost}

              {/*
                ⚠️ KONSEKUENSI BERDIRI TEPAT DI ATAS PENYEBABNYA. Menekan tombol
                di bawahnya melahirkan tagihan bersekring 60 menit, jadi catatan
                hold (atau countdown-nya) tinggal di sini, bukan di kepala
                halaman tempat ia dibaca sebelum berarti apa-apa.
              */}
              {bottomNotice !== null && (
                bottomNotice ?? (
                  <div className="flex items-center gap-2.5 rounded-xl bg-blue-50/70 border border-blue-100/80 px-3.5 py-2.5 text-xs text-blue-900">
                    <Clock className="w-4 h-4 text-jfu-primary shrink-0" />
                    <span className="leading-relaxed font-medium">{t('scheduleHoldHint')}</span>
                  </div>
                )
              )}

              <div aria-live="polite" className="empty:hidden">{blockedReason}</div>
              <div className="hidden lg:block">{cta}</div>
              {secondaryActions && <div className="space-y-2.5">{secondaryActions}</div>}
            </div>
          </div>
        </div>
      </div>

      {/*
        BAR BAWAH PONSEL. Satu-satunya elemen `fixed` di halaman ini — rangka
        dashboard dan wizard tidak punya yang lain di bawah, dan toast tinggal
        di kanan atas. Ruang setinggi bar disediakan wrapper (`pb-28`).
      */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-30 border border-x-0 border-b-0 border-slate-200 bg-white/95 backdrop-blur shadow-[0_-4px_16px_-4px_rgba(15,23,42,0.08)]"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-5xl mx-auto px-4 pt-3 space-y-2.5">
          {mobileBarInfo && (
            <div className="flex items-center justify-between gap-3 text-sm">{mobileBarInfo}</div>
          )}
          {cta}
        </div>
      </div>
    </div>
  );
}
