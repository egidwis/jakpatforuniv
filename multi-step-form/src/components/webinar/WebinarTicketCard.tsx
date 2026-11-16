import { forwardRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Loader2, Play, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { downloadMaterial, formatJoinCountdown, joinPhaseAt, type WebinarOrderView } from '@/utils/webinarApi';
import { CARD_CLASS, useNow } from './WebinarParts';

const formatPayCountdown = (ms: number) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const calendarUrl = (order: WebinarOrderView) => {
    const { starts_at: start, duration_minutes: minutes, title } = order.event;
    if (!start || !order.join_url) return null;
    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const from = new Date(start);
    const to = new Date(from.getTime() + (minutes || 60) * 60_000);
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: `${stamp(from)}/${stamp(to)}`,
        details: `Link gabung pribadimu: ${order.join_url}`,
        location: order.join_url,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

type Props = {
    order: WebinarOrderView;
    /** Sudah lebih dari 60 detik menunggu: halaman sedang bertanya ke DOKU. */
    checking?: boolean;
    highlighted?: boolean;
    onReload?: () => void;
};

/**
 * Tiket di menu Webinar. Satu kartu memuat semua keadaannya (bayar, tunggu acara, gabung),
 * jadi tidak ada halaman tiket terpisah dan tidak ada tombol yang hanya menunjuk ke tombol lain.
 */
export const WebinarTicketCard = forwardRef<HTMLDivElement, Props>(function WebinarTicketCard(
    { order, checking = false, highlighted = false, onReload },
    ref,
) {
    const { event } = order;
    const isPending = order.status === 'pending';
    const join = order.status === 'paid' && !order.event_cancelled ? order.join : null;
    // Detik berjalan hanya selama ada hitung mundur yang terlihat.
    const now = useNow(isPending || (!!join && joinPhaseAt(join, Date.now()) !== 'after'));

    const payLeft = isPending ? new Date(order.payment_expires_at as string).getTime() - now : 0;
    const phase = join ? joinPhaseAt(join, now) : null;
    const isPast = phase ? phase === 'after' : order.event_is_past;

    let hint: { text: string; tone: string } | null = null;
    if (order.event_cancelled) hint = { text: 'Acara dibatalkan. Tim JFU akan menghubungimu.', tone: 'text-slate-500' };
    else if (order.status === 'refunded') {
        hint = {
            text: order.kind === 'replay' ? 'Akses tidak aktif. Hubungi admin bila ada pertanyaan.' : 'Tiket tidak aktif. Hubungi admin bila ada pertanyaan.',
            tone: 'text-slate-500',
        };
    }
    else if (order.status === 'expired' || (isPending && payLeft <= 0)) hint = { text: 'Waktu bayar habis', tone: 'text-slate-500' };
    else if (order.status === 'paid' && isPast && !order.recording?.available) hint = { text: 'Rekaman segera tersedia', tone: 'text-slate-500' };
    const recording = order.status === 'paid' && !order.event_cancelled && order.recording?.available && order.watch_path
        ? order.recording
        : null;
    const [materialBusy, setMaterialBusy] = useState(false);
    const getMaterial = async () => {
        setMaterialBusy(true);
        try {
            await downloadMaterial(order.id);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Materi belum bisa diunduh.');
        } finally {
            setMaterialBusy(false);
        }
    };

    const ringClass = highlighted ? 'ring-2 ring-jfu-primary/60 ring-offset-2' : '';
    // C21 (Fase 5B): Video kelas tanpa jadwal live.
    const subline = event.schedule_label ?? (order.kind === 'replay' ? event.kind_label : null) ?? null;
    const KindIcon = order.kind === 'replay' ? Play : Ticket;

    return (
        <div ref={ref} className={`${CARD_CLASS} ${ringClass} scroll-mt-24 transition-shadow`}>
            <div className="flex items-start gap-3 px-4 py-3">
                <KindIcon className="w-4 h-4 mt-0.5 shrink-0 text-jfu-primary" />
                <div className="flex-1 min-w-0 text-sm">
                    <p className="font-semibold text-slate-900">{event.title}</p>
                    {subline && <p className="text-xs text-slate-500">{subline}</p>}
                    {hint && <p className={`text-xs ${hint.tone}`}>{hint.text}</p>}
                </div>
                {order.status === 'paid' && order.ticket_code && !hint && !recording && (
                    <span className="shrink-0 text-xs text-slate-500">Kode <strong className="tracking-wide text-slate-700">{order.ticket_code}</strong></span>
                )}
                {hint?.text === 'Waktu bayar habis' && (
                    <Link to={`/dashboard/webinar/beli/${event.slug}`} className="shrink-0 text-sm font-semibold text-jfu-primary">Pesan lagi →</Link>
                )}
            </div>

            {!hint && recording && (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
                    <Link
                        to={order.watch_path as string}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-jfu-primary px-4 py-2.5 text-sm font-semibold text-white"
                    >
                        <Play className="w-4 h-4" /> Tonton rekaman
                    </Link>
                    {recording.has_materials && (
                        <button
                            type="button"
                            onClick={() => { void getMaterial(); }}
                            disabled={materialBusy}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
                        >
                            {materialBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Materi
                        </button>
                    )}
                </div>
            )}

            {!hint && isPending && (
                <div className="border-t border-slate-100 px-4 py-4 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Belum dibayar</p>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1">
                            <p className="text-sm text-slate-600">Selesaikan pembayaran dalam</p>
                            <p className="text-3xl font-bold tabular-nums text-jfu-primary">{formatPayCountdown(payLeft)}</p>
                        </div>
                        <div className="sm:w-64">
                            {order.payment_url ? (
                                <a
                                    href={order.payment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full rounded-xl bg-jfu-primary px-5 py-3 text-center font-semibold text-white"
                                >
                                    Lanjutkan bayar
                                </a>
                            ) : (
                                <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="w-4 h-4 animate-spin" /> Link bayar sedang disiapkan…</p>
                            )}
                        </div>
                    </div>
                    {checking && (
                        <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="w-4 h-4 animate-spin" /> Memeriksa pembayaran…</p>
                    )}
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        <span className="font-semibold text-slate-700">Bayar di HP ini?</span> Screenshot kode QR → buka e-wallet atau m-banking → scan dari galeri.
                    </p>
                    <p className="text-sm text-slate-600">
                        {order.amount_label} · {order.kind === 'replay'
                            ? 'Setelah bayar, rekaman langsung bisa ditonton di menu Webinar.'
                            : 'Setelah bayar, tiket otomatis masuk email.'} Kamu boleh menutup halaman ini.
                    </p>
                </div>
            )}

            {!hint && join && phase && phase !== 'after' && (
                <div className="border-t border-slate-100 px-4 py-4 space-y-3">
                    {phase === 'before' && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1">
                                <p className="text-sm text-slate-600">Ruang dibuka dalam</p>
                                <p className="text-3xl font-bold tabular-nums text-jfu-primary">{formatJoinCountdown(join.opens_at_ms - now)}</p>
                            </div>
                            <div className="flex flex-col gap-2 sm:w-64">
                                <button type="button" disabled className="w-full cursor-not-allowed rounded-xl bg-slate-200 px-4 py-3 font-semibold text-slate-500">
                                    Gabung · dibuka {join.opens_label}
                                </button>
                                {calendarUrl(order) && (
                                    <a href={calendarUrl(order) as string} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700">
                                        + Tambah ke kalender
                                    </a>
                                )}
                            </div>
                        </div>
                    )}
                    {phase === 'open' && (join.meeting_ready && order.join_url ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <p className="flex-1 font-semibold text-emerald-700">Sedang berlangsung</p>
                            <div className="sm:w-64">
                                <a href={order.join_url} target="_blank" rel="noopener noreferrer" className="block w-full rounded-xl bg-jfu-primary px-5 py-3 text-center font-semibold text-white">
                                    Gabung ke webinar
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <p className="flex-1 text-sm text-amber-800">Link sedang disiapkan. Muat ulang sebentar lagi.</p>
                            {onReload && (
                                <div className="sm:w-64">
                                    <button type="button" onClick={onReload} className="w-full rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700">
                                        Muat ulang
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                    <p className="text-sm text-slate-600">
                        E-tiket dikirim ke {order.buyer_email}. Tidak bisa hadir? Sudah termasuk rekaman dan PPT.
                    </p>
                </div>
            )}
        </div>
    );
});
