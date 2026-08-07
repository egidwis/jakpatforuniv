import { ExternalLink, FileText, PenLine, Zap } from 'lucide-react';
import { Button } from '../../ui/button';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import { calculateTotalAdCost, calculateIncentiveCost, calculateDiscount, calculateAdCostPerDay, calculatePpn, getKilatAddonCost } from '../../../utils/cost-calculator';
import type { SurveySubmission, PaymentState } from '../types';

// ─────────────────────────────────────────────────────────────
// Bagian "Detail Form & Biaya" — dipindah apa adanya dari PaymentTab
// saat tab Reservasi & Payment digabung jadi "Jadwal & Bayar" (Phase 3).
// ─────────────────────────────────────────────────────────────

export function CostBreakdownSection({
  submission,
  paymentData,
  onEditFormDetails,
}: {
  submission: SurveySubmission;
  paymentData: PaymentState;
  onEditFormDetails: (submission: SurveySubmission) => void;
}) {
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
  );
}
