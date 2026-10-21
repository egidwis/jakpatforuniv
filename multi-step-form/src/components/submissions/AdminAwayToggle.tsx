import { useCallback, useEffect, useState } from 'react';
import { CalendarOff, Info, Loader2, PauseCircle, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Chip } from '../ui/chip';
import { AdminHolidayNotice } from '../status/AdminHolidayBanner';
import { supabase, fetchKilatSchedule, type KilatScheduleEntry } from '@/utils/supabase';
import { addDaysToYmd, formatYmdId, kilatWaveInstant, toWibYmd } from '@/utils/airing-window';
import { formatWaveHour } from '@/utils/kilatWaves';
import {
  ADMIN_AWAY_MESSAGE_MAX,
  adminAwayWrites,
  fetchActiveAwayRows,
  postHoliday,
  refreshAdminAway,
  useAdminAway,
  type AdminAway,
  type AwayAction,
} from '@/utils/operationalHolidays';

/**
 * Toggle "Mode libur" di halaman Submissions (keputusan 21 Okt 2026,
 * sql/120). Menggantikan menu kalender "Hari Libur".
 *
 * `useAdminAwayControl()` dipanggil SEKALI di InternalDashboard; keadaannya
 * dioper ke strip, pill (desktop & ponsel), dan popup — supaya ketiganya
 * membaca dan menulis hal yang sama.
 *
 * Saat menyala tampilannya SENGAJA MENCOLOK (strip oranye solid di atas tab):
 * tidak ada tanggal kembali yang dibaca mesin, jadi satu-satunya penjaga
 * "lupa dimatikan" adalah admin yang melihatnya setiap membuka Submissions.
 */

/** Hari ke-berapa masa libur ini (hari nyala = 1). */
export function awayDayCount(since: string, now: Date = new Date()): number {
  const today = toWibYmd(now);
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

const sinceLabel = (since: string) =>
  new Date(`${since}T12:00:00+07:00`).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta',
  });

/** Order Kilat yang dialihkan selama libur dan masih menunggu review. */
async function countDivertedAwaitingReview(): Promise<number> {
  const { count, error } = await supabase
    .from('form_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('distribution_type', 'kilat')
    .eq('forced_manual_reason', 'admin_away')
    .in('submission_status', ['in_review', 'pending']);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Gelombang Kilat mendatang yang masih memegang kursi — mode libur TIDAK
 * memindahkannya, jadi admin perlu tahu sebelum menyalakan.
 */
async function fetchUpcomingWaves(now: Date = new Date()): Promise<KilatScheduleEntry[]> {
  const today = toWibYmd(now);
  const rows = await fetchKilatSchedule(today, addDaysToYmd(today, 60));
  return rows
    .filter((r) => r.hour != null && kilatWaveInstant(r.ymd, r.hour).getTime() > now.getTime())
    .filter((r) => !['cancelled', 'slot_cancelled', 'rejected', 'spam'].includes(r.submissionStatus))
    .filter((r) => (r.paymentStatus || '').toLowerCase() !== 'expired')
    .sort((a, b) => a.ymd.localeCompare(b.ymd) || (a.hour ?? 0) - (b.hour ?? 0));
}

export type AdminAwayControl = ReturnType<typeof useAdminAwayControl>;

export function useAdminAwayControl() {
  const away = useAdminAway();
  const [dialog, setDialog] = useState<'on' | 'edit' | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [waves, setWaves] = useState<KilatScheduleEntry[] | null>(null);
  /** Ringkasan sekali-tampil sesudah toggle dimatikan. */
  const [offSummary, setOffSummary] = useState<{ diverted: number } | null>(null);

  useEffect(() => {
    if (dialog !== 'on') return;
    let alive = true;
    setWaves(null);
    fetchUpcomingWaves()
      .then((w) => { if (alive) setWaves(w); })
      .catch((e) => { console.warn('[mode libur] gagal membaca gelombang:', e); if (alive) setWaves([]); });
    return () => { alive = false; };
  }, [dialog]);

  const run = useCallback(async (action: AwayAction, done: string) => {
    setBusy(true);
    try {
      const active = action.kind === 'on' ? [] : await fetchActiveAwayRows();
      let last: Awaited<ReturnType<typeof postHoliday>> | null = null;
      for (const body of adminAwayWrites(action, active)) last = await postHoliday(body);
      await refreshAdminAway();
      toast.success(done);
      // Terjemahan dikerjakan server; gagal = label_en '' (libur tetap menyala).
      if (action.kind !== 'off' && action.message.trim() && last && !last.labelEn) {
        toast.warning('Terjemahan otomatis gagal — peneliti berbahasa Inggris melihat teks Indonesia. Simpan lagi untuk mencoba ulang.');
      }
      setDialog(null);
      return true;
    } catch (e: any) {
      console.error('[mode libur]', e);
      toast.error(e?.message || 'Gagal menyimpan mode libur.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const openOn = () => { setMessage(''); setOffSummary(null); setDialog('on'); };
  const openEdit = () => { setMessage(away?.message ?? ''); setDialog('edit'); };
  const close = () => { if (!busy) setDialog(null); };
  const submit = () => run(
    dialog === 'edit' ? { kind: 'edit', message } : { kind: 'on', message },
    dialog === 'edit' ? 'Pesan libur diperbarui.' : 'Mode libur aktif. Kilat ditutup untuk peneliti.',
  );
  const turnOff = async () => {
    if (!(await run({ kind: 'off' }, 'Mode libur dimatikan. Kilat dibuka lagi.'))) return;
    try {
      setOffSummary({ diverted: await countDivertedAwaitingReview() });
    } catch (e) {
      console.warn('[mode libur] gagal menghitung order yang dialihkan:', e);
    }
  };

  return {
    away, dialog, message, setMessage, busy, waves, offSummary,
    dismissOffSummary: () => setOffSummary(null),
    openOn, openEdit, close, submit, turnOff,
  };
}

/** Strip selebar halaman — mencolok saat menyala, ringkasan sesudah dimatikan. */
export function AdminAwayStrip({ control, onOpenKilat }: { control: AdminAwayControl; onOpenKilat: () => void }) {
  const { away, busy, offSummary } = control;
  if (away) {
    const days = awayDayCount(away.since);
    return (
      <div role="status" className="shrink-0 rounded-xl bg-orange-600 px-4 py-3 text-white shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="flex min-w-0 flex-1 items-start gap-2.5 text-sm">
            <span className="relative mt-1.5 flex size-2.5 shrink-0" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex size-2.5 rounded-full bg-white" />
            </span>
            <span>
              <strong className="font-bold tracking-wide">MODE LIBUR AKTIF</strong>{' '}
              sejak {sinceLabel(away.since)} ({days} hari) — peneliti melihat pengumuman dan Kilat tutup.
              {away.message && <span className="block text-orange-50/90">“{away.message}”</span>}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={control.openEdit}
              disabled={busy}
              className="rounded-lg border border-white/50 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60 cursor-pointer"
            >
              Ubah pesan
            </button>
            <button
              type="button"
              onClick={() => void control.turnOff()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-60 cursor-pointer"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Matikan
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (offSummary && offSummary.diverted > 0) {
    return (
      <div role="status" className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="flex min-w-0 flex-1 items-start gap-2.5 text-sm">
            <Zap className="size-4 mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
            <span>
              <strong>Mode libur dimatikan.</strong>{' '}
              {offSummary.diverted} order Kilat dialihkan selama libur menunggu review.
              Setujui, sepakati gelombang dengan penelitinya, lalu tugaskan + terbitkan tagihan.
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => { onOpenKilat(); control.dismissOffSummary(); }}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
            >
              Buka tab Kilat →
            </button>
            <button
              type="button"
              onClick={control.dismissOffSummary}
              aria-label="Tutup ringkasan"
              className="rounded-md p-1 text-amber-800 hover:bg-amber-100 cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

/** Pill/toggle. `compact` untuk baris aksi kartu filter ponsel. */
export function AdminAwayPill({ control, compact = false }: { control: AdminAwayControl; compact?: boolean }) {
  const { away, busy } = control;
  const on = !!away;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => (on ? void control.turnOff() : control.openOn())}
      title={on ? 'Matikan mode libur' : 'Nyalakan mode libur (tim admin libur)'}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border font-semibold transition-colors disabled:opacity-60 cursor-pointer ${
        compact ? 'h-8 px-2.5 text-xs' : 'h-8 px-3 text-xs'
      } ${on
        ? 'border-orange-600 bg-orange-600 text-white hover:bg-orange-700'
        : 'border-gray-300 bg-white text-gray-600 hover:border-orange-400 hover:text-orange-700'}`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-white/35' : 'bg-gray-200'}`}
      >
        <span className={`inline-block size-3 rounded-full shadow transition-transform ${on ? 'translate-x-3.5 bg-white' : 'translate-x-0.5 bg-white'}`} />
      </span>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {on
        ? (compact ? 'Libur' : `Libur aktif · ${awayDayCount(away!.since)} hari`)
        : (compact ? 'Libur' : 'Mode libur')}
    </button>
  );
}

const waveLine = (w: KilatScheduleEntry) =>
  `${formatYmdId(w.ymd)} ${formatWaveHour(w.hour ?? 0)} · ${w.title} · ${w.researcherName}`;

/** Popup nyalakan / ubah pesan. */
export function AdminAwayDialog({ control }: { control: AdminAwayControl }) {
  const { dialog, message, setMessage, busy, waves, away } = control;
  if (!dialog) return null;
  const isEdit = dialog === 'edit';
  const preview: AdminAway = { since: away?.since ?? toWibYmd(new Date()), message: message.trim(), messageEn: '' };
  const shown = (waves ?? []).slice(0, 5);
  const more = (waves?.length ?? 0) - shown.length;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) control.close(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg rounded-2xl bg-white p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="pr-6">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
            <CalendarOff className="size-4.5 text-orange-600" aria-hidden="true" />
            {isEdit ? 'Ubah pesan libur' : 'Aktifkan mode libur'}
          </DialogTitle>
          {!isEdit && (
            <DialogDescription className="mt-1.5 text-sm text-gray-600 leading-relaxed">
              Selama menyala: peneliti melihat pengumuman di dashboard & chat Mimin, modal muncul
              sebelum submit/bayar, dan Kilat tidak bisa dipesan. Iklan tetap tayang otomatis.
            </DialogDescription>
          )}
          {isEdit && <DialogDescription className="sr-only">Pesan yang tampil ke peneliti selama libur.</DialogDescription>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="admin-away-message" className="text-sm font-semibold text-gray-800">
              Pesan untuk peneliti <span className="font-normal text-gray-500">(opsional)</span>
            </label>
            <span className={`text-xs tabular-nums ${message.length >= ADMIN_AWAY_MESSAGE_MAX ? 'text-orange-700 font-semibold' : 'text-gray-500'}`}>
              {message.length}/{ADMIN_AWAY_MESSAGE_MAX}
            </span>
          </div>
          <textarea
            id="admin-away-message"
            value={message}
            maxLength={ADMIN_AWAY_MESSAGE_MAX}
            rows={2}
            onChange={(e) => setMessage(e.target.value.replace(/\n/g, ' '))}
            placeholder="Contoh: Libur Natal. Kami kembali Senin, 29 Des."
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
          {!isEdit && <p className="text-xs text-gray-500">Diterjemahkan otomatis ke bahasa Inggris saat disimpan.</p>}
          {isEdit && away && (
            <div className="space-y-0.5 pt-1">
              <p className="text-xs font-semibold text-gray-600">Versi Inggris (otomatis)</p>
              {away.messageEn
                ? <p className="text-sm text-gray-700 italic break-words">“{away.messageEn}”</p>
                : away.message
                  ? <p className="text-xs text-orange-800">⚠ Terjemahan gagal — peneliti berbahasa Inggris melihat teks Indonesia. Simpan lagi untuk mencoba ulang.</p>
                  : <p className="text-xs text-gray-500">—</p>}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pratinjau banner</p>
          <AdminHolidayNotice away={preview} />
        </div>

        {!isEdit && waves === null && (
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="size-3.5 animate-spin" /> Memeriksa gelombang Kilat mendatang…
          </p>
        )}
        {!isEdit && shown.length > 0 && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-3 text-sm text-orange-950">
            <p className="font-semibold">⚠ {waves!.length} gelombang Kilat mendatang belum disiarkan</p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-orange-900">
              {shown.map((w) => <li key={`${w.id}-${w.ymd}-${w.hour}`} className="truncate">{waveLine(w)}</li>)}
              {more > 0 && <li className="font-medium">dan {more} lainnya</li>}
            </ul>
            <p className="mt-1.5 text-xs text-orange-900 leading-relaxed">
              Mode libur tidak memindahkan pesanan ini. Pindahkan dari tab Kilat (admin tetap bisa walau libur)
              atau hubungi penelitinya.
            </p>
          </div>
        )}
        {!isEdit && (
          <p className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
            <Info className="size-3.5 mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
            Order Kilat baru selama libur otomatis menjadi jalur manual dan masuk antrean review (bertanda
            “Dialihkan saat libur”). Setelah kembali: setujui, sepakati gelombang dengan peneliti, lalu tugaskan +
            terbitkan tagihan.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={control.close}
            disabled={busy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void control.submit()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60 cursor-pointer"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? 'Simpan' : 'Aktifkan libur'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Penanda order Kilat yang dialihkan ke jalur manual karena mode libur
 * (`forced_manual_reason = 'admin_away'`). Tetap tampil sampai lunas, supaya
 * admin ingat menghubungi penelitinya saat menugaskan gelombang.
 */
export function DivertedAwayChip({ reason, paymentStatus }: { reason?: string | null; paymentStatus?: string | null }) {
  if (reason !== 'admin_away') return null;
  if (['paid', 'completed'].includes((paymentStatus || '').toLowerCase())) return null;
  return (
    <Chip variant="amber" size="xs" className="shrink-0 gap-1" title="Kilat jalur otomatis yang dikirim selama mode libur — admin menugaskan gelombangnya bersama peneliti.">
      <PauseCircle className="size-3" aria-hidden="true" />
      Dialihkan saat libur
    </Chip>
  );
}
