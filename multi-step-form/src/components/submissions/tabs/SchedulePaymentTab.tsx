import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, PenLine } from 'lucide-react';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import {
  fetchAdSchedules, fetchSchedulePayments,
  type AdScheduleEntry, type SchedulePayment,
} from '@/utils/supabase';
import type { SurveySubmission, PaymentState, ExistingPage } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { ExtendAction } from '../CampaignActions';
import { ScheduleCardList } from './ScheduleCardList';
import { DistributionSection } from './DistributionSection';

// ─────────────────────────────────────────────────────────────
// Tab: Jadwal & Bayar.
//
// SUBJEKNYA JADWAL, dan PEMBAYARAN ADA DI DALAM KARTU JADWAL — keduanya satu
// kesatuan, karena yang dibayar adalah jendela tayang tertentu, bukan "order".
//
// Yang tersisa di luar kartu tinggal dua, dan keduanya memang milik ORDER:
// jalur distribusi, dan tombol menambah jadwal. Blok "Tagihan & Aksi" yang
// sempat berdiri sendiri di sini sudah dibubarkan ke dalam kartu.
// ─────────────────────────────────────────────────────────────

export function SchedulePaymentTab({
  submission,
  paymentData,
  existingPage,
  lifecycle,
  onOpenSchedule,
  onOpenPayment,
  onPaymentStatusChange,
  onEditFormDetails,
  onConvertDistribution,
  onExtendCreated,
}: {
  submission: SurveySubmission;
  paymentData: PaymentState;
  existingPage?: ExistingPage;
  isScheduled: boolean;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onOpenSchedule: (submission: SurveySubmission) => void;
  onOpenPayment: (submission: SurveySubmission) => void;
  onPaymentStatusChange: (submissionId: string, newStatus: string) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
  onConvertDistribution: (submission: SurveySubmission, target: 'regular' | 'kilat') => Promise<void>;
  onExtendCreated: () => void;
}) {
  const [isConfirmPaymentOpen, setIsConfirmPaymentOpen] = useState(false);
  const [schedules, setSchedules] = useState<AdScheduleEntry[]>([]);
  const [payments, setPayments] = useState<Map<string, SchedulePayment>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const submissionId = submission.id;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const rows = await fetchAdSchedules(submissionId);
        const pay = await fetchSchedulePayments(submissionId, rows);
        if (!cancelled) { setSchedules(rows); setPayments(pay); }
      } catch (e) {
        console.error('Gagal memuat jadwal order:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Jadwal baru melahirkan baris cermin lewat trigger, jadi daftar di atas harus
  // ikut dimuat ulang — bukan hanya daftar order di belakang drawer.
  const handleExtendCreated = useCallback(() => {
    reload();
    onExtendCreated();
  }, [reload, onExtendCreated]);

  // ⚠️ `updatePaymentStatus` masih melunasi SELURUH invoice order (menyaring
  // `form_submission_id` saja). Untuk order berjadwal SATU itu tidak berbeda —
  // "semua tagihan order" persis sama dengan "tagihan jadwal ini" — jadi
  // tombolnya boleh masuk kartu. Untuk order berjadwal banyak ia akan berbohong,
  // jadi tombolnya pindah ke luar beserta peringatan cakupannya. Penyempitan ke
  // `schedule_id` ada di Task 11.
  const isSingleSchedule = schedules.length === 1;
  const canMarkPaidInCard = isSingleSchedule && !lifecycle.isPaid;

  return (
    <>
      <DetailSheetSection
        title="Jadwal"
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-500 hover:text-blue-600"
            onClick={() => onEditFormDetails(submission)}
          >
            <PenLine className="w-3 h-3 mr-1" /> Edit form
          </Button>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        ) : (
          <ScheduleCardList
            entries={schedules}
            payments={payments}
            submission={submission}
            onOpenSchedule={() => onOpenSchedule(submission)}
            onOpenPayment={() => onOpenPayment(submission)}
            onMarkPaid={canMarkPaidInCard ? () => setIsConfirmPaymentOpen(true) : null}
          />
        )}

        <ExtendAction
          submission={submission}
          lifecycle={lifecycle}
          onExtendCreated={handleExtendCreated}
        />

        {!isSingleSchedule && !lifecycle.isPaid && schedules.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 space-y-2">
            <p className="text-[11px] text-amber-900 leading-snug">
              Order ini punya <strong>{schedules.length} jadwal</strong>. Tombol di bawah melunasi
              <strong> seluruh</strong> tagihan order sekaligus — belum bisa per jadwal, jadi ia
              sengaja tidak ditaruh di dalam kartu.
            </p>
            <Button
              size="sm"
              className="w-full h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setIsConfirmPaymentOpen(true)}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" /> Tandai seluruh order lunas
            </Button>
          </div>
        )}

        {/* Order tanpa satu pun jadwal tetap butuh jalan masuk ke Mark as Paid —
            tapi itu persis "pembayaran yatim" yang Task 10 ada untuk menutup,
            jadi tidak diberi jalan pintas baru di sini. */}
      </DetailSheetSection>

      <DistributionSection
        submission={submission}
        paymentData={paymentData}
        existingPage={existingPage}
        lifecycle={lifecycle}
        onConvertDistribution={onConvertDistribution}
      />

      <Dialog open={isConfirmPaymentOpen} onOpenChange={setIsConfirmPaymentOpen}>
        <DialogContent
          className="sm:max-w-[360px] p-6 text-center"
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <DialogHeader className="space-y-1 text-center sm:text-center">
            <DialogTitle className="text-base font-bold text-gray-900 leading-snug">
              Tandai Submission Sebagai Lunas?
            </DialogTitle>
            <DialogDescription className="text-xs text-amber-600 font-semibold leading-relaxed">
              Pastikan dana transfer manual benar-benar sudah diterima.
            </DialogDescription>
          </DialogHeader>

          <div className="text-[11px] text-gray-500 bg-slate-50/80 border border-slate-100 rounded-lg p-3.5 leading-relaxed">
            Tindakan ini akan mengupdate status submission dan <span className="font-semibold text-gray-700">semua invoice/transaksi terkait menjadi lunas (paid)</span>.
          </div>

          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => setIsConfirmPaymentOpen(false)}
              className="text-xs font-semibold h-9 px-5 text-gray-600 border-gray-200 hover:bg-gray-50"
            >
              Batal
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-9 px-5"
              onClick={() => {
                onPaymentStatusChange(submission.id, 'paid');
                setIsConfirmPaymentOpen(false);
                reload();
              }}
            >
              Ya, Tandai Lunas
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
