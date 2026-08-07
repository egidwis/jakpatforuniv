import { CalendarCheck } from 'lucide-react';
import { Chip } from '../../ui/chip';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import type { SurveySubmission, ExistingPage } from '../types';
import { formatDate } from '../types';
import { deriveLifecycle } from '../lifecycle';

// ─────────────────────────────────────────────────────────────
// Bagian "Status Reservasi" — dipindah apa adanya dari ReservationTab
// saat tab Reservasi & Payment digabung jadi "Jadwal & Bayar" (Phase 3).
// Murni baca; tidak ada aksi di sini.
// ─────────────────────────────────────────────────────────────

export function ReservationStatusSection({
  submission,
  existingPage,
  isScheduled,
  lifecycle,
}: {
  submission: SurveySubmission;
  existingPage?: ExistingPage;
  isScheduled: boolean;
  lifecycle: ReturnType<typeof deriveLifecycle>;
}) {
  const isExtraAd = existingPage?.is_extra_ad || (submission.admin_notes || '').includes('[EXTRA_AD]');
  const isKilat = submission.distribution_type === 'kilat';

  return (
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
  );
}
