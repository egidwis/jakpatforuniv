import type { ReactNode } from 'react';
import { AlertCircle, ArrowLeft, CreditCard, Info, Lock, Pencil } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { SectionLabel } from '../SurveyFieldRow';
import { PAY_NEEDS_LOCK, barCtaSource } from '../../utils/reservationTicket';
import type { LockFeedbackState } from './useLockFeedback';

/**
 * TIKET RESERVASI — rangka layar "pilih tanggal tayang" dan "bayar". SATU
 * pemilik urutan, empat pengisi (wizard langkah 3, Kilat, Jadwal & Bayar per
 * jadwal, perpanjangan).
 *
 * ⚠️ KENAPA KOMPONEN, BUKAN KESEPAKATAN. Sebelum ini jadwal ke-1 dan
 * perpanjangan mengerjakan tugas yang sama lewat dua rangka berbeda, dan
 * kritik mengukur 15 divergensi. Komponen ini yang menegakkan bentuknya; prosa
 * di dua berkas tidak pernah bisa.
 *
 * ⚠️ BADAN = PILIH & KUNCI, SOBEKAN = BAYAR (keputusan 12 Okt 2026). Satu
 * kartu bergaris sobek di tengah, meniru tiket Jadwal Iklan di dashboard
 * (`SchedulePhase`). Dulu tombol Kunci tinggal di kolom kanan dan mengunci
 * menukar SELURUH kolom itu (catatan hold → countdown besar, satu tombol →
 * tiga), sementara kolom kiri ikut berubah — dua kolom berganti bersamaan dan
 * transisinya terbaca patah. Kini:
 *
 *   badan  : kepala kartu [judul · pil kembali] → durasi → kalender → hadiah
 *            → ZONA KUNCI (tombol Kunci → kotak "ditahan untukmu" saat dikunci)
 *   sobekan: TicketStub (survei, tanggal, batas bayar) → harga → slot Bayar
 *            → aksi sekunder (tautan teks)
 *
 * Mengunci hanya mengganti ISI baris yang sama: tombol Kunci jadi kotak
 * ditahan, "1 jam setelah dikunci" jadi countdown, Bayar redup jadi menyala.
 *
 * ⚠️ BAYAR SEBELUM KUNCI REDUP TAPI BISA DIKLIK (`aria-disabled`, BUKAN
 * `disabled`). `disabled` menelan klik — teguran "kunci dulu" tidak akan
 * pernah muncul. Kliknya menegur di ZONA KUNCI (satu-satunya tempat galat
 * inline), menyalakan toast warning, menggulir, dan menyalakan cincin di
 * tombol Kunci. Lihat `useLockFeedback`.
 *
 * ⚠️ BAR BAWAH PONSEL (`barCtaSource`). Di bawah `lg` sobekan jatuh di bawah
 * kalender 2×7. Bar membawa SATU aksi utama: Kunci sebelum dikunci, Bayar
 * sesudahnya — di tempat yang sama. Bayar redup TIDAK pernah tampil di
 * ponsel; tombol yang sedang di bar disembunyikan dari kartu.
 *
 * ⚠️ KELAS DIPILIH MENGHINDARI `styles.css` WARISAN, yang dimuat SESUDAH
 * Tailwind dan mengalahkan varian responsif kelas-kelas polosnya:
 *   • gutter `px-5`/`py-5`, bukan `px-4 sm:px-5` (`.px-4` warisan menang)
 *   • garis sobek `border-t-2`/`lg:border-l-2`, bukan `.border-t` (warnanya ikut)
 *   • takik diposisikan OFFSET NEGATIF, bukan `top-1/2 -translate-y-1/2`
 *     (keduanya kelas warisan; translate-nya menimpa seluruh `transform`)
 *   • elemen ber-`relative` tidak pernah memakai posisi responsif
 *     (`lg:sticky` di elemen yang sama kalah oleh `.relative` warisan)
 *
 * ⚠️ `overflow-clip`, BUKAN `overflow-hidden`, di tiket. `hidden` menjadikan
 * tiket wadah gulir dan mematikan `sticky` isi sobekan. `clip` tetap memotong
 * takik jadi setengah lingkaran. (Safari < 16 mengabaikan `clip`: takik tampil
 * bulat penuh — kosmetik saja.)
 */

export type LockZone =
  /** Tombol Kunci. `hint` bawaan `scheduleHoldHint`; null = tanpa petunjuk. */
  | { kind: 'lock'; cta: ReactNode; hint?: ReactNode | null; secondary?: ReactNode }
  /** Sudah dikunci: kotak "ditahan untukmu" + petunjuk opsional. */
  | { kind: 'held'; hint?: ReactNode | null }
  /** Aksi utama yang bukan Kunci, misal "Pilih Tanggal Lain" lewat 14.00. */
  | { kind: 'action'; cta: ReactNode; hint?: ReactNode | null }
  /** Tanpa aksi — misal jalur review manual, tanggalnya milik tim. */
  | { kind: 'info'; node: ReactNode };

export type PaySlot =
  /** Belum dikunci: Bayar redup yang menegur. Desktop saja. */
  | { kind: 'needs_lock' }
  | { kind: 'ready'; cta: ReactNode }
  | { kind: 'note'; node: ReactNode }
  | { kind: 'none' };

export interface ScheduleReservationLayoutProps {
  /** Tindakan keluar. Pil di pojok kanan kepala badan tiket — tak ada varian. */
  onBack: () => void;
  backLabel: string;
  /** `edit` = kembali ke Ringkasan untuk mengubah pesanan (ikon pensil); `exit` = keluar ke My Order. */
  backKind?: 'edit' | 'exit';
  isBusy?: boolean;

  title: string;
  /** Judul badan tiket ("Pilih Tanggal Tayang", "Jadwal Tayang", …). */
  cardTitle: string;
  /**
   * Subjudul di bawah judul halaman. ⚠️ Isi di SEMUA keadaan: subjudul yang
   * baru muncul sesudah dikunci menurunkan seluruh tiket ±40px.
   */
  subtitle?: string;

  /**
   * Dirender di dalam wizard, yang sudah memberi lebar & gutter sendiri
   * (`.form-content`). Tanpa ini langkah 3 menyusut 48px dibanding langkah 2.
   */
  embedded?: boolean;

  /** Status halaman (reservasi dilepas, lewat 14.00, …). Selebar penuh DI ATAS tiket. */
  alertBanner?: ReactNode;

  /** Panel durasi. Hanya perpanjangan memilikinya (jadwal ke-1 sudah memilih di Ringkasan). */
  duration?: ReactNode;
  /** Kalender (hidup atau beku) + catatan cutoff, atau kartu jadwal terkunci. */
  calendar: ReactNode;
  /** Panel hadiah batch baru, bila ada. */
  reward?: ReactNode;

  /** Zona kunci di kaki badan. Null = tanpa zona (kredit). */
  lock: LockZone | null;
  /** Teguran zona kunci — WAJIB dari `useLockFeedback` pemanggil. */
  feedback: LockFeedbackState;

  /** Kepala sobekan — `<TicketStub/>`. */
  stub: ReactNode;
  /** Rincian biaya. WAJIB — angka yang disetujui tidak boleh hilang. */
  cost: ReactNode;
  pay: PaySlot;
  /** Tautan teks di bawah Bayar (cek status, batalkan). Selalu di kartu. */
  secondaryActions?: ReactNode;
  /** Sisi kiri bar bawah ponsel: total, countdown. */
  mobileBarInfo?: ReactNode;
}

/** Hint pasif zona kunci — teks slate berikon, BUKAN galat. */
function ZoneHint({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-slate-500 leading-relaxed">
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Takik tiket. Warnanya = LATAR HALAMAN (`bg-slate-50` = `#f8fafc`
 * `DashboardLayout`), bukan putih: tiket berdiri langsung di atas latar, jadi
 * takik putih terbaca titik, bukan potongan. Setengahnya dipotong `overflow-clip`.
 */
const NOTCH =
  'absolute z-10 w-5 h-5 rounded-full bg-slate-50 border border-slate-300 pointer-events-none';

export function ScheduleReservationLayout({
  onBack,
  backLabel,
  backKind = 'exit',
  isBusy = false,
  title,
  cardTitle,
  subtitle,
  embedded = false,
  alertBanner,
  duration,
  calendar,
  reward,
  lock,
  feedback,
  stub,
  cost,
  pay,
  secondaryActions,
  mobileBarInfo,
}: ScheduleReservationLayoutProps) {
  const { t } = useLanguage();

  const barSource = barCtaSource(lock?.kind ?? null, pay.kind);
  const barCta =
    barSource === 'lock' && lock && (lock.kind === 'lock' || lock.kind === 'action')
      ? lock.cta
      : barSource === 'pay' && pay.kind === 'ready'
        ? pay.cta
        : null;
  const hasBar = !!barCta || !!mobileBarInfo;

  const wrapper = embedded
    ? hasBar ? 'pb-28 lg:pb-4' : 'pb-4'
    : `max-w-5xl mx-auto px-4 sm:px-5 lg:px-6 pt-5 ${hasBar ? 'pb-28' : 'pb-16'} lg:pb-16`;

  const lockCtaBlock = (cta: ReactNode) => (
    // Desktop saja — di ponsel tombol yang sama tinggal di bar bawah.
    <div
      className={`hidden lg:block rounded-xl transition-shadow duration-300 ${
        feedback.nudging ? 'ring-4 ring-amber-300/80 ring-offset-2' : ''
      }`}
    >
      {cta}
    </div>
  );

  /*
    Zona yang di ponsel tak berisi apa pun: aksi utamanya pindah ke bar, tanpa
    petunjuk dan tanpa teguran (misal "Pilih Tanggal Lain" lewat 14.00, atau
    Kilat yang tak punya catatan hold). Tanpa ini ponsel melihat blok padding
    kosong bergaris di bawah kalender.
  */
  const zoneEmptyOnMobile =
    (lock?.kind === 'lock' || lock?.kind === 'action')
    && (lock.hint === undefined ? lock.kind === 'action' : !lock.hint)
    && !(lock.kind === 'lock' && lock.secondary)
    && !feedback.error;

  const zoneHint = (hint: ReactNode | null | undefined, fallback: ReactNode | null) => {
    const content = hint === undefined ? fallback : hint;
    return content ? <ZoneHint>{content}</ZoneHint> : null;
  };

  return (
    <div className={wrapper}>
      <header className="mb-6 min-w-0 space-y-1">
        {/* Kelas judul = `OrderFormHeader`, supaya langkah 2 → 3 tidak melompat. */}
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 leading-snug tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs md:text-sm text-slate-500 leading-relaxed">{subtitle}</p>
        )}
      </header>

      {alertBanner && <div className="mb-5">{alertBanner}</div>}

      <div className="relative grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] rounded-2xl border border-slate-200 bg-white shadow-sm overflow-clip">
        {/* ── BADAN: pilih & kunci ── */}
        <div className="min-w-0 divide-y divide-slate-100">
          <section className="px-5 pt-5 pb-5">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-3">
              <SectionLabel>{cardTitle}</SectionLabel>
              <button
                type="button"
                onClick={onBack}
                disabled={isBusy}
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50/60 hover:text-blue-800 border border-blue-200/80 shadow-2xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {backKind === 'edit'
                  ? <Pencil size={13} className="text-blue-600" aria-hidden="true" />
                  : <ArrowLeft size={13} className="text-blue-600" aria-hidden="true" />}
                <span>{backLabel}</span>
              </button>
            </div>
            {duration ?? calendar}
          </section>
          {duration && <section className="px-5 py-5">{calendar}</section>}
          {reward && <section className="px-5 py-5">{reward}</section>}

          {lock && (
            <section
              ref={feedback.zoneRef}
              /* scroll-margin: gulir `nearest` tidak boleh mendaratkan teguran di
                 balik navbar (atas) atau bar bawah ponsel (bawah). */
              className={`${zoneEmptyOnMobile ? 'hidden lg:block ' : ''}px-5 py-5 space-y-3 scroll-mt-24 scroll-mb-36`}
            >
              {lock.kind === 'lock' && (
                <>
                  {lockCtaBlock(lock.cta)}
                  {lock.secondary}
                  {zoneHint(lock.hint, t('scheduleHoldHint'))}
                </>
              )}
              {lock.kind === 'held' && (
                <>
                  <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-3 animate-in fade-in duration-300">
                    <Lock className="w-4 h-4 text-jfu-primary shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm font-medium text-blue-950 leading-relaxed">{t('lockedCalendarHint')}</p>
                  </div>
                  {zoneHint(lock.hint, null)}
                </>
              )}
              {lock.kind === 'action' && (
                <>
                  {lockCtaBlock(lock.cta)}
                  {zoneHint(lock.hint, null)}
                </>
              )}
              {lock.kind === 'info' && lock.node}

              {/* SATU tempat galat inline — pola "pilih metode review dulu"
                  (StepOneFormFields). Toast-nya dari kunci yang sama. */}
              {feedback.error && (
                <p role="alert" className="flex items-start gap-1.5 text-xs font-medium leading-relaxed text-rose-600">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{t(feedback.error.key)}</span>
                </p>
              )}
            </section>
          )}
        </div>

        {/* ── SOBEKAN: bayar ── */}
        <aside className="relative min-w-0 bg-slate-50/60 border-t-2 border-dashed border-slate-200 lg:border-t-0 lg:border-l-2">
          {/* Takik A: tepi kiri garis sobek (ponsel) / tepi atas (desktop). */}
          <span className={`${NOTCH} -top-2.5 -left-2.5`} aria-hidden="true" />
          {/* Takik B: tepi kanan (ponsel) / tepi bawah (desktop). */}
          <span
            className={`${NOTCH} -top-2.5 -right-2.5 lg:top-auto lg:right-auto lg:-bottom-2.5 lg:-left-2.5`}
            aria-hidden="true"
          />

          {/* Sticky di elemen DALAM — `aside` memegang `relative` untuk takik. */}
          <div className="px-5 py-5 space-y-5 lg:sticky lg:top-24">
            {stub}
            {cost}

            {pay.kind === 'needs_lock' && (
              <button
                type="button"
                aria-disabled="true"
                onClick={() => feedback.report(PAY_NEEDS_LOCK, { scroll: true, nudge: true })}
                className="hidden lg:inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary/45 px-6 py-3 text-sm font-semibold text-white cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2"
              >
                <CreditCard size={16} aria-hidden="true" /> {t('payNow')}
              </button>
            )}
            {pay.kind === 'ready' && (
              // Disembunyikan di ponsel HANYA bila tombol yang sama sedang di bar —
              // "Tetap bayar" lewat 14.00 tetap terlihat di kartu.
              <div className={barSource === 'pay' ? 'hidden lg:block' : undefined}>{pay.cta}</div>
            )}
            {pay.kind === 'note' && pay.node}

            {secondaryActions && (
              <div className="flex flex-col items-center gap-2.5 text-center">{secondaryActions}</div>
            )}
          </div>
        </aside>
      </div>

      {/*
        BAR BAWAH PONSEL. Satu-satunya elemen `fixed` di halaman ini. Ruang
        setinggi bar disediakan wrapper (`pb-28`) — hanya bila barnya ada.
      */}
      {hasBar && (
        <div
          className="lg:hidden fixed inset-x-0 bottom-0 z-30 border border-x-0 border-b-0 border-slate-200 bg-white/95 backdrop-blur shadow-[0_-4px_16px_-4px_rgba(15,23,42,0.08)]"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-5xl mx-auto px-4 pt-3 space-y-2.5">
            {mobileBarInfo && (
              <div className="flex items-center justify-between gap-3 text-sm">{mobileBarInfo}</div>
            )}
            {barCta}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tiket yang sedang dimuat — bingkai yang SAMA, blok berdenyut. Menggantikan
 * spinner di tengah layar: wizard → kunci → bayar terbaca satu tiket yang
 * sedang terisi, bukan tiga halaman.
 */
export function TicketSkeleton({ embedded = false }: { embedded?: boolean }) {
  const bar = 'rounded bg-slate-200/80';
  return (
    <div
      className={embedded ? 'pb-4' : 'max-w-5xl mx-auto px-4 sm:px-5 lg:px-6 pt-5 pb-16'}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-6 space-y-2 animate-pulse">
        <div className={`${bar} h-6 w-48`} />
        <div className={`${bar} h-3.5 w-72 max-w-full`} />
      </div>
      <div className="relative grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] rounded-2xl border border-slate-200 bg-white shadow-sm overflow-clip">
        <div className="px-5 py-5 animate-pulse">
          <div className={`${bar} h-4 w-40 mb-5`} />
          <div className="grid grid-cols-4 md:grid-cols-7" style={{ gap: '0.75rem' }}>
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="h-[76px] rounded-2xl border border-slate-200 bg-slate-50" />
            ))}
          </div>
          <div className={`${bar} h-11 w-full mt-6 hidden lg:block`} />
        </div>
        <aside className="relative bg-slate-50/60 border-t-2 border-dashed border-slate-200 lg:border-t-0 lg:border-l-2">
          <span className={`${NOTCH} -top-2.5 -left-2.5`} aria-hidden="true" />
          <span className={`${NOTCH} -top-2.5 -right-2.5 lg:top-auto lg:right-auto lg:-bottom-2.5 lg:-left-2.5`} aria-hidden="true" />
          <div className="px-5 py-5 space-y-4 animate-pulse">
            <div className={`${bar} h-4 w-3/4`} />
            <div className={`${bar} h-3 w-1/3`} />
            <div className={`${bar} h-10 w-full`} />
            <div className={`${bar} h-10 w-full`} />
            <div className={`${bar} h-11 w-full`} />
          </div>
        </aside>
      </div>
    </div>
  );
}
