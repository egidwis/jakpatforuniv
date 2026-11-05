import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/utils/csv';
import { adminDateLabel, formatRupiah } from '@/utils/webinarAdmin';
import { errorMessage } from '@/utils/webinarParticipants';
import { listParticipants, refundOrder, resendTicket, retryEmail, type ParticipantsResult } from '@/utils/webinarAdminApi';
import {
    alarmLabel, filterParticipants, groupCounts, participantCsv, participantStats, ticketEmailState, unpaidLabel,
    type AdminWebinarOrder, type ParticipantGroup,
} from '@/utils/webinarParticipants';
import { WebinarEmailStatus } from './WebinarEmailStatus';
import { WebinarRefundDialog, WebinarResendDialog } from './WebinarOrderDialogs';
import { WebinarParticipantSheet } from './WebinarParticipantSheet';

const GROUPS: { key: ParticipantGroup; label: string }[] = [
    { key: 'paid', label: 'Lunas' },
    { key: 'unpaid', label: 'Belum bayar' },
    { key: 'refunded', label: 'Refund' },
];

const TONE_CLASS: Record<string, string> = {
    on_sale: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    soon: 'bg-amber-50 text-amber-700 ring-amber-200',
    held: 'bg-orange-50 text-orange-700 ring-orange-200',
    ended: 'bg-slate-100 text-slate-600 ring-slate-200',
};

function EmailBadge({ order, now }: { order: AdminWebinarOrder; now: number }) {
    const state = ticketEmailState(order, now);
    if (state === 'sent') return <span className="text-[12px] font-medium text-emerald-700">✓ E-tiket</span>;
    if (state === 'failed') return <span className="text-[12px] font-medium text-amber-700">⚠ E-tiket gagal</span>;
    if (state === 'sending') return <span className="text-[12px] text-slate-500">E-tiket dikirim…</span>;
    if (state === 'pending') return <span className="text-[12px] text-slate-500">E-tiket belum</span>;
    return null;
}

function rowNote(order: AdminWebinarOrder, now: number): string | null {
    if (order.status === 'refunded') {
        const when = order.refunded_at ? adminDateLabel(order.refunded_at)?.split(' · ')[0] : '';
        return `Refund ${when}${order.refund_note ? ` · “${order.refund_note}”` : ''}`;
    }
    if (order.status !== 'paid') return unpaidLabel(order, now);
    return null;
}

/** C4. Halaman Peserta satu acara (menu Webinar admin, Fase 3). */
export function WebinarParticipantsPage({ eventId, onBack }: { eventId: string; onBack: () => void }) {
    const [data, setData] = useState<ParticipantsResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [group, setGroup] = useState<ParticipantGroup>('paid');
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [resendFor, setResendFor] = useState<AdminWebinarOrder | null>(null);
    const [refundFor, setRefundFor] = useState<AdminWebinarOrder | null>(null);
    const [retryingId, setRetryingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setData(await listParticipants(eventId));
            setError(null);
        } catch (err) {
            setError(errorMessage(err, 'Daftar peserta belum bisa dimuat'));
        } finally {
            setLoading(false);
        }
    }, [eventId]);

    useEffect(() => { void load(); }, [load]);

    const now = Date.now();
    const orders = useMemo(() => data?.orders ?? [], [data]);
    const visible = useMemo(() => filterParticipants(orders, group, query), [orders, group, query]);
    const counts = groupCounts(orders);
    const selected = orders.find((o) => o.id === selectedId) ?? null;

    if (loading) {
        return <div className="mx-auto w-full max-w-5xl space-y-3 px-5 pt-6">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/70" />)}</div>;
    }
    if (error || !data) {
        return (
            <div className="mx-auto max-w-5xl px-5 pt-6">
                <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" /> Semua acara</button>
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
                    {error}
                    <div className="mt-3"><Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(); }}>Coba lagi</Button></div>
                </div>
            </div>
        );
    }

    const { event, broadcasts, deliveries } = data;
    const stats = participantStats(orders, event.webinar_offer_state);
    const exportCsv = () => {
        const { headers, rows } = participantCsv(visible);
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        downloadCsv(`peserta-${event.slug}-${today}.csv`, headers, rows);
    };

    const submitResend = async (order: AdminWebinarOrder, email: string) => {
        try {
            const r = await resendTicket(order.id, email !== order.buyer_email ? email : undefined);
            toast.success(`E-tiket dikirim ke ${r.email}`);
            setResendFor(null);
            void load();
        } catch (err) {
            toast.error(errorMessage(err, 'E-tiket belum bisa dikirim ulang'));
        }
    };

    const submitRefund = async (order: AdminWebinarOrder, note: string) => {
        try {
            await refundOrder(order.id, note);
            toast.success('Tiket ditandai refund. Kabari pembeli sendiri.');
            setRefundFor(null);
            setSelectedId(null);
            void load();
        } catch (err) {
            toast.error(errorMessage(err, 'Refund belum bisa dicatat'));
        }
    };

    const retry = async (broadcastId: string) => {
        setRetryingId(broadcastId);
        try {
            const r = await retryEmail(broadcastId);
            toast.success(r.requeued ? `${r.requeued} email dikirim ulang` : 'Tidak ada email gagal yang bisa dikirim ulang');
            void load();
        } catch (err) {
            toast.error(errorMessage(err, 'Email belum bisa dikirim ulang'));
        } finally {
            setRetryingId(null);
        }
    };

    const badge = event.status === 'draft' ? 'Draft' : event.view.badge;
    const tone = event.status === 'draft' ? 'ended' : event.view.tone;

    return (
        <div className="flex min-h-full flex-col">
            <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-5 pb-24 pt-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-900">
                            <ArrowLeft className="h-4 w-4" /> Semua acara
                        </button>
                        <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">
                            {event.title}
                            {event.is_test && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">UJI</span>}
                        </h1>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600">
                            {event.starts_at && <span>{adminDateLabel(event.starts_at)}</span>}
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', TONE_CLASS[tone] ?? TONE_CLASS.ended)}>{badge}</span>
                        </div>
                    </div>
                    <Button variant="outline" onClick={exportCsv} disabled={visible.length === 0} className="hidden h-9 shrink-0 gap-1.5 text-sm font-semibold sm:inline-flex">
                        <Download className="h-4 w-4" /> Ekspor CSV ({visible.length})
                    </Button>
                </div>

                {event.status === 'cancelled' && (
                    <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-slate-700">
                        <AlertTriangle className="h-4 w-4 shrink-0" /> Acara dibatalkan. Status email pembatalan ada di bawah.
                    </div>
                )}

                <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
                    {[
                        { label: 'Lunas', value: event.quota != null ? `${stats.paid} / ${event.quota}` : String(stats.paid) },
                        { label: 'Ditahan', value: String(stats.held) },
                        { label: 'Izin kontak', value: String(stats.consent) },
                    ].map((s) => (
                        <div key={s.label} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                            <p className="text-[12px] text-slate-500">{s.label}</p>
                            <p className="text-lg font-bold tabular-nums text-slate-900">{s.value}</p>
                        </div>
                    ))}
                    <div className="hidden rounded-2xl border border-slate-200 bg-white px-3 py-2.5 lg:block">
                        <p className="text-[12px] text-slate-500">Pendapatan{event.is_test ? ' (uji)' : ''}</p>
                        <p className="text-lg font-bold tabular-nums text-slate-900">{formatRupiah(stats.revenue)}</p>
                    </div>
                </div>
                <p className="text-[13px] text-slate-600 lg:hidden">Pendapatan{event.is_test ? ' (uji)' : ''} <strong className="tabular-nums">{formatRupiah(stats.revenue)}</strong></p>

                <WebinarEmailStatus event={event} orders={orders} broadcasts={broadcasts} retryingId={retryingId} onRetry={retry} />

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
                        {GROUPS.map((g) => (
                            <button
                                key={g.key}
                                type="button"
                                onClick={() => setGroup(g.key)}
                                className={cn('shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset',
                                    group === g.key ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50')}
                            >
                                {g.label} {counts[g.key]}
                            </button>
                        ))}
                    </div>
                    <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 lg:w-80">
                        <Search className="h-4 w-4 shrink-0 text-slate-400" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Cari nama, email, kode tiket"
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        />
                    </label>
                </div>

                {visible.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center text-[13px] text-slate-500">
                        {query ? 'Tidak ada peserta yang cocok.' : group === 'paid' ? 'Belum ada tiket lunas.' : group === 'unpaid' ? 'Tidak ada order yang belum dibayar.' : 'Belum ada refund.'}
                    </div>
                ) : (
                    <>
                        {/* HP: kartu */}
                        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:hidden">
                            {visible.map((o) => {
                                const alarm = alarmLabel(o.alarm_outcome);
                                const note = rowNote(o, now);
                                return (
                                    <li key={o.id}>
                                        <button type="button" onClick={() => setSelectedId(o.id)} className="block w-full px-4 py-3 text-left hover:bg-slate-50">
                                            <div className="flex items-start justify-between gap-2">
                                                <span className="min-w-0 truncate text-[14px] font-semibold text-slate-900">{o.buyer_name || 'Peserta'}</span>
                                                {alarm ? <span className="shrink-0 text-[12px] font-medium text-amber-700">⚠ {alarm}</span> : <EmailBadge order={o} now={now} />}
                                            </div>
                                            <p className="truncate text-[13px] text-slate-600">{o.buyer_email}</p>
                                            <p className="text-[12px] text-slate-500">
                                                {note ?? [o.buyer_university, o.ticket_code, `Izin ${o.marketing_consent ? '✓' : '–'}`].filter(Boolean).join(' · ')}
                                            </p>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>

                        {/* Desktop: tabel */}
                        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block">
                            <table className="w-full text-left text-[13px]">
                                <thead className="bg-slate-50 text-[12px] font-semibold text-slate-600">
                                    <tr>
                                        <th className="px-4 py-2.5">Nama</th>
                                        <th className="px-3 py-2.5">Email e-tiket</th>
                                        <th className="px-3 py-2.5">Kampus</th>
                                        <th className="px-3 py-2.5">{group === 'paid' ? 'Kode tiket' : 'Keterangan'}</th>
                                        {group === 'paid' && <th className="px-3 py-2.5">E-tiket</th>}
                                        <th className="px-3 py-2.5">Izin</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {visible.map((o) => {
                                        const alarm = alarmLabel(o.alarm_outcome);
                                        return (
                                            <tr key={o.id} onClick={() => setSelectedId(o.id)} className="cursor-pointer hover:bg-slate-50">
                                                <td className="px-4 py-2.5 font-semibold text-slate-900">
                                                    {o.buyer_name || 'Peserta'}
                                                    {alarm && <span className="ml-2 text-[12px] font-medium text-amber-700">⚠ {alarm}</span>}
                                                </td>
                                                <td className="max-w-[16rem] truncate px-3 py-2.5 text-slate-700">{o.buyer_email}</td>
                                                <td className="px-3 py-2.5 text-slate-700">{o.buyer_university || '–'}</td>
                                                <td className="px-3 py-2.5 tabular-nums text-slate-700">{group === 'paid' ? o.ticket_code : rowNote(o, now)}</td>
                                                {group === 'paid' && <td className="px-3 py-2.5"><EmailBadge order={o} now={now} /></td>}
                                                <td className="px-3 py-2.5 text-slate-700">{o.marketing_consent ? '✓' : '–'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* HP: ekspor menempel di bawah */}
            <div className="sticky bottom-0 border-t border-slate-200 bg-white/90 p-3 backdrop-blur-md sm:hidden">
                <Button variant="outline" onClick={exportCsv} disabled={visible.length === 0} className="h-11 w-full gap-1.5 text-sm font-semibold">
                    <Download className="h-4 w-4" /> Ekspor CSV ({visible.length})
                </Button>
            </div>

            <WebinarParticipantSheet
                order={selected}
                broadcasts={broadcasts}
                deliveries={deliveries}
                onClose={() => setSelectedId(null)}
                onResend={setResendFor}
                onRefund={setRefundFor}
                onChanged={() => { void load(); }}
            />
            <WebinarResendDialog order={resendFor} onClose={() => setResendFor(null)} onSubmit={submitResend} />
            <WebinarRefundDialog order={refundFor} onClose={() => setRefundFor(null)} onSubmit={submitRefund} />
        </div>
    );
}
