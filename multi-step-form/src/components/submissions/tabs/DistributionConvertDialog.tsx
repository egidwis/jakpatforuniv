import { useState } from 'react';
import { AlertTriangle, Calendar, Zap } from 'lucide-react';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import {
  calculateTotalAdCost,
  calculateIncentiveCost,
  calculateDiscount,
  calculateAdCostPerDay,
  calculatePpn,
  getKilatAddonCost,
} from '../../../utils/cost-calculator';
import type { SurveySubmission, PaymentState } from '../types';
import { deriveLifecycle } from '../lifecycle';

export interface DistributionConvertDialogProps {
  submission: SurveySubmission;
  paymentData?: PaymentState;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  convertTarget: 'regular' | 'kilat' | null;
  onClose: () => void;
  onConfirm: (target: 'regular' | 'kilat') => Promise<void>;
}

export function DistributionConvertDialog({
  submission,
  paymentData,
  lifecycle,
  convertTarget,
  onClose,
  onConfirm,
}: DistributionConvertDialogProps) {
  const [isConverting, setIsConverting] = useState(false);

  if (!convertTarget) return null;

  const previewIncentive = calculateIncentiveCost(
    submission.winnerCount || 0,
    submission.prize_per_winner || 0
  );
  const previewKilatSubtotal =
    calculateAdCostPerDay(submission.questionCount || 0) +
    getKilatAddonCost(submission.voucher_code) +
    previewIncentive;
  const previewRegularAdCost = calculateTotalAdCost(
    submission.questionCount || 0,
    submission.duration || 0
  );
  const previewRegularSubtotal =
    previewRegularAdCost +
    previewIncentive -
    calculateDiscount(
      submission.voucher_code,
      previewRegularAdCost,
      previewIncentive,
      submission.duration || 0
    );
  const previewSubtotal = convertTarget === 'kilat' ? previewKilatSubtotal : previewRegularSubtotal;
  const previewTotal = previewSubtotal + calculatePpn(previewSubtotal);

  const hasPendingInvoice = paymentData?.hasInvoices && paymentData?.latestStatus === 'pending';

  const handleConfirm = async () => {
    setIsConverting(true);
    try {
      await onConfirm(convertTarget);
      onClose();
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Dialog
      open={convertTarget !== null}
      onOpenChange={(open) => {
        if (!open && !isConverting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {convertTarget === 'kilat' ? (
              <>
                <Zap className="w-4 h-4 fill-amber-500 text-amber-500" /> Jadikan JFU Kilat?
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4 text-blue-500" /> Kembalikan ke Iklan Regular?
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {submission.formTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1">
            <p className="text-slate-600">
              Jadwal yang sudah dipesan akan <strong>dilepas</strong> — slotnya kembali ke pool, dan
              slot baru dapat dipilih di step Schedule setelah ini.
            </p>
            <p className="text-slate-600">
              Harga dihitung ulang jadi{' '}
              <strong className="text-slate-900">Rp {previewTotal.toLocaleString('id-ID')}</strong>{' '}
              (subtotal Rp {previewSubtotal.toLocaleString('id-ID')} + PPN 11%)
              {convertTarget === 'kilat'
                ? ' — base rate 1× + add-on Kilat, tanpa diskon voucher.'
                : ' — base rate × durasi, diskon voucher berlaku lagi.'}
            </p>
          </div>

          {lifecycle.isPaid && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Order ini <strong>sudah lunas</strong> dengan harga lama. Selisihnya harus
                ditagih atau dikembalikan di luar sistem — konversi ini tidak menyentuh
                pembayaran yang sudah masuk.
              </span>
            </div>
          )}
          {hasPendingInvoice && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Masih ada <strong>invoice pending</strong> berisi harga lama dan link-nya
                masih bisa dibayar user. Batalkan invoice itu dulu kalau perlu — konversi
                tidak menutupnya.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isConverting}
            onClick={onClose}
            className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
          >
            Batal
          </Button>
          <Button
            size="sm"
            disabled={isConverting}
            onClick={handleConfirm}
            className={
              convertTarget === 'kilat'
                ? 'bg-amber-600 hover:bg-amber-700 text-white font-medium'
                : 'bg-blue-600 hover:bg-blue-700 text-white font-medium'
            }
          >
            {isConverting
              ? 'Memindahkan...'
              : convertTarget === 'kilat'
                ? 'Ya, jadikan Kilat'
                : 'Ya, kembalikan ke Regular'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
