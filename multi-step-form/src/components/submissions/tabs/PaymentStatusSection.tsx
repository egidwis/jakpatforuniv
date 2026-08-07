import { Copy, ExternalLink, FileText } from 'lucide-react';
import { Button } from '../../ui/button';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import { cn } from '@/lib/utils';
import type { SurveySubmission, PaymentState } from '../types';
import { copyToClipboard } from '../types';
import { deriveLifecycle } from '../lifecycle';

// ─────────────────────────────────────────────────────────────
// Bagian "Status Pembayaran" — dipindah apa adanya dari PaymentTab
// saat tab Reservasi & Payment digabung jadi "Jadwal & Bayar" (Phase 3).
// ─────────────────────────────────────────────────────────────

export function PaymentStatusSection({
  submission,
  paymentData,
  lifecycle,
}: {
  submission: SurveySubmission;
  paymentData: PaymentState;
  lifecycle: ReturnType<typeof deriveLifecycle>;
}) {
  return (
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
  );
}
