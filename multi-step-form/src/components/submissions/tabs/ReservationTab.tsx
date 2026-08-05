import { useState } from 'react';
import { AlertTriangle, Calendar, CalendarCheck, Zap } from 'lucide-react';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import { calculateTotalAdCost, calculateIncentiveCost, calculateDiscount, calculateAdCostPerDay, calculatePpn, getKilatAddonCost } from '../../../utils/cost-calculator';
import type { SurveySubmission, PaymentState, ExistingPage } from '../types';
import { formatDate } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { ReserveSlotAction, DistributionAction } from '../CampaignActions';

// ─────────────────────────────────────────────────────────────
// Tab: Reservasi — slot status + Reserve/Edit Schedule entry point
// ─────────────────────────────────────────────────────────────

export function ReservationTab({
  submission,
  paymentData,
  existingPage,
  isScheduled,
  lifecycle,
  onOpenSchedule,
  onConvertDistribution,
}: {
  submission: SurveySubmission;
  paymentData: PaymentState;
  existingPage?: ExistingPage;
  isScheduled: boolean;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onOpenSchedule: (submission: SurveySubmission) => void;
  onConvertDistribution: (submission: SurveySubmission, target: 'regular' | 'kilat') => Promise<void>;
}) {
  const isExtraAd = existingPage?.is_extra_ad || (submission.admin_notes || '').includes('[EXTRA_AD]');
  const isKilat = submission.distribution_type === 'kilat';

  const [convertTarget, setConvertTarget] = useState<'regular' | 'kilat' | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // Harga jalur tujuan, dihitung untuk DITAMPILKAN di dialog sebelum admin
  // menekan tombol. Angka finalnya tetap dihitung ulang di server oleh
  // convertDistributionType() dari data DB yang segar — ini hanya pratinjau,
  // jadi admin tidak memindahkan order secara buta.
  const previewIncentive = calculateIncentiveCost(submission.winnerCount || 0, submission.prize_per_winner || 0);
  const previewKilatSubtotal =
    calculateAdCostPerDay(submission.questionCount || 0) +
    getKilatAddonCost(submission.voucher_code) +
    previewIncentive;
  const previewRegularAdCost = calculateTotalAdCost(submission.questionCount || 0, submission.duration || 0);
  const previewRegularSubtotal =
    previewRegularAdCost +
    previewIncentive -
    calculateDiscount(submission.voucher_code, previewRegularAdCost, previewIncentive, submission.duration || 0);
  const previewSubtotal = convertTarget === 'kilat' ? previewKilatSubtotal : previewRegularSubtotal;
  const previewTotal = previewSubtotal + calculatePpn(previewSubtotal);

  const hasPendingInvoice = paymentData.hasInvoices && paymentData.latestStatus === 'pending';

  const handleConfirmConvert = async () => {
    if (!convertTarget) return;
    setIsConverting(true);
    try {
      await onConvertDistribution(submission, convertTarget);
      setConvertTarget(null);
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <>
      <DetailSheetSection title="Status Reservasi">
        {lifecycle.hasValidSchedule ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-blue-700">
              <CalendarCheck className="w-4 h-4" />
              <span className="text-xs font-semibold">
                {lifecycle.isLegacyActive && !isScheduled ? 'Scheduled' : 'Slot Reserved'}
              </span>
              {lifecycle.slotExpiresAt && (
                <Chip variant="amber" size="sm" dot pulse>&lt;1h</Chip>
              )}
            </div>
            <div className="grid grid-cols-[auto_1fr] !gap-x-3 !gap-y-1 text-xs">
              <span className="text-gray-400">Start</span>
              <span className="font-medium text-gray-900">{formatDate(submission.start_date)}</span>
              <span className="text-gray-400">End</span>
              <span className="font-medium text-gray-900">{formatDate(submission.end_date)}</span>
              <span className="text-gray-400">Type</span>
              <span className="font-medium text-gray-900">
                {isKilat
                  ? `Kilat${submission.kilat_slot_hour != null ? ` · ${String(submission.kilat_slot_hour).padStart(2, '0')}.00 WIB` : ' · gelombang belum dipilih'}`
                  : isExtraAd ? 'Extra Ad' : 'Regular Ad'}
              </span>
              {submission.slot_booked_by && (
                <>
                  <span className="text-gray-400">Booked by</span>
                  <span className="font-medium text-gray-900 capitalize">{submission.slot_booked_by}</span>
                </>
              )}
            </div>
          </div>
        ) : lifecycle.isActuallyExpired ? (
          <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-700">
            <span className="font-semibold">Reservasi sebelumnya expired.</span> Slot dilepas — reserve ulang untuk
            melanjutkan ke pembayaran.
          </div>
        ) : (
          <p className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2.5">
            Belum ada slot yang direservasi.
            {!lifecycle.canReserveSlot && ' Submission harus di-approve dulu sebelum bisa reserve slot.'}
          </p>
        )}
      </DetailSheetSection>

      <DetailSheetSection title="Aksi">
        <ReserveSlotAction
          submission={submission}
          paymentData={paymentData}
          existingPage={existingPage}
          isScheduled={isScheduled}
          lifecycle={lifecycle}
          onOpenSchedule={onOpenSchedule}
        />
        <p className="text-[11px] text-gray-400">
          Membuka halaman Schedule &amp; Payment (fullscreen) — sama seperti flow sebelumnya.
        </p>
      </DetailSheetSection>

      <DetailSheetSection title="Jalur Distribusi">
        <DistributionAction
          submission={submission}
          existingPage={existingPage}
          isConverting={isConverting}
          onConvert={(target) => setConvertTarget(target)}
        />
        <p className="text-[11px] text-gray-400">
          {isKilat
            ? 'Kilat: push notifikasi langsung ke responden, ~2 jam, tanpa halaman iklan.'
            : 'Untuk user yang sudah submit sebagai iklan biasa tapi ingin pindah ke Kilat.'}
        </p>
      </DetailSheetSection>

      <Dialog open={convertTarget !== null} onOpenChange={(open) => { if (!open && !isConverting) setConvertTarget(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {convertTarget === 'kilat' ? (
                <><Zap className="w-4 h-4 fill-amber-500 text-amber-500" /> Jadikan JFU Kilat?</>
              ) : (
                <><Calendar className="w-4 h-4 text-blue-500" /> Kembalikan ke Iklan Regular?</>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {submission.formTitle}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-1">
              <p className="text-gray-600">
                Jadwal yang sudah dipesan akan <strong>dilepas</strong> — slotnya kembali ke pool, dan
                slot baru dipilih di step Schedule setelah ini.
              </p>
              <p className="text-gray-600">
                Harga dihitung ulang jadi{' '}
                <strong className="text-gray-900">Rp {previewTotal.toLocaleString('id-ID')}</strong>{' '}
                (subtotal Rp {previewSubtotal.toLocaleString('id-ID')} + PPN 11%)
                {convertTarget === 'kilat'
                  ? ' — base rate 1× + add-on Kilat, tanpa diskon voucher.'
                  : ' — base rate × durasi, diskon voucher berlaku lagi.'}
              </p>
            </div>

            {/* Peringatan, bukan penghalang. Order lunas dan invoice pending justru
                kasus yang paling sering perlu dipindah — yang penting admin tahu. */}
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
            <Button variant="outline" size="sm" disabled={isConverting} onClick={() => setConvertTarget(null)}>
              Batal
            </Button>
            <Button
              size="sm"
              disabled={isConverting}
              onClick={handleConfirmConvert}
              className={convertTarget === 'kilat' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}
            >
              {isConverting ? 'Memindahkan...' : convertTarget === 'kilat' ? 'Ya, jadikan Kilat' : 'Ya, kembalikan ke Regular'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
