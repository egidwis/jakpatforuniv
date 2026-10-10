import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { fetchFirstScheduleId } from '../utils/supabase';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * Rute lama berkunci ORDER (`/dashboard/payment/:submissionId`) — kini hanya
 * PENERJEMAH ke halaman Jadwal & Bayar berkunci jadwal ordinal 1.
 *
 * ⚠️ KENAPA TIDAK DIHAPUS. Rute ini tujuan wizard sesudah kunci tanggal,
 * Kilat "Place Order", tombol "Jadwalkan Ulang" dashboard, dan link lama yang
 * sudah beredar. Dulu ia komponen bayar kedua (countdown, penerbitan tagihan,
 * pilih ulang) yang menyimpang dari halaman per jadwal: dua layar pilih ulang
 * untuk order yang sama, pesan 14.00 yang bertentangan, harga basi di layar
 * waktu habis. Sekarang satu halaman, satu pemicu tagihan, dua alamat.
 *
 * `replace` supaya Back tidak memantul ke penerjemah ini. Query string ikut
 * (`?pilih=1` dari "Jadwalkan Ulang").
 */
export function PaymentCheckoutPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!submissionId) { setFailed(true); return; }
    let cancelled = false;
    fetchFirstScheduleId(submissionId)
      .then((id) => {
        if (cancelled) return;
        if (id) navigate(`/dashboard/jadwal/${id}${search}`, { replace: true });
        else setFailed(true);
      })
      .catch((e) => {
        console.error('Gagal menemukan jadwal order:', e);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [submissionId, search, navigate]);

  if (failed) {
    return (
      <div className="max-w-3xl mx-auto px-6 pt-24 text-center space-y-4">
        <p className="text-sm text-slate-600">{t('paymentSubmissionNotFound')}</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-jfu-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> {t('backToOrders')}
        </button>
      </div>
    );
  }

  return (
    <div className="pt-24 flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-6 h-6 animate-spin text-jfu-primary" />
    </div>
  );
}
