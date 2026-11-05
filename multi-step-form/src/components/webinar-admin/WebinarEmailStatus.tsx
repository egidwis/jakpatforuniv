import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminWebinarEvent } from '@/utils/webinarAdmin';
import {
    broadcastSummary, reminderStatus, ticketEmailState,
    type AdminBroadcast, type AdminWebinarOrder, type BroadcastKind, type Tone,
} from '@/utils/webinarParticipants';

const TONE: Record<Tone, string> = { ok: 'text-emerald-700', warn: 'text-amber-700', muted: 'text-slate-500' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-start sm:gap-3">
            <span className="shrink-0 text-[13px] font-medium text-slate-700 sm:w-36">{label}</span>
            <div className="min-w-0 flex-1 text-[13px]">{children}</div>
        </div>
    );
}

/**
 * Bagian "Email otomatis" di halaman Peserta. Admin tidak mengirim email dari sini:
 * pengingat H-1 dikirim cron, jadwal berubah & pembatalan ikut aksi di form/daftar.
 * Yang bisa dilakukan hanya "Kirim ulang yang gagal".
 */
export function WebinarEmailStatus({
    event, orders, broadcasts, retryingId, onRetry,
}: {
    event: AdminWebinarEvent;
    orders: AdminWebinarOrder[];
    broadcasts: AdminBroadcast[];
    retryingId: string | null;
    onRetry: (broadcastId: string) => void;
}) {
    const now = Date.now();
    const paid = orders.filter((o) => o.status === 'paid');
    const sent = paid.filter((o) => ticketEmailState(o, now) === 'sent').length;
    const failed = paid.filter((o) => ticketEmailState(o, now) === 'failed').length;
    const reminder = reminderStatus(event, broadcasts, now);

    const history = (kind: BroadcastKind) => {
        const list = broadcasts.filter((b) => b.kind === kind);
        if (list.length === 0) return <span className="text-slate-500">—</span>;
        return (
            <ul className="space-y-1">
                {list.slice(0, 3).map((b) => {
                    const s = broadcastSummary(b);
                    return (
                        <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className={cn('tabular-nums', TONE[s.tone])}>{s.text}</span>
                            {s.retryable && (
                                <button
                                    type="button"
                                    disabled={retryingId === b.id}
                                    onClick={() => onRetry(b.id)}
                                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-700 hover:underline disabled:opacity-60"
                                >
                                    {retryingId === b.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    Kirim ulang yang gagal
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        );
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <h2 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-slate-500">Email otomatis</h2>
            <Row label="E-tiket">
                {paid.length === 0
                    ? <span className="text-slate-500">—</span>
                    : <span className={cn('tabular-nums', failed ? TONE.warn : TONE.ok)}>
                        {sent}/{paid.length} terkirim{failed ? ` · ${failed} gagal (lihat peserta)` : ''}
                    </span>}
            </Row>
            <Row label="Pengingat H-1"><span className={TONE[reminder.tone]}>{reminder.text}</span></Row>
            <Row label="Jadwal berubah">{history('schedule_change')}</Row>
            {(event.status === 'cancelled' || broadcasts.some((b) => b.kind === 'cancellation')) && (
                <Row label="Pembatalan">{history('cancellation')}</Row>
            )}
        </section>
    );
}
