import { useState } from 'react';
import { Check, Copy, ExternalLink, FileText, PenLine, Zap } from 'lucide-react';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import { calculateTotalAdCost, calculateIncentiveCost, calculateDiscount, calculateAdCostPerDay, calculatePpn, getKilatAddonCost } from '../../../utils/cost-calculator';
import { cn } from '@/lib/utils';
import type { SurveySubmission, PaymentState } from '../types';
import { copyToClipboard } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { PaymentAction } from '../CampaignActions';

// ─────────────────────────────────────────────────────────────
// Tab: Payment — status, copy link, create payment, Mark as Paid
// ─────────────────────────────────────────────────────────────

export function PaymentTab({
  submission,
  paymentData,
  lifecycle,
  onOpenPayment,
  onPaymentStatusChange,
  onEditFormDetails,
}: {
  submission: SurveySubmission;
  paymentData: PaymentState;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onOpenPayment: (submission: SurveySubmission) => void;
  onPaymentStatusChange: (submissionId: string, newStatus: string) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
}) {
  const [isConfirmPaymentOpen, setIsConfirmPaymentOpen] = useState(false);
  const isKilat = submission.distribution_type === 'kilat';
  const incentiveCost = calculateIncentiveCost(submission.winnerCount || 0, submission.prize_per_winner || 0);

  // Kilat: base rate 1× (durasi tidak berlaku — selesai dalam ~2 jam), ditambah
  // add-on, tanpa diskon voucher. Rumus yang sama dipakai invoice admin dan
  // functions/api/doku/create-payment.js. Tanpa cabang ini, estimasi di sini
  // menampilkan harga regular untuk order Kilat — angka yang tidak pernah ditagih.
  const adCost = isKilat
    ? calculateAdCostPerDay(submission.questionCount || 0)
    : calculateTotalAdCost(submission.questionCount || 0, submission.duration || 0);
  const kilatAddon = isKilat ? getKilatAddonCost(submission.voucher_code) : 0;
  const discount = isKilat
    ? 0
    : calculateDiscount(submission.voucher_code, adCost, incentiveCost, submission.duration || 0);
  const finalAdCost = adCost - discount + kilatAddon;
  const subtotal = finalAdCost + incentiveCost;
  const ppn = calculatePpn(subtotal);
  const grandTotal = subtotal + ppn;

  return (
    <>
      <DetailSheetSection
        title="Detail Form & Biaya"
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-500 hover:text-blue-600"
            onClick={() => onEditFormDetails(submission)}
          >
            <PenLine className="w-3 h-3 mr-1" /> Edit
          </Button>
        }
      >
        {isKilat || (submission.duration && submission.duration > 0) ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">
                Ad cost <span className="text-[10px] text-gray-400 font-normal">({submission.questionCount} Qs | Rp {new Intl.NumberFormat('id-ID').format(calculateAdCostPerDay(submission.questionCount || 0))}{isKilat ? ' base rate' : ` x ${submission.duration} ${submission.duration === 1 ? 'day' : 'days'}`})</span>
              </span>
              <span className="font-medium text-gray-900">
                Rp {new Intl.NumberFormat('id-ID').format(adCost)}
              </span>
            </div>
            {kilatAddon > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500 flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-amber-500 text-amber-500" /> Add-on JFU Kilat
                </span>
                <span className="font-medium text-amber-600">Rp {new Intl.NumberFormat('id-ID').format(kilatAddon)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Discount ({submission.voucher_code})</span>
                <span className="font-medium text-emerald-600">-Rp {new Intl.NumberFormat('id-ID').format(discount)}</span>
              </div>
            )}
            {incentiveCost > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Incentive cost <span className="text-[10px] text-gray-400 font-normal">(Rp {new Intl.NumberFormat('id-ID').format(submission.prize_per_winner || 0)} × {submission.winnerCount || 0})</span>
                </span>
                <span className="font-medium text-gray-900">
                  Rp {new Intl.NumberFormat('id-ID').format(incentiveCost)}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-gray-200/60 mt-1 text-gray-500">
              <span>Subtotal (DPP)</span>
              <span className="font-medium text-gray-900">Rp {new Intl.NumberFormat('id-ID').format(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>PPN (11%)</span>
              <span className="font-medium text-gray-900">Rp {new Intl.NumberFormat('id-ID').format(ppn)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-gray-200 mt-1">
              <span className="text-gray-600 font-medium">Total cost</span>
              <span className="font-bold text-blue-600">
                Rp {new Intl.NumberFormat('id-ID').format(grandTotal)}
              </span>
            </div>
            {paymentData.latestPaymentId ? (
              <div className="flex justify-between items-center pt-1.5 border-t border-gray-200/60 mt-1.5 text-[11px]">
                <span className="text-gray-500">Invoice</span>
                <a
                  href={`/invoices/${paymentData.latestPaymentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" />
                  {paymentData.latestPaymentId}
                  <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                </a>
              </div>
            ) : paymentData.latestPaymentUrl ? (
              <div className="flex justify-between items-center pt-1.5 border-t border-gray-200/60 mt-1.5 text-[11px]">
                <span className="text-gray-500">Link Tagihan</span>
                <a
                  href={paymentData.latestPaymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Buka Link Pembayaran
                </a>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">Durasi belum diisi — biaya iklan belum bisa dihitung.</p>
        )}
      </DetailSheetSection>

      <DetailSheetSection title="Aksi">
        <PaymentAction
          submission={submission}
          paymentData={paymentData}
          lifecycle={lifecycle}
          onOpenPayment={onOpenPayment}
        />
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

      <DetailSheetSection title="Status Pembayaran">
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
          <div className="grid grid-cols-[auto_1fr] !gap-x-3 !gap-y-1 text-xs">
            <span className="text-gray-400">Status</span>
            <span className={cn('font-semibold capitalize', lifecycle.isPaid ? 'text-green-600' : lifecycle.isActuallyExpired ? 'text-red-600' : 'text-gray-900')}>
              {paymentData.latestStatus || submission.payment_status || 'No payment yet'}
            </span>
            <span className="text-gray-400">Amount</span>
            <span className="font-medium text-gray-900">
              Rp {paymentData.latestAmount ? paymentData.latestAmount.toLocaleString('id-ID') : '0'}
            </span>
            <span className="text-gray-400">Invoices</span>
            <span className="font-medium text-gray-900">{paymentData.invoiceCount}</span>
            {paymentData.latestPaymentId && (
              <>
                <span className="text-gray-400">Invoice Link</span>
                <a
                  href={`/invoices/${paymentData.latestPaymentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" /> {paymentData.latestPaymentId} <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </>
            )}
            {paymentData.hasEverPaid && !lifecycle.isPaid && (
              <>
                <span className="text-gray-400">Riwayat</span>
                <span className="font-medium text-green-600">Pernah dibayar</span>
              </>
            )}
          </div>
        </div>
        {paymentData.latestPaymentUrl && !lifecycle.isPaid && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs justify-start text-amber-700 border-amber-200 bg-amber-50/60 hover:bg-amber-100"
            onClick={() => copyToClipboard(paymentData.latestPaymentUrl!, 'Payment link copied!')}
          >
            <Copy className="w-3.5 h-3.5 mr-2" /> Copy payment link untuk researcher
          </Button>
        )}
      </DetailSheetSection>
    </>
  );
}
