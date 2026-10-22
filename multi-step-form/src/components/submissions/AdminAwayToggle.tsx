import { useCallback, useState } from 'react';
import { CalendarOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { AdminHolidayNotice } from '../status/AdminHolidayBanner';
import { toWibYmd } from '@/utils/airing-window';
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
 * sql/122). Menggantikan menu kalender "Hari Libur".
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

export type AdminAwayControl = ReturnType<typeof useAdminAwayControl>;

export function useAdminAwayControl() {
  const away = useAdminAway();
  const [dialog, setDialog] = useState<'on' | 'edit' | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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

  const openOn = () => { setMessage(''); setDialog('on'); };
  const openEdit = () => { setMessage(away?.message ?? ''); setDialog('edit'); };
  const close = () => { if (!busy) setDialog(null); };
  const submit = () => run(
    dialog === 'edit' ? { kind: 'edit', message } : { kind: 'on', message },
    dialog === 'edit' ? 'Pesan libur diperbarui.' : 'Mode libur aktif. Kilat ditutup untuk peneliti.',
  );
  const turnOff = () => run({ kind: 'off' }, 'Mode libur dimatikan. Kilat dibuka lagi.');

  return {
    away, dialog, message, setMessage, busy,
    openOn, openEdit, close, submit, turnOff,
  };
}

/** Strip selebar halaman — mencolok saat menyala. */
export function AdminAwayStrip({ control }: { control: AdminAwayControl }) {
  const { away, busy } = control;
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

/** Popup nyalakan / ubah pesan. */
export function AdminAwayDialog({ control }: { control: AdminAwayControl }) {
  const { dialog, message, setMessage, busy, away } = control;
  if (!dialog) return null;
  const isEdit = dialog === 'edit';
  const preview: AdminAway = { since: away?.since ?? toWibYmd(new Date()), message: message.trim(), messageEn: '' };

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
