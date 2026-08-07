import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, FileText, Loader2, PenLine } from 'lucide-react';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import { fetchAdSchedules, type AdScheduleEntry } from '@/utils/supabase';
import type { SurveySubmission, PaymentState, ExistingPage } from '../types';
import { copyToClipboard } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { ReserveSlotAction, PaymentAction, ExtendAction } from '../CampaignActions';
import { ScheduleCardList } from './ScheduleCardList';
import { DistributionSection } from './DistributionSection';

// ─────────────────────────────────────────────────────────────
// Tab: Jadwal & Bayar — gabungan tab Reservasi + tab Payment.
//
// SUBJEKNYA JADWAL, BUKAN ORDER. Isinya daftar kartu, satu per jendela tayang,
// karena itulah satuan yang punya tanggal, biaya, dan status pembayaran sendiri.
// Alasan lengkapnya di kepala ScheduleCardList.tsx.
//
// Yang tinggal DI LUAR kartu hanya yang benar-benar milik ORDER:
//   * tagihan & aksi — sampai Task 10, invoice belum bisa dikaitkan ke jadwal
//     tertentu (`transactions`/`invoices` belum punya `schedule_id`), dan
//     "Mark as Paid" melunasi SELURUH invoice order sekaligus. Menaruhnya di
//     dalam kartu akan menjanjikan presisi per-jadwal yang belum ada;
//   * jalur distribusi — properti order, bukan properti jendela tayang.
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
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const submissionId = submission.id;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchAdSchedules(submissionId)
      .then((rows) => { if (!cancelled) setSchedules(rows); })
      .catch((e) => { console.error('Gagal memuat jadwal order:', e); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [submissionId, reloadKey]);

  // Perpanjangan baru melahirkan baris cermin lewat trigger, jadi daftar di atas
  // harus ikut dimuat ulang — bukan hanya daftar order di belakang drawer.
  const handleExtendCreated = useCallback(() => {
    setReloadKey((k) => k + 1);
    onExtendCreated();
  }, [onExtendCreated]);

  return (
    <>
      <DetailSheetSection title="Jadwal">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        ) : (
          <ScheduleCardList entries={schedules} submission={submission} />
        )}

        <ExtendAction
          submission={submission}
          lifecycle={lifecycle}
          onExtendCreated={handleExtendCreated}
        />
      </DetailSheetSection>

      <DetailSheetSection
        title="Tagihan & Aksi"
        action={
          // Dulu tombol ini menempel di kepala "Detail Form & Biaya". Blok itu
          // hilang bersama penyusunan ulang, tapi affordance-nya tidak boleh
          // ikut hilang: mengubah durasi/hadiah adalah cara admin memperbaiki
          // angka yang salah SEBELUM menagih.
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
        <ReserveSlotAction
          submission={submission}
          paymentData={paymentData}
          existingPage={existingPage}
          isScheduled={lifecycle.hasValidSchedule}
          lifecycle={lifecycle}
          onOpenSchedule={onOpenSchedule}
        />
        <PaymentAction
          submission={submission}
          paymentData={paymentData}
          lifecycle={lifecycle}
          onOpenPayment={onOpenPayment}
        />

        {(paymentData.latestPaymentId || paymentData.latestPaymentUrl) && (
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 space-y-1.5 text-[11px]">
            {paymentData.latestPaymentId && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">
                  Invoice terakhir
                  {paymentData.invoiceCount > 1 && ` (dari ${paymentData.invoiceCount})`}
                </span>
                <a
                  href={`/invoices/${paymentData.latestPaymentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline inline-flex items-center gap-1 truncate"
                >
                  <FileText className="w-3 h-3 shrink-0" />
                  <span className="truncate">{paymentData.latestPaymentId}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </a>
              </div>
            )}
            {paymentData.latestPaymentUrl && !lifecycle.isPaid && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-[11px] justify-start text-amber-700 border-amber-200 bg-amber-50/60 hover:bg-amber-100"
                onClick={() => copyToClipboard(paymentData.latestPaymentUrl!, 'Payment link copied!')}
              >
                <Copy className="w-3 h-3 mr-1.5" /> Copy payment link untuk researcher
              </Button>
            )}
          </div>
        )}

        {!lifecycle.isPaid && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 space-y-2">
            <p className="text-[11px] text-emerald-800 leading-snug">
              Pembayaran diterima di luar sistem (transfer manual)? Tandai submission ini sebagai lunas.
            </p>
            {schedules.length > 1 && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-snug">
                ⚠️ Order ini punya <strong>{schedules.length} jadwal</strong>. Tombol ini melunasi
                <strong> seluruh</strong> invoice order — belum bisa per jadwal.
              </p>
            )}
            <Button
              size="sm"
              className="w-full h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setIsConfirmPaymentOpen(true)}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" /> Mark as Paid
            </Button>
          </div>
        )}
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
