import { useState } from 'react';
import { Loader2, Lock, Radio, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '../../ui/switch';
import { ConfirmDialog, type ConfirmRequest } from '../../ui/confirm-dialog';
import { supabase, type AdScheduleEntry } from '@/utils/supabase';
import { formatWibDay, formatWibTime } from '@/utils/airing-window';
import { BroadcastError, LONG_LIVE_MS, broadcastStateOf, kilatBroadcast, type BroadcastAction } from '@/utils/kilatBroadcast';
import { notifyAdminQueueChanged } from '@/utils/adminQueue';

/**
 * Siaran satu gelombang Kilat v2 (sql/130).
 *
 * Live OTOMATIS 60 menit sebelum gelombang — admin cukup mengirim push.
 * Live tanpa batas sampai dimatikan. Matikan = halaman tutup untuk pengunjung
 * baru; 60 menit tenggang isian sesi terbuka masih diterima dan siaran bisa
 * dinyalakan lagi gratis (salah matikan, push gagal). Sesudah tenggang
 * terkunci dan pemenang bisa dipilih.
 */
const at = (iso: string | Date) => {
  const s = typeof iso === 'string' ? iso : iso.toISOString();
  return `${formatWibDay(s)} ${formatWibTime(s)} WIB`;
};

const hours = (ms: number) => Math.floor(ms / 3600_000);
const minutesLeft = (until: Date, now: Date) => Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));

async function respondentsSince(pageId: string | undefined, sinceIso: string): Promise<number | null> {
  if (!pageId) return null;
  const { count, error } = await supabase
    .from('page_respondents')
    .select('id', { count: 'exact', head: true })
    .eq('page_id', pageId)
    .gte('created_at', sinceIso);
  return error ? null : count ?? 0;
}

export function KilatBroadcastToggle({
  entry,
  pageId,
  onChanged,
}: {
  entry: AdScheduleEntry;
  pageId?: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const now = new Date();
  const st = broadcastStateOf(entry, now);
  const isPaid = ['paid', 'completed'].includes((entry.paymentStatus || '').toLowerCase()) || !!entry.airOnCreditAt;

  const run = async (action: BroadcastAction, success: string) => {
    setBusy(true);
    try {
      await kilatBroadcast(action, entry.id);
      toast.success(success);
      notifyAdminQueueChanged();
      onChanged();
    } catch (err) {
      toast.error(err instanceof BroadcastError ? err.message : 'Gagal mengubah status siaran');
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const askEnd = async () => {
    const n = st.opensAt ? await respondentsSince(pageId, st.opensAt.toISOString()) : null;
    setConfirm({
      title: 'Matikan siaran?',
      lines: [
        'Halaman langsung tertutup untuk pengunjung baru ("Survey sudah berakhir").',
        'Selama 60 menit isian yang sedang diisi masih diterima, dan siaran masih bisa dinyalakan lagi.',
        'Sesudah itu siaran terkunci dan pemenang bisa dipilih.',
      ],
      highlight: n == null ? undefined : `${n} responden sejak live`,
      confirmLabel: 'Matikan & tutup halaman',
      tone: 'danger',
      onConfirm: () => run('broadcast-end', 'Siaran dimatikan — tenggang 60 menit berjalan'),
    });
  };

  const askReopen = () => setConfirm({
    title: 'Nyalakan lagi?',
    lines: [
      'Untuk siaran yang dimatikan terlalu cepat atau push yang gagal. Gratis — gelombang dan batch undian tetap sama.',
      'Halaman dibuka lagi dan live sampai dimatikan.',
    ],
    highlight: st.closesAt ? `Bisa sampai ${at(st.closesAt)}` : undefined,
    confirmLabel: 'Nyalakan lagi',
    tone: 'neutral',
    onConfirm: () => run('broadcast-reopen', 'Siaran dinyalakan lagi'),
  });

  const onToggle = (next: boolean) => {
    if (!next && st.phase === 'live') askEnd();
    else if (next && st.phase === 'grace') askReopen();
  };

  const toggleDisabled = busy || !isPaid || st.phase === 'scheduled' || st.phase === 'finished' || (st.phase === 'grace' && st.isSuperseded);
  const longLive = st.phase === 'live' && st.liveForMs >= LONG_LIVE_MS;

  return (
    <div className={`rounded-lg border bg-white p-3 space-y-2 ${longLive ? 'border-red-300' : 'border-amber-300/70'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {st.phase === 'finished' ? <Lock className="w-4 h-4 text-gray-500 shrink-0" /> : <Radio className="w-4 h-4 text-amber-600 shrink-0" />}
          <div className="min-w-0">
            <div className="text-xs font-bold text-amber-950">
              {st.phase === 'scheduled' && (st.opensAt ? `Live otomatis ${at(st.opensAt)}` : 'Belum punya gelombang')}
              {st.phase === 'live' && (st.opensAt ? `Live sejak ${at(st.opensAt)}` : 'Live')}
              {st.phase === 'grace' && st.endedAt && `Dimatikan ${at(st.endedAt)}`}
              {st.phase === 'finished' && `Selesai ${st.closesAt ? at(st.closesAt) : ''}`}
            </div>
            <div className={`text-[11px] ${longLive ? 'text-red-700 font-semibold' : 'text-amber-800'}`}>
              {!isPaid && 'Live otomatis setelah gelombang lunas.'}
              {isPaid && st.phase === 'scheduled' && 'Kirim push setelah halaman live.'}
              {isPaid && st.phase === 'live' && (longLive
                ? `Sudah live ${hours(st.liveForMs)} jam — matikan bila push sudah selesai.`
                : 'Matikan setelah push selesai.')}
              {st.phase === 'grace' && st.closesAt && (st.isSuperseded
                ? 'Diakhiri otomatis karena gelombang berikutnya sudah live.'
                : `Tenggang ${minutesLeft(st.closesAt, now)} menit lagi — masih bisa dinyalakan lagi.`)}
              {st.phase === 'finished' && (st.isBackfill
                ? 'Diisi migrasi (gelombang lama).'
                : st.isSuperseded ? 'Diakhiri gelombang berikutnya. Terkunci.' : 'Terkunci — pemenang bisa dipilih.')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {busy && <Loader2 className="w-4 h-4 animate-spin text-amber-600" />}
          <Switch
            checked={st.phase === 'live'}
            disabled={toggleDisabled}
            onCheckedChange={onToggle}
            aria-label="Status siaran"
          />
        </div>
      </div>
      {st.phase === 'grace' && !st.isSuperseded && (
        <button
          type="button"
          onClick={askReopen}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:underline disabled:opacity-50"
        >
          <RotateCcw className="w-3 h-3" /> Nyalakan lagi
        </button>
      )}
      <ConfirmDialog request={confirm} onDismiss={() => setConfirm(null)} />
    </div>
  );
}
