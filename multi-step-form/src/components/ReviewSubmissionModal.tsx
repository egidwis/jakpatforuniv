import { useEffect, useRef } from 'react';
import { CheckCircle2, ArrowRight, FileText } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAdminAway } from '../utils/operationalHolidays';

interface ReviewSubmissionModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  email: string;
  surveyTitle?: string;
  /** `form_submissions.id` order yang baru lahir — ditampilkan sebagai #bookingId. */
  orderId?: string;
  /**
   * `admin_schedule` = "Kirim Pesanan" saat reservasi mandiri ditutup (sql/125):
   * review SUDAH lolos otomatis, yang menunggu tim hanya tanggal & tagihan.
   */
  variant?: 'review' | 'admin_schedule';
}

/**
 * Serah terima jalur review manual, sesudah order TERSIMPAN.
 *
 * ⚠️ PEMBAGIAN TUGAS DENGAN RINGKASAN (keputusan 11 Okt 2026). Ringkasan
 * (`ReviewPathNotice`) sudah menjawab "jalur apa, kenapa, berapa lama" sebelum
 * peneliti menekan Kirim. Modal ini hanya menjawab "apa yang terjadi
 * sekarang" — tiga langkah, satu baris masing-masing. Jangan menambah kartu
 * penjelasan review di sini; itu yang dulu membuat info yang sama terbaca dua
 * kali dalam satu menit.
 *
 * ⚠️ TANPA FASE LOADING. Dulu modal membuka dengan 1,4 detik "Mengirim Berkas
 * Survei... sedang memverifikasi data" — palsu: modal baru dibuka SESUDAH
 * `submitOrder` berhasil, dan progres nyata sudah dibawa toast loading.
 *
 * Langkah 2 sengaja menyebut "tim menetapkan jadwal": order jalur manual tidak
 * memilih tanggal sendiri (keputusan 25 Agu 2026), sama dengan isi email
 * persetujuan (`notify-review-result.js`).
 */
export function ReviewSubmissionModal({
  isOpen,
  onConfirm,
  email,
  surveyTitle,
  orderId,
  variant = 'review',
}: ReviewSubmissionModalProps) {
  const { t } = useLanguage();
  const away = useAdminAway();
  const ctaRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) ctaRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  // Format = `bookingId` di kartu dashboard (scheduleAxes.ts), supaya cocok.
  const bookingId = orderId ? orderId.slice(0, 8).toUpperCase() : '';

  const adminSchedule = variant === 'admin_schedule';
  // Mode libur (sql/122): langkah yang menjanjikan waktu kerja tim DIGANTI
  // kalimat yang sudah memuat "setelah tim kembali" — bukan diberi catatan
  // amber terpisah di bawahnya, yang terbaca seperti dua janji yang bertabrakan.
  const steps = [
    adminSchedule
      ? t('adminScheduleModalStep1')
      : t(away ? 'reviewModalStep1Away' : 'reviewModalStep1'),
    adminSchedule
      ? t(away ? 'adminScheduleModalStep2Away' : 'adminScheduleModalStep2')
      : t('reviewModalStep2'),
    email ? t('reviewModalStep3Email', { email }) : t('reviewModalStep3'),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        className="relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.15)] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 md:p-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-600 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
            </div>
            <div>
              <h3 id="review-modal-title" className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
                {t(adminSchedule ? 'adminScheduleModalTitle' : 'reviewModalTitle')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{t(adminSchedule ? 'adminScheduleModalSubtitle' : 'reviewModalSubtitle')}</p>
            </div>

            {(surveyTitle || bookingId) && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2 text-left">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700" title={surveyTitle}>
                  {surveyTitle}
                </span>
                {bookingId && (
                  <span className="shrink-0 font-mono text-xs text-slate-500">#{bookingId}</span>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-900 mb-3">{t('reviewModalNextSteps')}</p>
            <ol className="space-y-0">
              {steps.map((text, i) => {
                const isLast = i === steps.length - 1;
                return (
                  <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                    {/* Garis penghubung antar-langkah. */}
                    {!isLast && (
                      <span className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200" aria-hidden="true" />
                    )}
                    <span
                      className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${i === 0
                        ? 'bg-jfu-primary text-white'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                    >
                      {i + 1}
                    </span>
                    <span className={`pt-0.5 text-xs leading-relaxed ${i === 0 ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                      {text}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <button
            ref={ctaRef}
            type="button"
            onClick={onConfirm}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-jfu-primary/20 hover:shadow-lg hover:shadow-jfu-primary/30 active:scale-[0.99] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2"
          >
            <span>{t('reviewModalCta')}</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
