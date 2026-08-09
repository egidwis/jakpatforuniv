import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { KilatScheduleStep } from '@/components/KilatScheduleStep';
import { MAX_EXTRA_ADS_PER_DAY, MAX_REGULAR_ADS_PER_DAY } from '@/utils/constants';
import {
  fetchSlotAvailability, supabase, updateExtendScheduleDates, updateScheduleDates,
  type AdScheduleEntry,
} from '@/utils/supabase';
import {
  isBookingClosedForDate, toAiringEndIso, toAiringStartIso, toLocalYmd, toWibYmd,
} from '@/utils/airing-window';
import { formatWibShort } from './scheduleModel';

// ─────────────────────────────────────────────────────────────
// Jadwalkan ulang SATU jadwal — bukan satu order.
//
// Bekerja di atas `AdScheduleEntry`, jadi ia melayani SEMUA ordinal. Itu
// perbedaan nyata dengan yang sudah ada: `SchedulePaymentView` hanya menyunting
// jadwal PERTAMA (`form_submissions`), dan jadwal ke-2 dst. sampai sekarang
// tidak punya jalur reschedule sama sekali — kartu di drawer Submissions bahkan
// sengaja menyembunyikan tombolnya (`canEditHere = ordinal === 1`) supaya tidak
// menjanjikan sesuatu yang akan menyunting baris lain.
//
// ⚠️ DUA TABEL SUMBER, DUA TIPE KOLOM. Percabangannya ada di `updateScheduleDates`
// vs `updateExtendScheduleDates`, bukan di sini — lihat komentar keduanya di
// supabase.ts. Yang penting di berkas ini: JANGAN menulis ke tabel mana pun
// secara langsung, karena penjaga `survey_pages` yang ikut di dalamnya akan
// hilang bersamaan.
// ─────────────────────────────────────────────────────────────

/** Sama dengan wizard: dua minggu ke depan. */
const DAYS_AHEAD = 14;

function nextDays(count: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

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

  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const days = useMemo(() => nextDays(DAYS_AHEAD), []);
  // Iklan tambahan punya KOLAM KUOTA SENDIRI. Mengukurnya terhadap kuota reguler
  // akan menolak tanggal yang sebenarnya masih kosong untuknya.
  const quota = entry.isExtraAd ? MAX_EXTRA_ADS_PER_DAY : MAX_REGULAR_ADS_PER_DAY;

  const loadSlots = useCallback(async () => {
    if (isKilat) return;
    setIsLoadingSlots(true);
    try {
      // `excludeSubmissionId` supaya jadwal yang SEDANG dipindah tidak dihitung
      // sebagai penghalang bagi dirinya sendiri.
      const { regularCounts, extraCounts } = await fetchSlotAvailability(
        entry.submissionId,
        'regular'
      );
      setCounts(entry.isExtraAd ? extraCounts : regularCounts);
    } catch (e) {
      console.error('Gagal memuat kapasitas slot:', e);
      toast.error('Gagal memuat kapasitas slot.');
    } finally {
      setIsLoadingSlots(false);
    }
  }, [entry.submissionId, entry.isExtraAd, isKilat]);

  useEffect(() => {
    if (!open) return;
    setSelectedYmd(entry.startDate ? toWibYmd(new Date(entry.startDate)) : null);
    void loadSlots();
  }, [open, entry.startDate, loadSlots]);

  /** Hari yang akan ditempati kalau mulai di `ymd` — akhir-eksklusif, sama seperti papan. */
  const daysCoveredBy = (ymd: string): string[] => {
    const out: string[] = [];
    const cursor = new Date(`${ymd}T00:00:00.000Z`);
    for (let i = 0; i < duration; i += 1) {
      out.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  };

  const fullDayIn = (ymd: string): string | null =>
    daysCoveredBy(ymd).find((d) => (counts[d] || 0) >= quota) ?? null;

  const handleSave = async () => {
    if (!selectedYmd) return;

    const blocked = fullDayIn(selectedYmd);
    if (blocked) {
      toast.error(`Tanggal ${formatWibShort(`${blocked}T08:00:00.000Z`)} sudah penuh (${quota}/${quota}). Pilih tanggal lain.`);
      return;
    }

    setIsSaving(true);
    try {
      if (entry.isExtension) {
        await updateExtendScheduleDates(entry.sourceId, selectedYmd, duration);
      } else {
        await updateScheduleDates(
          entry.submissionId,
          toAiringStartIso(selectedYmd),
          toAiringEndIso(selectedYmd, duration)
        );

        // ⚠️ JANGAN MEREGRESI ORDER YANG SUDAH LUNAS ke 'slot_reserved'. Aturan
        // yang sama dijaga `handleBookSchedule` di SchedulePaymentView; menyalin
        // jalur reschedule tanpa membawanya akan menurunkan order lunas setiap
        // kali tanggalnya digeser.
        const { data: fresh } = await supabase
          .from('form_submissions')
          .select('payment_status, submission_status')
          .eq('id', entry.submissionId)
          .single();

        const isPaid = ['paid', 'completed'].includes(fresh?.payment_status || '');
        const alreadyCommitted = ['paid', 'scheduled', 'live', 'completed'].includes(
          fresh?.submission_status || ''
        );
        if (!isPaid && !alreadyCommitted) {
          await supabase
            .from('form_submissions')
            .update({
              submission_status: 'slot_reserved',
              slot_booked_by: 'admin',
              slot_reserved_at: new Date().toISOString(),
            })
            .eq('id', entry.submissionId);
        }
      }

      toast.success('Jadwal berhasil dipindahkan.');
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      console.error('Gagal memindahkan jadwal:', e);
      // Pesan DB dibiarkan lewat: `trg_submission_no_overlap` / `trg_extend_no_overlap`
      // (sql/38) menjelaskan tabrakan jadwal jauh lebih tepat daripada kalimat umum.
      toast.error(e?.message || 'Gagal memindahkan jadwal.');
    } finally {
      setIsSaving(false);
    }
  };

  const endIso = selectedYmd ? toAiringEndIso(selectedYmd, duration) : null;

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

        {isKilat ? (
          /* Kilat punya kuota per-GELOMBANG dan hanya hari kerja — kalender
             14-hari milik iklan reguler tidak berlaku sedikit pun di sini. */
          <KilatScheduleStep
            submissionId={entry.submissionId}
            initialYmd={entry.startDate ? toWibYmd(new Date(entry.startDate)) : null}
            initialHour={entry.kilatSlotHour}
            isRescheduling
            onCancel={() => onOpenChange(false)}
            onScheduled={() => { onOpenChange(false); onDone(); }}
          />
        ) : (
          <div className="space-y-4">
            {isLoadingSlots ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="[display:grid] grid-cols-4 sm:grid-cols-7 gap-2">
                {days.map((day) => {
                  // Tile dibangun dari `new Date()` lokal, jadi kuncinya YMD lokal —
                  // sama seperti kalender wizard. Keputusan waktunya tetap WIB.
                  const ymd = toLocalYmd(day);
                  const used = counts[ymd] || 0;
                  const isFull = used >= quota;
                  const isClosed = isBookingClosedForDate(ymd);
                  const disabled = isFull || isClosed;
                  const covered = selectedYmd ? daysCoveredBy(selectedYmd).includes(ymd) : false;
                  const isStart = selectedYmd === ymd;

                  return (
                    <button
                      key={ymd}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedYmd(ymd)}
                      title={isClosed ? 'Sudah lewat batas pesan 13.00 WIB' : undefined}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-lg border p-1 h-[70px] text-center transition-all',
                        isStart
                          ? 'bg-blue-50 border-blue-600 ring-1 ring-blue-600'
                          : covered
                            ? 'bg-blue-50/50 border-blue-300'
                            : disabled
                              ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                              : 'bg-white border-slate-200 hover:border-blue-400'
                      )}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {day.toLocaleDateString('id-ID', { weekday: 'short' })}
                      </span>
                      <span className={cn('text-[13px] font-extrabold leading-tight', isStart ? 'text-blue-900' : 'text-slate-800')}>
                        {day.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 rounded-full px-1.5 text-[9px] font-semibold tabular-nums',
                          isFull ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {used}/{quota}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2.5 text-xs">
              {selectedYmd && endIso ? (
                <>
                  <p className="font-semibold text-gray-900">
                    {formatWibShort(toAiringStartIso(selectedYmd))} 15.00 WIB
                    {' → '}
                    {formatWibShort(endIso)} 15.00 WIB
                  </p>
                  <p className="text-gray-500 mt-0.5">
                    {duration} hari tayang ·{' '}
                    {entry.isExtension
                      ? 'menulis ke jadwal perpanjangan'
                      : 'menulis ke jadwal utama order'}
                  </p>
                </>
              ) : (
                <p className="text-gray-400">Pilih tanggal mulai.</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Batal
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSave}
                disabled={isSaving || !selectedYmd || isLoadingSlots}
              >
                {isSaving
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan…</>
                  : <><CalendarClock className="w-3.5 h-3.5 mr-1.5" />Simpan jadwal</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
