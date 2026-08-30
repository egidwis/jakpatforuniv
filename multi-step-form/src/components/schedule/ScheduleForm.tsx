import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { CalendarClock, Clock, Gift, Loader2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { MAX_EXTRA_ADS_PER_DAY, MAX_REGULAR_ADS_PER_DAY } from '@/utils/constants';
import {
  fetchSlotAvailability, setScheduleExtraAd, supabase, updateExtendScheduleDates,
  updateScheduleDates,
  type AdScheduleEntry,
} from '@/utils/supabase';
import { nowWib, toAiringEndIso, toAiringStartIso, toWibYmd } from '@/utils/airing-window';
import { isAiringNowSchedule, isSchedulePaid } from '@/components/status/scheduleAxes';
import { notifyScheduleChange } from '@/utils/notifyScheduleChange';
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
   * Kolam kuota AWAL untuk mode create. Iklan tambahan punya kolam sendiri
   * (`MAX_EXTRA_ADS_PER_DAY`), jadi kalender harus tahu kolam mana yang dibaca.
   *
   * Dulu prop ini HANYA DIBACA, dengan larangan panjang di sini yang
   * menjelaskan kenapa togglenya mustahil: `is_extra_ad` hidup di
   * `survey_pages`, satu baris per ORDER, jadi pilihan admin tidak punya tempat
   * penyimpanan dan jadwalnya tetap dihitung reguler. sql/63 memberi setiap
   * jadwal kolomnya sendiri; larangan itu selesai masa berlakunya, dan
   * togglenya ada di bawah.
   *
   * Mode edit tidak memakainya — di sana nilai awalnya dari `entry.isExtraAd`.
   */
  isExtraAd?: boolean;
  /**
   * Order induknya JFU Kilat. Kilat tidak punya kolam iklan tambahan sama
   * sekali, jadi togglenya tidak ditawarkan.
   *
   * Perlu di-oper karena mode create tidak punya `entry` untuk ditanyai, dan
   * `isKilat` di bawah hanya bisa dijawab untuk mode edit. Kalau salah, DB
   * tetap menolak (`set_schedule_extra_ad`) atau membersihkan (trigger) —
   * prop ini soal tidak menawarkan pilihan yang mustahil, bukan penjaga
   * terakhir.
   */
  isKilatOrder?: boolean;
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
  isKilatOrder = false,
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
  // Kolam kuota jadwal INI. Bisa diubah sejak sql/63; sebelum itu ia turunan
  // mati dari order dan setiap perubahan hilang saat disimpan.
  const [isExtraMode, setIsExtraMode] = useState(
    isCreate ? isExtraAd : !!entry?.isExtraAd
  );

  /**
   * Konfirmasi menggeser tanggal jadwal yang UANGNYA SUDAH MASUK.
   *
   * ⚠️ SAUDARANYA DIJAGA, YANG INI TIDAK. "Batalkan Jadwal" sejak lama ditolak
   * untuk jadwal lunas — di kartu maupun di `cancelSchedule()`. "Ganti Tanggal"
   * satu-satunya penjaganya `state !== 'cancelled'`, jadi tanggal order lunas —
   * termasuk 177 iklan yang SEDANG TAYANG — bisa digeser tanpa peringatan,
   * tanpa kabar ke peneliti, dan tanpa perlindungan tagihan-basi (faktur lunas
   * tidak pernah dianggap basi, sql/60).
   *
   * Kemampuannya SENGAJA dipertahankan, bukan dibuntu (keputusan produk): jalan
   * buntu mendorong admin menyalahgunakan tombol lain — begitulah `spam` dulu
   * berubah jadi tong sampah. Yang ditambahkan adalah harga yang harus dibayar
   * untuk memakainya: menyebut konsekuensinya, lalu mengabari penelitinya.
   */
  const [pendingMove, setPendingMove] = useState<{ from: string | null; to: string } | null>(null);

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

    // Gerbang E1: menggeser tanggal jadwal yang uangnya sudah masuk harus lewat
    // dialog konsekuensi lebih dulu. Hanya sekali — `pendingMove` dikosongkan
    // tepat sebelum `commit()` supaya konfirmasinya tidak berulang.
    if (!isCreate && entry && isSchedulePaid(entry) && startIso !== entry.startDate) {
      setPendingMove({ from: entry.startDate, to: startIso });
      return;
    }

    await commit();
  };

  /** Penyimpanan sebenarnya — dipanggil langsung, atau lewat dialog E1. */
  const commit = async () => {
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

    // Kolam kuota disimpan LEBIH DULU, sebelum tanggalnya bergerak. Urutan ini
    // penting: `set_schedule_extra_ad` gagal keras untuk Kilat, dan gagal
    // sesudah tanggalnya pindah akan meninggalkan jadwal di tanggal baru dengan
    // kolam lama — persis keadaan yang tidak bisa dilihat siapa pun di layar.
    if (isExtraMode !== !!entry.isExtraAd) {
      await setScheduleExtraAd(entry.id, isExtraMode);
    }

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

    /*
      Kabari penelitinya — Fase ② akhirnya punya notifikasi seperti Fase ①.
      Sampai sekarang tanggal tayang bisa bergeser tanpa satu pun kabar keluar;
      peneliti baru tahu kalau kebetulan membuka dashboard.

      ⚠️ Sengaja TIDAK di-`await` dan TIDAK di dalam `try` penyimpanan: emailnya
      tidak boleh menahan layar, dan kegagalannya tidak boleh membatalkan
      perubahan yang sudah mendarat di server. `notifyScheduleChange` tidak
      pernah melempar; ia memberi tahu admin lewat toast terpisah.

      Hanya kalau tanggalnya BENAR-BENAR pindah: admin yang membuka formulir lalu
      menyimpan tanpa mengubah apa pun tidak mengirim kabar apa-apa. Pemindahan
      oleh peneliti sendiri disaring di sisi server (`self_rescheduled`).
    */
    if (startIso !== entry.startDate) {
      void notifyScheduleChange({
        scheduleId: entry.id,
        event: 'moved',
        previousStart: entry.startDate,
      });
    }
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

    // Lewat RPC `create_ad_schedule` (sql/74), bukan `.insert()` ke tabel mana pun.
    //
    // Jalur lamanya menulis ke view `form_submissions_extend`, dan trigger
    // `INSTEAD OF INSERT`-nya mengerjakan LIMA aturan — menurunkan
    // `distribution_type`/`review_status` dari induk, mewarisi `is_extra_ad`,
    // memanggil `assert_schedule_window_free`, memetakan `is_new_month`, lalu
    // `resync_ad_schedule_ordinals`. RPC ini memindahkan pemanggilnya tanpa
    // memindahkan kelima aturan itu ke TypeScript, tempat ia akan menyimpang.
    const { error } = await supabase.rpc('create_ad_schedule', {
      p_submission_id: submissionId,
      p_start_date: startIso,
      p_end_date: endIso,
      p_duration: duration,
      p_prize_per_winner: resolved.isNewBatch ? prizePerWinner : 0,
      p_winner_count: resolved.isNewBatch ? winnerCount : 0,
      p_additional_prize_per_winner: !resolved.isNewBatch ? additionalPrize : 0,
      p_is_new_period: resolved.isNewBatch,
      p_status: 'waiting_payment',
      p_payment_status: 'pending',
      p_total_cost: 0,
      p_slot_booked_by: 'admin',
      // Dikirim EKSPLISIT, tidak dibiarkan kosong: kosong berarti "warisi
      // jadwal ordinal 1" di dalam RPC, dan di sini admin sudah menyatakan
      // pilihannya lewat toggle. Untuk order Kilat nilainya dibersihkan
      // trigger — kolam tambahan tidak berlaku di sana.
      p_is_extra_ad: isExtraMode,
    });
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
        /* Jalur Kilat memakai penyimpannya sendiri (`updateKilatSchedule`), jadi
           `handleSaveEdit` di bawah tidak pernah lewat — dan tanpa kait ini
           pemindahan tanggal Kilat oleh admin adalah satu-satunya perubahan
           jadwal yang tidak berkabar sama sekali.

           ⚠️ Dialog konsekuensi E1 memang BELUM berlaku di sini: gerbangnya
           hidup di `handleSave`, dan Kilat tidak melewatinya. Menaruhnya di
           dalam `KilatScheduleStep` berarti menyentuh komponen yang juga
           dipakai wizard checkout — pekerjaan Kilat yang sengaja ditunda ke
           sesi terpisah. Emailnya lebih dulu; kabar tanpa dialog tetap lebih
           baik daripada perubahan senyap. */
        onRescheduled={() => {
          void notifyScheduleChange({
            scheduleId: entry.id,
            event: 'moved',
            previousStart: entry.startDate,
          });
        }}
      />
    );
  }

  /*
    Dialog konsekuensi untuk E1. Isinya menyesuaikan keadaan, dan tiap barisnya
    hanya muncul kalau memang berlaku — tidak ada kalimat pengisi:

      * order sudah dibayar (selalu, sebab gerbangnya `isSchedulePaid`);
      * iklannya SEDANG TAYANG, kalau memang begitu — akibatnya berbeda total
        dari memindahkan iklan yang belum mulai;
      * tanggal lama -> tanggal baru, dua-duanya disebut;
      * penelitinya akan dikabari lewat email.

    Baris terakhir itu bukan basa-basi: ia yang membuat tombolnya jujur. Tanpa
    email, memindahkan tanggal iklan orang lain adalah perubahan senyap.
  */
  const moveDialog = (
    <Dialog open={!!pendingMove} onOpenChange={(open) => { if (!open) setPendingMove(null); }}>
      <DialogContent className="sm:max-w-[26rem] p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-gray-900">
            Geser tanggal tayang pesanan yang sudah dibayar?
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-center space-y-0.5">
          <p className="text-xs text-slate-500 line-through">
            {pendingMove?.from ? formatWibShort(pendingMove.from) : 'belum bertanggal'}
          </p>
          <p className="text-sm font-bold text-slate-800">
            {pendingMove ? formatWibShort(pendingMove.to) : ''}
          </p>
        </div>

        <div className="space-y-1.5">
          {entry && isAiringNowSchedule(entry) && (
            <p className="text-xs leading-relaxed text-amber-800 font-semibold">
              Iklan ini SEDANG TAYANG. Memindahkan tanggalnya mengubah periode tayang yang
              sudah berjalan, dan respondennya sudah melihat iklan itu di tanggal lama.
            </p>
          )}
          <p className="text-xs leading-relaxed text-slate-700 font-medium">
            Pesanan ini sudah dibayar. Uangnya tidak dikembalikan dan tidak ditagih ulang —
            yang bergeser hanya jendela tayangnya.
          </p>
          <p className="text-xs leading-relaxed text-slate-500">
            Tagihan lunas TIDAK ikut dianggap basi (sql/60), jadi kuitansinya tetap berlaku
            untuk pesanan ini.
          </p>
          <p className="text-xs leading-relaxed text-slate-500">
            Penelitinya akan menerima email berisi tanggal lama dan tanggal barunya.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            onClick={() => setPendingMove(null)}
            className="text-xs font-semibold h-9 px-5 text-gray-600 border-gray-200 hover:bg-gray-50"
          >
            Batal
          </Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold h-9 px-5"
            onClick={() => { setPendingMove(null); void commit(); }}
          >
            Ya, Geser Tanggal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-4">
      {moveDialog}
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

        {/* Kolam kuota. Ditaruh TEPAT DI ATAS kalender karena ia mengubah angka
            yang dibaca setiap kotak tanggal di bawahnya — dipisahkan jauh, admin
            akan mengira kalendernya salah hitung. Kilat tidak menampilkannya
            sama sekali: ia tidak punya kolam kedua. */}
        {!isKilatOrder && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Layers className="w-3.5 h-3.5 text-violet-600" />
              Kolam kuota
            </span>
            <div className="flex items-center gap-1" role="group" aria-label="Kolam kuota">
              {([
                { extra: false, label: 'Reguler', cap: MAX_REGULAR_ADS_PER_DAY },
                { extra: true, label: 'Tambahan', cap: MAX_EXTRA_ADS_PER_DAY },
              ] as const).map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  aria-pressed={isExtraMode === opt.extra}
                  onClick={() => setIsExtraMode(opt.extra)}
                  className={cn(
                    'px-2.5 py-1 rounded text-[11px] font-medium transition-colors border',
                    isExtraMode === opt.extra
                      ? 'bg-violet-50 border-violet-300 text-violet-700 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                  )}
                >
                  {opt.label} <span className="tabular-nums opacity-70">({opt.cap}/hari)</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
