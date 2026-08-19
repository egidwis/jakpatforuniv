import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScheduleForm } from '@/components/schedule/ScheduleForm';
import type { AdScheduleEntry } from '@/utils/supabase';

// ─────────────────────────────────────────────────────────────
// Jadwalkan ulang SATU jadwal — bukan satu order.
//
// Cangkang dialog di sekeliling `ScheduleForm`, badan yang sama yang dipakai
// drawer Submissions. Sebelumnya berkas ini memuat salinan kalender & logika
// simpannya sendiri; sejak keduanya diangkat ke `components/schedule/`, papan
// Schedule dan drawer tidak bisa lagi berbeda pendapat soal kuota, batas pesan
// 13.00 WIB, atau tabel mana yang ditulis.
//
// Melayani SEMUA ordinal: percabangan `updateScheduleDates` vs
// `updateExtendScheduleDates` hidup di dalam `ScheduleForm`.
// ─────────────────────────────────────────────────────────────

export function RescheduleDialog({
  entry, open, onOpenChange, onDone,
}: {
  entry: AdScheduleEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const isKilat = entry.distributionType === 'kilat';
  const duration = Math.max(1, entry.duration || 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-gray-900">
            Jadwalkan ulang
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            {entry.title} · jadwal #{entry.ordinal} · {duration} hari ·{' '}
            {isKilat ? 'JFU Kilat' : entry.isExtraAd ? 'iklan tambahan' : 'iklan reguler'}
          </DialogDescription>
        </DialogHeader>

        {/* Kilat ikut ditangani di dalam ScheduleForm — ia yang memilih antara
            kalender 14-hari dan pemilih gelombang. */}
        <ScheduleForm
          mode="edit"
          submissionId={entry.submissionId}
          entry={entry}
          isKilatOrder={isKilat}
          columns={7}
          onCancel={() => onOpenChange(false)}
          onDone={() => { onOpenChange(false); onDone(); }}
        />
      </DialogContent>
    </Dialog>
  );
}
