import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import type { SurveySubmission, PaymentState, ExistingPage } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { ReserveSlotAction, PaymentAction, ExtendAction } from '../CampaignActions';
import { ReservationStatusSection } from './ReservationStatusSection';
import { CostBreakdownSection } from './CostBreakdownSection';
import { PaymentStatusSection } from './PaymentStatusSection';
import { DistributionSection } from './DistributionSection';

// ─────────────────────────────────────────────────────────────
// Tab: Jadwal & Bayar — gabungan tab Reservasi + tab Payment (Phase 3).
//
// KENAPA DIGABUNG
// Aksi utama keduanya membuka layar yang SAMA — SchedulePaymentView
// fullscreen, cuma beda initialStep. Memisahkannya jadi dua tab memaksa admin
// berpindah tab di tengah satu percakapan dengan peneliti (feedback review →
// tawarkan tanggal → tagih), padahal itu satu rute kerja yang utuh.
//
// SUSUNANNYA: semua yang DIBACA dulu, baru semua yang DIKERJAKAN. Admin
// membuka tab ini untuk menjawab "order ini sudah sampai mana", lalu bertindak.
// ─────────────────────────────────────────────────────────────

export function SchedulePaymentTab({
  submission,
  paymentData,
  existingPage,
  isScheduled,
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

  return (
    <>
      {/* ── Yang dibaca ─────────────────────────────────────── */}
      <ReservationStatusSection
        submission={submission}
        existingPage={existingPage}
        isScheduled={isScheduled}
        lifecycle={lifecycle}
      />

      <CostBreakdownSection
        submission={submission}
        paymentData={paymentData}
        onEditFormDetails={onEditFormDetails}
      />

      <PaymentStatusSection
        submission={submission}
        paymentData={paymentData}
        lifecycle={lifecycle}
      />

      {/* ── Yang dikerjakan ─────────────────────────────────── */}
      <DetailSheetSection title="Aksi">
        <ReserveSlotAction
          submission={submission}
          paymentData={paymentData}
          existingPage={existingPage}
          isScheduled={isScheduled}
          lifecycle={lifecycle}
          onOpenSchedule={onOpenSchedule}
        />
        <PaymentAction
          submission={submission}
          paymentData={paymentData}
          lifecycle={lifecycle}
          onOpenPayment={onOpenPayment}
        />
        <p className="text-[11px] text-gray-400">
          Keduanya membuka halaman Schedule &amp; Payment (fullscreen) — sama seperti flow sebelumnya.
        </p>

        {!lifecycle.isPaid && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 space-y-2">
            <p className="text-[11px] text-emerald-800 leading-snug">
              Pembayaran diterima di luar sistem (transfer manual)? Tandai submission ini sebagai lunas.
            </p>
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

      {/* Perpanjangan pindah ke sini dari tab Page. Menambah jadwal adalah
          urusan sumbu tayang, bukan sumbu halaman — pagar `!existingPage`
          yang dulu menahannya adalah bug, bukan kebijakan. */}
      <ExtendAction
        submission={submission}
        lifecycle={lifecycle}
        onExtendCreated={onExtendCreated}
      />

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
