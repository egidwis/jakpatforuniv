import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, Mail, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';

interface ReviewSubmissionModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  email: string;
  surveyTitle?: string;
}

export function ReviewSubmissionModal({
  isOpen,
  onConfirm,
  email,
  surveyTitle,
}: ReviewSubmissionModalProps) {
  const [phase, setPhase] = useState<'loading' | 'success'>('loading');

  useEffect(() => {
    if (isOpen) {
      setPhase('loading');
      const timer = setTimeout(() => {
        setPhase('success');
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden transition-all duration-300 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'loading' ? (
          /* LOADING GIMMICK PHASE - JAKPAT BLUE BRAND */
          <div className="p-8 text-center space-y-6">
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-jfu-sky/20 animate-ping opacity-75" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-jfu-primary via-jfu-sky to-jfu-light text-white flex items-center justify-center shadow-lg shadow-jfu-primary/25">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                Mengirim Berkas Survei...
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                Sedang memverifikasi data dan mendaftarkan pengajuan survei ke antrean review tim Jakpat.
              </p>
            </div>

            {/* Indeterminate Progress Bar - Jakpat Gradient */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-jfu-primary via-jfu-sky to-jfu-light rounded-full animate-pulse w-3/4 mx-auto" />
            </div>
          </div>
        ) : (
          /* SUCCESS & CONFIRMATION PHASE */
          <div className="p-6 md:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-300">
            {/* Top Icon */}
            <div className="text-center space-y-3">
              <div className="relative w-16 h-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-600 flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-9 h-9 animate-in zoom-in-50 duration-300" />
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
                  Order Berhasil Dikirim
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Pengajuan iklan kamu sudah masuk ke antrean verifikasi tim Jakpat.
                </p>
              </div>
            </div>

            {/* Survey Title Pill (if available) */}
            {surveyTitle && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2 text-center">
                <p className="text-xs font-semibold text-slate-700 truncate max-w-xs mx-auto">
                  📄 {surveyTitle}
                </p>
              </div>
            )}

            {/* Explanatory Info Cards */}
            <div className="space-y-2.5">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/70 text-slate-700">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-jfu-primary shrink-0 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="text-xs leading-relaxed">
                  <span className="font-bold text-slate-900 block mb-0.5">Maksimal 2 Hari Kerja</span>
                  Tim kami memeriksa surveimu maksimal 2 hari kerja untuk memastikan kesesuaian di platform kami.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 text-slate-700">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="text-xs leading-relaxed">
                  <span className="font-bold text-slate-900 block mb-0.5">Belum Ada Pembayaran Sekarang</span>
                  Kami kabari lewat email begitu tagihan siap dan survei telah disetujui.
                </div>
              </div>
            </div>

            {/* Email Notification Chip */}
            {email && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 bg-slate-50 py-2 px-3 rounded-xl border border-slate-100">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">
                  Kabar selanjutnya dikirim ke: <strong className="text-slate-800 font-semibold">{email}</strong>
                </span>
              </div>
            )}

            {/* Action CTA Button */}
            <button
              type="button"
              onClick={onConfirm}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-jfu-primary/20 hover:shadow-lg hover:shadow-jfu-primary/30 active:scale-[0.99] transition-all cursor-pointer"
            >
              <span>Kembali ke Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
