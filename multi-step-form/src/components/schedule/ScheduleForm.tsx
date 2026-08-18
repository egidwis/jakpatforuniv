import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { CalendarClock, Clock, Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MAX_EXTRA_ADS_PER_DAY, MAX_REGULAR_ADS_PER_DAY } from '@/utils/constants';
import {
  fetchSlotAvailability, supabase, updateExtendScheduleDates, updateScheduleDates,
  type AdScheduleEntry, type FormSubmissionExtend,
} from '@/utils/supabase';
import { nowWib, toAiringEndIso, toAiringStartIso, toWibYmd } from '@/utils/airing-window';
import { formatWibShort, formatWibTime } from '@/pages/dashboard/schedule/scheduleModel';
import { KilatScheduleStep } from '@/components/KilatScheduleStep';
import { DAYS_AHEAD, SlotCalendar, daysCoveredBy, nextDays } from './SlotCalendar';

// ─────────────────────────────────────────────────────────────
// Badan pemilih jadwal — dipakai BERSAMA oleh drawer Submissions dan dialog
// papan Schedule.
//
// Dua mode, satu kalender:
//   edit   — memindahkan jendela jadwal yang sudah ada. Melayani SEMUA ordinal;
//            percabangan tabelnya di `updateScheduleDates` vs
//            `updateExtendScheduleDates`.
//   create — melahirkan jadwal berikutnya untuk order yang sama.
//
// ⚠️ JANGAN MENARUH ASUMSI DRAWER DI SINI. Aksi simpan/batal dirender oleh
// pemanggil (`renderActions`) supaya papan Schedule boleh menaruhnya di dalam
// DialogFooter sementara drawer memakukannya di footer panel.
// ─────────────────────────────────────────────────────────────

/** Resolved server-side by get_schedule_batch_context (sql/37). */
interface BatchContext {
  periodBatch: string;
  isNewBatch: boolean;
  poolPrizePerWinner: number;
  poolWinnerCount: number;
}

/**
 * Batch mana yang akan ditempati jadwal baru — dan karenanya, apakah pool hadiah
 * baru wajib didanai.
 *
 * Dijawab di server supaya string batch-nya diturunkan ekspresi yang sama dengan
 * yang menghitung `period_batch` tersimpan (sql/37). Menanyakannya di browser
 * adalah yang dulu membuat jadwal #3 ditagih untuk pool yang sudah didanai
 * jadwal #2.
 */
async function fetchBatchContext(
  submissionId: string,
  endDateIso: string
): Promise<BatchContext | null> {
  const { data, error } = await supabase.rpc('get_schedule_batch_context', {
    p_submission_id: submissionId,
    p_end_date: endDateIso,
  });
  if (error) {
    console.error('Error resolving batch context:', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    periodBatch: row.period_batch,
    isNewBatch: row.is_new_batch,
    poolPrizePerWinner: row.pool_prize_per_winner || 0,
    poolWinnerCount: row.pool_winner_count || 0,
  };
}

export interface ScheduleFormProps {
  mode: 'edit' | 'create';
  submissionId: string;
  /**
   * Jadwal yang disunting. WAJIB untuk mode edit; mode create tidak memakainya
   * sama sekali — order yang belum punya jadwal pun harus bisa membuat satu.
   */
  entry?: AdScheduleEntry;
  /**
   * Iklan tambahan punya KOLAM KUOTA SENDIRI, jadi kalender harus tahu kolam mana
   * yang dibaca.
   *
   * ⚠️ HANYA DIBACA, TIDAK BISA DIUBAH DI SINI — dan itu bukan kelalaian.
   * `is_extra_ad` hidup di `survey_pages`, satu baris per ORDER; tidak ada
   * kolomnya di baris jadwal. Jadi jadwal baru MEWARISI status order, dan
   * menawarkan pilihan di sini berarti menjanjikan sesuatu yang tidak tersimpan
   * ke mana pun — admin memesan ke kolam tambahan, lalu jadwalnya tetap dihitung
   * reguler dan kolam reguler kelebihan jual. Pemindahan flag ke `ad_schedules`
   * adalah Task 13 Langkah 4; togglenya lahir di sana, bukan di sini.
   */
  isExtraAd?: boolean;
  /** Hadiah order induk — hanya dipakai mode create untuk prefill & pratinjau. */
  currentPrizePerWinner?: number;
  currentWinnerCount?: number;
  /** Lebar panel menentukan jumlah kolom: 4 untuk drawer, 7 untuk dialog. */
  columns?: 4 | 7;
  onCancel: () => void;
  onDone: () => void;
  actionsSlot?: HTMLElement | null;
  renderActions?: (state: {
    canSave: boolean;
    isSaving: boolean;
    save: () => void;
    cancel: () => void;
    label: string;
  }) => React.ReactNode;
}

export function formatBatchPeriod(batchStr?: string | null): string {
  if (!batchStr) return '—';
  const parts = batchStr.split('-');
  if (parts.length === 2) {
    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    if (months[monthIdx]) {
      return `${months[monthIdx]} ${year}`;
    }
  }
  return batchStr;
}

export function ScheduleForm({
  mode,
  submissionId,
  entry,
  isExtraAd = false,
  currentPrizePerWinner = 0,
  currentWinnerCount = 0,
  columns = 7,
  onCancel,
  onDone,
  actionsSlot,
  renderActions,
}: ScheduleFormProps) {
  const isCreate = mode === 'create';
  const isKilat = !isCreate && entry?.distributionType === 'kilat';

  const [selectedYmd, setSelectedYmd] = useState<string | null>(
    !isCreate && entry?.startDate ? toWibYmd(new Date(entry.startDate)) : null
  );
  const [duration, setDuration] = useState(
    isCreate ? 7 : Math.max(1, entry?.duration || 1)
  );

  const getInitialAiringTime = () => {
    if (!isCreate && entry?.startDate) {
      const wib = nowWib(new Date(entry.startDate));
      return `${String(wib.hour).padStart(2, '0')}:${String(wib.minute).padStart(2, '0')}`;
    }
    return '15:00';
  };

  const [airingTime, setAiringTime] = useState<string>(getInitialAiringTime());
  const isExtraMode = isCreate ? isExtraAd : !!entry?.isExtraAd;

  const [regularCounts, setRegularCounts] = useState<Record<string, number>>({});
  const [extraCounts, setExtraCounts] = useState<Record<string, number>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [prizePerWinner, setPrizePerWinner] = useState(currentPrizePerWinner);
  const [winnerCount, setWinnerCount] = useState(currentWinnerCount);
  const [additionalPrize, setAdditionalPrize] = useState(0);
  const [batchContext, setBatchContext] = useState<BatchContext | null>(null);
  const [isResolvingBatch, setIsResolvingBatch] = useState(false);

  const days = useMemo(() => nextDays(DAYS_AHEAD), []);

  const [hourStr, minStr] = airingTime.split(':');
  const selectedHour = Math.min(23, Math.max(0, parseInt(hourStr || '15', 10)));
  const selectedMinute = Math.min(59, Math.max(0, parseInt(minStr || '0', 10)));

  const quota = isExtraMode ? MAX_EXTRA_ADS_PER_DAY : MAX_REGULAR_ADS_PER_DAY;
  const counts = isExtraMode ? extraCounts : regularCounts;

  const loadSlots = useCallback(async () => {
    setIsLoadingSlots(true);
    try {
      const res = await fetchSlotAvailability(undefined, 'regular', entry?.sourceId);
      setRegularCounts(res.regularCounts);
      setExtraCounts(res.extraCounts);
    } catch (e) {
      console.error('Gagal memuat kapasitas slot:', e);
      toast.error('Gagal memuat kapasitas slot.');
    } finally {
      setIsLoadingSlots(false);
    }
  }, [entry?.sourceId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const startIso = selectedYmd
    ? toAiringStartIso(selectedYmd, selectedHour, selectedMinute)
    : null;

  const endIso = selectedYmd
    ? toAiringEndIso(selectedYmd, duration, selectedHour, selectedMinute)
    : null;

  useEffect(() => {
    if (!isCreate || !endIso) {
      setBatchContext(null);
      return;
    }
    let cancelled = false;
    setIsResolvingBatch(true);
    fetchBatchContext(submissionId, endIso)
      .then((ctx) => { if (!cancelled) setBatchContext(ctx); })
      .finally(() => { if (!cancelled) setIsResolvingBatch(false); });
    return () => { cancelled = true; };
  }, [isCreate, endIso, submissionId]);

  const isNewBatch = batchContext?.isNewBatch ?? false;

  const covered = useMemo(
    () => (selectedYmd ? daysCoveredBy(selectedYmd, duration) : []),
    [selectedYmd, duration]
  );

  // Kalender hanya MENGUNCI tile hari yang sudah penuh; iklan multi-hari bisa
  // mulai di hari kosong lalu menabrak hari penuh di tengah jendelanya — tile
  // itu memerah tapi tetap bisa disimpan. Penjaga ini yang menolaknya.
  const fullDayIn = (ymd: string): string | null =>
    daysCoveredBy(ymd, duration).find((d) => (counts[d] || 0) >= quota) ?? null;

  const handleSave = async () => {
    if (!selectedYmd || !startIso || !endIso) {
      toast.error('Pilih tanggal mulai terlebih dahulu.');
      return;
    }

    const blocked = fullDayIn(selectedYmd);
    if (blocked) {
      toast.error(
        `Tanggal ${formatWibShort(`${blocked}T08:00:00.000Z`)} sudah penuh (${quota}/${quota}). Pilih tanggal lain.`
      );
      return;
    }
    if (duration < 1) {
      toast.error('Durasi minimal 1 hari');
      return;
    }

    setIsSaving(true);
    try {
      if (isCreate) {
        await handleSaveCreate();
      } else {
        await handleSaveEdit();
      }
      onDone();
    } catch (err: any) {
      console.error('Gagal menyimpan jadwal:', err);
      toast.error(err?.message || 'Gagal menyimpan jadwal.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!entry) throw new Error('Jadwal yang disunting tidak ditemukan.');
    if (!selectedYmd || !startIso || !endIso) throw new Error('Waktu tayang tidak valid.');

    if (entry.isExtension) {
      // ⚠️ Signature-nya (extendId, startYmd, durationDays, jam, menit) — ia
      // MENYUSUN sendiri instant-nya. Mengoper `endIso` ke slot `durationDays`
      // menulis tanggal sampah ke baris extend.
      await updateExtendScheduleDates(entry.sourceId, selectedYmd, duration, selectedHour, selectedMinute);
    } else {
      await updateScheduleDates(submissionId, startIso, endIso, selectedHour, selectedMinute);

      // ⚠️ JANGAN MEREGRESI ORDER YANG SUDAH LUNAS ke 'slot_reserved'.
      const { data: fresh } = await supabase
        .from('form_submissions')
        .select('payment_status, submission_status')
        .eq('id', submissionId)
        .single();

      const isPaid = ['paid', 'completed'].includes(fresh?.payment_status || '');
      const alreadyCommitted = ['paid', 'scheduled', 'live', 'completed'].includes(
        fresh?.submission_status || ''
      );
      // Slot yang dipindahkan admin menjadi milik admin: `slot_booked_by`
      // 'user' adalah satu-satunya yang dilepas otomatis setelah 1 jam, dan
      // slot yang baru saja dipindah admin tidak boleh ikut kadaluwarsa.
      if (!isPaid && !alreadyCommitted) {
        await supabase
          .from('form_submissions')
          .update({
            submission_status: 'slot_reserved',
            slot_booked_by: 'admin',
            slot_reserved_at: new Date().toISOString(),
          })
          .eq('id', submissionId);
      }
    }
    toast.success('Jadwal tayang berhasil diperbarui.');
  };

  const handleSaveCreate = async () => {
    if (!startIso || !endIso) throw new Error('Waktu tayang tidak valid.');

    const resolved = await fetchBatchContext(submissionId, endIso);
    if (!resolved) {
      throw new Error('Gagal menentukan batch undian untuk jadwal ini.');
    }


    if (resolved.isNewBatch && (prizePerWinner <= 0 || winnerCount <= 0)) {
      throw new Error(
        `Jadwal berakhir di batch ${resolved.periodBatch} yang baru — wajib mengisi reward.`
      );
    }

    const extendData: FormSubmissionExtend = {
      submission_id: submissionId,
      duration,
      start_date: startIso,
      end_date: endIso,
      submission_status: 'waiting_payment',
      payment_status: 'pending',
      prize_per_winner: resolved.isNewBatch ? prizePerWinner : 0,
      winner_count: resolved.isNewBatch ? winnerCount : 0,
      additional_prize_per_winner: !resolved.isNewBatch ? additionalPrize : 0,
      is_new_month: resolved.isNewBatch,
      total_cost: 0,
      slot_booked_by: 'admin',
    };

    const { error } = await supabase.from('form_submissions_extend').insert([extendData]);
    if (error) throw error;

    toast.success('Jadwal iklan baru dibuat.');
  };

  const canSave = !!selectedYmd && !isLoadingSlots && duration >= 1;
  const saveLabel = isCreate ? 'Buat jadwal' : 'Simpan jadwal';

  const actionNode = renderActions
    ? renderActions({ canSave, isSaving, save: handleSave, cancel: onCancel, label: saveLabel })
    : (
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="font-medium text-slate-700 bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-none"
          onClick={onCancel}
          disabled={isSaving}
        >
          Batal
        </Button>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
          onClick={handleSave}
          disabled={isSaving || !canSave}
        >
          {isSaving
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan…</>
            : <><CalendarClock className="w-3.5 h-3.5 mr-1.5" />{saveLabel}</>}
        </Button>
      </div>
    );

  const actions = actionsSlot === undefined
    ? actionNode
    : actionsSlot
      ? createPortal(actionNode, actionsSlot)
      : null;

  if (isKilat && entry) {
    return (
      <KilatScheduleStep
        submissionId={submissionId}
        initialYmd={entry.startDate ? toWibYmd(new Date(entry.startDate)) : null}
        initialHour={entry.kilatSlotHour}
        isRescheduling
        onCancel={onCancel}
        onScheduled={onDone}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Tanggal mulai
          </p>
          {isCreate ? (
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
              Durasi (hari)
              <Input
                type="number"
                min={1}
                max={90}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-8 w-16 text-sm text-center border-slate-200 focus:border-blue-400"
              />
            </label>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="text-slate-400">Durasi:</span>
              <span className="font-semibold text-slate-700">{duration} hari</span>
            </div>
          )}
        </div>

        <SlotCalendar
          days={days}
          counts={counts}
          quota={quota}
          selectedYmd={selectedYmd}
          coveredDays={covered}
          onSelect={setSelectedYmd}
          columns={columns}
          isLoading={isLoadingSlots}
        />
      </div>

      <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            Jam Tayang (WIB)
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              type="time"
              value={airingTime}
              onChange={(e) => setAiringTime(e.target.value)}
              className="h-8 w-28 text-xs font-mono font-medium text-center border-slate-200 focus:border-blue-400"
            />
            <span className="text-xs font-semibold text-slate-500">WIB</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[10px] text-slate-400 font-medium mr-1">Pilihan cepat:</span>
          {['08:00', '10:00', '13:00', '15:00', '18:00', '20:00'].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAiringTime(preset)}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors border',
                airingTime === preset
                  ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
              )}
            >
              {preset} {preset === '15:00' ? '(Bawaan)' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs">
        {selectedYmd && startIso && endIso ? (
          <>
            <p className="font-semibold text-slate-900">
              {formatWibShort(startIso)} {formatWibTime(startIso)} WIB
              {' → '}
              {formatWibShort(endIso)} {formatWibTime(endIso)} WIB
            </p>
            <p className="text-slate-500 mt-0.5">
              {duration} hari tayang ·{' '}
              {isCreate
                ? 'jadwal baru untuk order ini'
                : entry?.isExtension
                  ? 'menulis ke jadwal perpanjangan'
                  : 'menulis ke jadwal utama order'}
            </p>
          </>
        ) : (
          <p className="text-slate-400">Pilih tanggal mulai.</p>
        )}
      </div>

      {/* Hadiah Undian — mode create saja */}
      {isCreate && endIso && (
        isNewBatch ? (
          <div className="rounded-lg border border-amber-200 bg-white p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-amber-600" />
                Hadiah Undian · Periode {formatBatchPeriod(batchContext?.periodBatch)}
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Periode baru — wajib tentukan pool hadiah untuk periode ini
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-100">
              <label className="space-y-1 text-[11px] font-medium text-slate-700">
                Hadiah per pemenang (Rp)
                <Input
                  type="number"
                  min={0}
                  value={prizePerWinner}
                  onChange={(e) => setPrizePerWinner(Number(e.target.value))}
                  className="h-9 text-sm border-slate-200 focus:border-amber-400"
                />
              </label>
              <label className="space-y-1 text-[11px] font-medium text-slate-700">
                Jumlah pemenang
                <Input
                  type="number"
                  min={0}
                  value={winnerCount}
                  onChange={(e) => setWinnerCount(Number(e.target.value))}
                  className="h-9 text-sm border-slate-200 focus:border-amber-400"
                />
              </label>
            </div>

            {prizePerWinner > 0 && winnerCount > 0 && (
              <p className="text-[11px] font-medium text-amber-800">
                Total hadiah periode ini: Rp {(prizePerWinner * winnerCount).toLocaleString('id-ID')}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2.5">
            <div>
              <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-blue-600" />
                Hadiah Undian · Periode {formatBatchPeriod(batchContext?.periodBatch)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isResolvingBatch
                  ? 'Mengecek reward periode…'
                  : batchContext && batchContext.poolPrizePerWinner > 0
                    ? `Mengikuti pool aktif: Rp ${batchContext.poolPrizePerWinner.toLocaleString('id-ID')}/pemenang (${batchContext.poolWinnerCount} pemenang)`
                    : 'Mengikuti reward periode aktif'}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <label className="space-y-1 text-[11px] font-medium text-slate-700 block">
                Tambah hadiah per pemenang (opsional)
                <Input
                  type="number"
                  min={0}
                  value={additionalPrize}
                  onChange={(e) => setAdditionalPrize(Number(e.target.value))}
                  className="h-9 text-sm border-slate-200 focus:border-blue-400"
                />
              </label>

              {additionalPrize > 0 && (
                <p className="text-[11px] font-medium text-blue-600">
                  ↗ Total menjadi: Rp {(currentPrizePerWinner + additionalPrize).toLocaleString('id-ID')}/pemenang ({currentWinnerCount} pemenang)
                </p>
              )}
            </div>
          </div>
        )
      )}

      {actions}
    </div>
  );
}
