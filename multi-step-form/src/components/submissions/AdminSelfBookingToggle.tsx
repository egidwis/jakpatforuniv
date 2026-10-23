import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Chip } from '../ui/chip';
import { supabase } from '@/utils/supabase';
import { ADMIN_AWAY_MESSAGE_MAX, type AwayAction } from '@/utils/operationalHolidays';
import {
  closureWrites,
  fetchActiveClosureRows,
  postSelfBooking,
  refreshSelfBookingClosure,
  useSelfBookingClosure,
} from '@/utils/selfBookingClosure';

/**
 * Saklar "Tutup reservasi mandiri" di halaman Submissions (sql/125, keputusan
 * 22 Okt 2026). Kembaran `AdminAwayToggle`: `useSelfBookingControl()`
 * dipanggil SEKALI di InternalDashboard dan dioper ke strip, pill, dan popup.
 *
 * Saat ditutup tampilannya SENGAJA MENCOLOK (strip gelap di atas tab): tidak
 * ada tanggal buka yang dibaca mesin, jadi penjaga "lupa dibuka" adalah admin
 * yang melihatnya setiap membuka Submissions.
 */

const sinceLabel = (since: string) =>
  new Date(`${since}T12:00:00+07:00`).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta',
  });

/** Slot yang dikunci peneliti sendiri dan masih dalam jendela bayar 1 jam. */
async function countActiveSelfHolds(now: Date = new Date()): Promise<number> {
  const { count, error } = await supabase
    .from('form_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('slot_booked_by', 'user')
    .not('payment_status', 'in', '(paid,completed)')
    .gt('slot_reserved_at', new Date(now.getTime() - 3_600_000).toISOString());
  if (error) throw error;
  return count ?? 0;
}

/** Order bercap (lahir saat ditutup) yang belum diberi tanggal oleh tim. */
async function countCappedWaiting(): Promise<number> {
  const { count, error } = await supabase
    .from('form_submissions')
    .select('id', { count: 'exact', head: true })
    .not('self_booking_closed_at', 'is', null)
    .is('start_date', null)
    .not('submission_status', 'in', '(cancelled,rejected,spam,slot_cancelled)');
  if (error) throw error;
  return count ?? 0;
}

export type SelfBookingControl = ReturnType<typeof useSelfBookingControl>;

export function useSelfBookingControl() {
  const closure = useSelfBookingClosure();
  const [dialog, setDialog] = useState<'on' | 'edit' | 'off' | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [holds, setHolds] = useState<number | null>(null);
  const [capped, setCapped] = useState<number | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      const [h, c] = await Promise.all([countActiveSelfHolds(), countCappedWaiting()]);
      setHolds(h);
      setCapped(c);
    } catch (e) {
      console.warn('[reservasi mandiri] gagal menghitung order:', e);
    }
  }, []);

  // Dihitung saat popup dibuka dan selama ditutup (angka di strip).
  useEffect(() => {
    if (dialog || closure) void loadCounts();
  }, [dialog, closure, loadCounts]);

  const run = useCallback(async (action: AwayAction, done: string) => {
    setBusy(true);
    try {
      const active = action.kind === 'on' ? [] : await fetchActiveClosureRows();
      let last: Awaited<ReturnType<typeof postSelfBooking>> | null = null;
      for (const body of closureWrites(action, active)) last = await postSelfBooking(body);
      await refreshSelfBookingClosure();
      toast.success(done);
      if (action.kind !== 'off' && action.message.trim() && last && !last.labelEn) {
        toast.warning('Terjemahan otomatis gagal — peneliti berbahasa Inggris melihat teks Indonesia. Simpan lagi untuk mencoba ulang.');
      }
      setDialog(null);
      return true;
    } catch (e: any) {
      console.error('[reservasi mandiri]', e);
      toast.error(e?.message || 'Gagal menyimpan saklar reservasi mandiri.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const openOn = () => { setMessage(''); setDialog('on'); };
  const openEdit = () => { setMessage(closure?.message ?? ''); setDialog('edit'); };
  const openOff = () => setDialog('off');
  const close = () => { if (!busy) setDialog(null); };
  const submit = () => run(
    dialog === 'edit' ? { kind: 'edit', message } : { kind: 'on', message },
    dialog === 'edit' ? 'Pesan diperbarui.' : 'Reservasi mandiri ditutup. Order jalur otomatis kini dijadwalkan tim.',
  );
  const confirmOff = () => run({ kind: 'off' }, 'Reservasi mandiri dibuka lagi.');

  return { closure, dialog, message, setMessage, busy, holds, capped, openOn, openEdit, openOff, close, submit, confirmOff };
}

/** Strip selebar halaman — hanya saat ditutup. */
export function AdminSelfBookingStrip({ control, onShowOrders }: { control: SelfBookingControl; onShowOrders: () => void }) {
  const { closure, busy, capped } = control;
  if (!closure) return null;
  return (
    <div role="status" className="shrink-0 rounded-xl bg-slate-800 px-4 py-3 text-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex min-w-0 flex-1 items-start gap-2.5 text-sm">
          <Lock className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-bold tracking-wide">RESERVASI MANDIRI DITUTUP</strong>{' '}
            sejak {sinceLabel(closure.since)}
            {capped != null && <> · {capped} order menunggu dijadwalkan tim</>}
            {closure.message && <span className="block text-slate-200">“{closure.message}”</span>}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onShowOrders}
            className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 cursor-pointer"
          >
            Lihat order
          </button>
          <button
            type="button"
            onClick={control.openEdit}
            disabled={busy}
            className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60 cursor-pointer"
          >
            Ubah pesan
          </button>
          <button
            type="button"
            onClick={control.openOff}
            disabled={busy}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-60 cursor-pointer"
          >
            Buka lagi
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pill/toggle. `compact` untuk baris aksi kartu filter ponsel. */
export function AdminSelfBookingPill({ control, compact = false }: { control: SelfBookingControl; compact?: boolean }) {
  const { closure, busy } = control;
  const closed = !!closure;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={closed}
      disabled={busy}
      onClick={() => (closed ? control.openOff() : control.openOn())}
      title={closed ? 'Buka reservasi mandiri' : 'Tutup reservasi mandiri (tim yang menjadwalkan)'}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border h-8 font-semibold transition-colors disabled:opacity-60 cursor-pointer ${
        compact ? 'px-2.5 text-xs' : 'px-3 text-xs'
      } ${closed
        ? 'border-slate-800 bg-slate-800 text-white hover:bg-slate-900'
        : 'border-gray-300 bg-white text-gray-600 hover:border-slate-500 hover:text-slate-800'}`}
    >
      <Lock className="size-3.5" aria-hidden="true" />
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {compact ? (closed ? 'Ditutup' : 'Reservasi') : (closed ? 'Reservasi mandiri: TUTUP' : 'Reservasi mandiri: buka')}
    </button>
  );
}

/** Popup tutup / ubah pesan / buka lagi. */
export function AdminSelfBookingDialog({ control }: { control: SelfBookingControl }) {
  const { dialog, message, setMessage, busy, holds, capped, closure } = control;
  if (!dialog) return null;

  if (dialog === 'off') {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) control.close(); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg rounded-2xl bg-white p-5 sm:p-6">
          <div className="pr-6">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
              <Lock className="size-4.5 text-slate-700" aria-hidden="true" />
              Buka reservasi mandiri
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-sm text-gray-600 leading-relaxed">
              Peneliti jalur otomatis bisa memilih tanggal dan membayar sendiri lagi.
            </DialogDescription>
          </div>
          {capped != null && capped > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950">
              <strong>{capped} order</strong> yang masuk selama ditutup TETAP menunggu tim — jadwalkan dan terbitkan
              tagihannya dari daftar Approved (bertanda “Reservasi ditutup”).
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
              onClick={() => void control.confirmOff()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-60 cursor-pointer"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Buka lagi
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isEdit = dialog === 'edit';
  return (
    <Dialog open onOpenChange={(open) => { if (!open) control.close(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg rounded-2xl bg-white p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="pr-6">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
            <Lock className="size-4.5 text-slate-700" aria-hidden="true" />
            {isEdit ? 'Ubah pesan reservasi mandiri' : 'Tutup reservasi mandiri'}
          </DialogTitle>
          {!isEdit && (
            <DialogDescription asChild>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-600 leading-relaxed">
                <li>Order jalur otomatis tetap lolos review, tapi lahir TANPA tanggal — tim yang menjadwalkan dan menerbitkan tagihan.</li>
                <li>Peneliti tidak bisa memilih, memilih ulang, atau memperpanjang jadwal sendiri.</li>
                <li>Order yang masuk selama ditutup TETAP dijadwalkan tim, walau saklar dibuka lagi.</li>
                <li>
                  {holds == null
                    ? 'Menghitung slot mandiri yang sedang menunggu bayar…'
                    : `${holds} slot mandiri sedang menunggu bayar — tetap boleh dibayar (paling lama 1 jam).`}
                </li>
              </ul>
            </DialogDescription>
          )}
          {isEdit && <DialogDescription className="sr-only">Pesan yang tampil ke peneliti selama reservasi mandiri ditutup.</DialogDescription>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="self-booking-message" className="text-sm font-semibold text-gray-800">
              Pesan untuk peneliti <span className="font-normal text-gray-500">(opsional)</span>
            </label>
            <span className={`text-xs tabular-nums ${message.length >= ADMIN_AWAY_MESSAGE_MAX ? 'text-slate-900 font-semibold' : 'text-gray-500'}`}>
              {message.length}/{ADMIN_AWAY_MESSAGE_MAX}
            </span>
          </div>
          <textarea
            id="self-booking-message"
            value={message}
            maxLength={ADMIN_AWAY_MESSAGE_MAX}
            rows={2}
            onChange={(e) => setMessage(e.target.value.replace(/\n/g, ' '))}
            placeholder="Contoh: Sedang ada penyesuaian jadwal tayang."
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/30"
          />
          {!isEdit && <p className="text-xs text-gray-500">Diterjemahkan otomatis ke bahasa Inggris saat disimpan.</p>}
          {isEdit && closure && (
            <div className="space-y-0.5 pt-1">
              <p className="text-xs font-semibold text-gray-600">Versi Inggris (otomatis)</p>
              {closure.messageEn
                ? <p className="text-sm text-gray-700 italic break-words">“{closure.messageEn}”</p>
                : closure.message
                  ? <p className="text-xs text-amber-800">⚠ Terjemahan gagal — peneliti berbahasa Inggris melihat teks Indonesia. Simpan lagi untuk mencoba ulang.</p>
                  : <p className="text-xs text-gray-500">—</p>}
            </div>
          )}
        </div>

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
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-60 cursor-pointer"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? 'Simpan' : 'Tutup reservasi'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Penanda order bercap (sql/125) yang belum diberi tanggal oleh tim — supaya
 * admin tahu order ini menunggu DIA, bukan peneliti.
 */
export function SelfBookingClosedChip({ cappedAt, startDate }: { cappedAt?: string | null; startDate?: string | null }) {
  if (!cappedAt || startDate) return null;
  return (
    <Chip variant="slate" size="xs" className="shrink-0 gap-1" title="Lahir saat reservasi mandiri ditutup — tim yang menetapkan tanggal & menerbitkan tagihan.">
      <Lock className="size-3" aria-hidden="true" />
      Reservasi ditutup
    </Chip>
  );
}
