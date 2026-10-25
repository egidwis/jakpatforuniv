import { useState } from 'react';
import { Loader2, Lock, Radio, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '../../ui/switch';
import { ConfirmDialog, type ConfirmRequest } from '../../ui/confirm-dialog';
import { supabase, type AdScheduleEntry } from '@/utils/supabase';
import { formatWibDay, formatWibTime } from '@/utils/airing-window';
import { BroadcastError, broadcastStateOf, kilatBroadcast, type BroadcastAction } from '@/utils/kilatBroadcast';
import { notifyAdminQueueChanged } from '@/utils/adminQueue';

/**
 * Toggle siaran satu gelombang Kilat (Phase 5 §5.4b, rilis R4).
 *
 * Nyala = push sudah terkirim: halaman & undian dibuka [nyala, +24 jam).
 * Mati  = siaran selesai: halaman tutup dan pemenang bisa dipilih seketika.
 * Satu arah — setelah selesai terkunci (server menolak menyalakan lagi).
 * Salah nyala bisa dibatalkan selama belum ada responden sejak nyala.
 */
const at = (iso: string | Date) => {
  const s = typeof iso === 'string' ? iso : iso.toISOString();
  return `${formatWibDay(s)} ${formatWibTime(s)} WIB`;
};

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

  const askStart = () => setConfirm({
    title: 'Nyalakan siaran?',
    lines: [
      'Nyalakan setelah push notification benar-benar terkirim.',
      st.isLate && 'Jendela sementara gelombang ini sudah habis — halaman dan undian akan DIBUKA LAGI selama 24 jam sejak sekarang, dan pemenang belum bisa dipilih sampai siaran selesai.',
      'Halaman & undian dibuka sampai 24 jam ke depan, atau sampai toggle dimatikan.',
    ],
    highlight: `Tutup otomatis ${at(new Date(now.getTime() + 24 * 3600_000))}`,
    confirmLabel: 'Nyalakan siaran',
    tone: 'neutral',
    onConfirm: () => run('broadcast-start', 'Siaran dinyalakan'),
  });

  const askEnd = async () => {
    const n = await respondentsSince(pageId, entry.broadcastAt!);
    setConfirm({
      title: 'Matikan siaran?',
      lines: [
        'Halaman ditutup ("Survey sudah berakhir") dan pemenang bisa dipilih seketika.',
        'Siaran tidak bisa dinyalakan lagi setelah dimatikan.',
      ],
      highlight: n == null ? undefined : `${n} responden sejak siaran dinyalakan`,
      confirmLabel: 'Matikan & tutup halaman',
      tone: 'danger',
      onConfirm: () => run('broadcast-end', 'Siaran selesai — halaman ditutup'),
    });
  };

  const askUndo = () => setConfirm({
    title: 'Batalkan nyala?',
    lines: [
      'Hanya untuk toggle yang salah dinyalakan. Ditolak bila sudah ada responden sejak nyala.',
      'Halaman kembali ke jendela gelombang semula.',
    ],
    confirmLabel: 'Batalkan nyala',
    tone: 'neutral',
    onConfirm: () => run('broadcast-undo', 'Nyala dibatalkan'),
  });

  const onToggle = (next: boolean) => {
    if (next && st.phase === 'pending') askStart();
    else if (!next && st.phase === 'live') askEnd();
  };

  const toggleDisabled = busy || !isPaid || st.phase === 'finished' || (st.phase === 'pending' && !st.canStart);

  return (
    <div className="rounded-lg border border-amber-300/70 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {st.phase === 'finished' ? <Lock className="w-4 h-4 text-gray-500 shrink-0" /> : <Radio className="w-4 h-4 text-amber-600 shrink-0" />}
          <div className="min-w-0">
            <div className="text-xs font-bold text-amber-950">
              {st.phase === 'pending' && 'Belum disiarkan'}
              {st.phase === 'live' && 'Sedang disiarkan'}
              {st.phase === 'finished' && `Selesai ${st.closesAt ? at(st.closesAt) : ''}`}
            </div>
            <div className="text-[11px] text-amber-800">
              {!isPaid && 'Toggle aktif setelah gelombang lunas.'}
              {isPaid && st.phase === 'pending' && !st.canStart && entry.startDate &&
                `Toggle aktif mulai ${at(new Date(new Date(entry.startDate).getTime() - 3600_000))}.`}
              {isPaid && st.phase === 'pending' && st.canStart && (st.isLate
                ? 'Jendela gelombang sudah lewat — masih bisa dinyalakan.'
                : 'Nyalakan setelah push terkirim.')}
              {st.phase === 'live' && st.closesAt && `Tutup otomatis ${at(st.closesAt)}.`}
              {st.phase === 'finished' && (st.isBackfill ? 'Diisi migrasi (gelombang lama).' : 'Terkunci.')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {busy && <Loader2 className="w-4 h-4 animate-spin text-amber-600" />}
          <Switch
            checked={st.phase !== 'pending'}
            disabled={toggleDisabled}
            onCheckedChange={onToggle}
            aria-label="Status siaran"
          />
        </div>
      </div>
      {st.phase === 'live' && (
        <button
          type="button"
          onClick={askUndo}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:underline disabled:opacity-50"
        >
          <Undo2 className="w-3 h-3" /> Salah nyala? Batalkan
        </button>
      )}
      <ConfirmDialog request={confirm} onDismiss={() => setConfirm(null)} />
    </div>
  );
}
