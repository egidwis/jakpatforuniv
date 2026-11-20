import { forwardRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Download, Loader2, Play, Ticket } from 'lucide-react';
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
 * Tiket di menu Webinar. Satu kartu memuat semua keadaannya (bayar, tunggu acara, gabung, rekaman),
 * dengan layout horizontal kompak pada desktop agar padat, scannable, dan tidak menyisakan ruang kosong.
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

    let hint: { text: string; pillClass: string; endLabel?: string } | null = null;
    if (order.event_cancelled) {
        hint = { text: 'Acara dibatalkan. Tim JFU akan menghubungimu.', pillClass: 'bg-slate-100 text-slate-600 border-slate-200', endLabel: 'Dibatalkan' };
    } else if (order.status === 'refunded') {
        hint = {
            text: order.kind === 'replay' ? 'Akses tidak aktif. Hubungi admin bila ada pertanyaan.' : 'Tiket tidak aktif. Hubungi admin bila ada pertanyaan.',
            pillClass: 'bg-slate-100 text-slate-600 border-slate-200',
            endLabel: 'Tidak aktif',
        };
    } else if (order.status === 'expired' || (isPending && payLeft <= 0)) {
        hint = { text: 'Waktu bayar habis', pillClass: 'bg-slate-100 text-slate-600 border-slate-200' };
    } else if (order.status === 'paid' && isPast && !order.recording?.available) {
        hint = { text: 'Rekaman segera tersedia', pillClass: 'bg-amber-50 text-amber-800 border-amber-200/80', endLabel: 'Selesai' };
    }

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

    const ringClass = highlighted ? 'ring-2 ring-jfu-primary/60 ring-offset-2 border-jfu-primary/40' : '';
    // C21 (Fase 5B): Video kelas tanpa jadwal live.
    const subline = event.schedule_label ?? (order.kind === 'replay' ? event.kind_label : null) ?? null;
    const KindIcon = order.kind === 'replay' ? Play : Ticket;

    let statusPill: { label: string; className: string; dot?: boolean } | null = null;
    if (hint) {
        statusPill = { label: hint.text, className: hint.pillClass };
    } else if (isPending) {
        statusPill = { label: 'Belum dibayar', className: 'bg-amber-50 text-amber-800 border-amber-200/90' };
    } else if (recording) {
        statusPill = { label: 'Siap ditonton', className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80', dot: true };
    } else if (join && phase === 'open') {
        statusPill = { label: 'Sedang berlangsung', className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80', dot: true };
    } else if (join && phase === 'before') {
        statusPill = { label: 'Terjadwal', className: 'bg-blue-50 text-blue-700 border-blue-200/80' };
    }

    const thumbTone = isPending || hint?.endLabel === 'Selesai'
        ? 'bg-amber-50/90 text-amber-800 border-amber-200/70'
        : 'bg-blue-50/90 text-jfu-primary border-blue-100';

    return (
        <div ref={ref} className={`${CARD_CLASS} ${ringClass} overflow-hidden scroll-mt-24 transition-shadow`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 sm:gap-4 p-4 sm:px-5 sm:py-4">
                <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                    {event.poster_url ? (
                        <img
                            src={event.poster_url}
                            alt={event.title}
                            loading="lazy"
                            className="w-24 sm:w-28 aspect-video rounded-xl object-cover bg-blue-50 border border-slate-200/70 shrink-0"
                        />
                    ) : (
                        <div className={`w-24 sm:w-28 aspect-video rounded-xl border shrink-0 flex flex-col items-center justify-center gap-1 px-2 text-center ${thumbTone}`}>
                            <KindIcon className="w-4 h-4 shrink-0" />
                            <span className="text-[11px] font-bold leading-tight truncate max-w-full">
                                {order.kind === 'replay'
                                    ? (event.recording_minutes ? `${event.recording_minutes} menit` : 'Video kelas')
                                    : (event.short_date || 'Tiket live')}
                            </span>
                        </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {statusPill && (
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusPill.className}`}>
                                    {statusPill.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />}
                                    {statusPill.label}
                                </span>
                            )}
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                                {order.kind === 'replay' ? 'Video kelas' : 'Tiket live'}
                            </span>
                        </div>

                        <p className="font-bold text-slate-900 text-sm sm:text-[15px] leading-snug">{event.title}</p>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                            {subline && <span>{subline}</span>}
                            {recording?.has_materials && (
                                <span>{subline ? '· ' : ''}Materi Slide/PPT tersedia</span>
                            )}
                            {order.status === 'paid' && order.ticket_code && !hint && !recording && (
                                <span>
                                    {subline ? '· ' : ''}Kode <strong className="font-mono tracking-wide text-slate-700">{order.ticket_code}</strong>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Aksi sejajar di kanan pada desktop; baris rapi di bawah pada mobile */}
                {!hint && recording && (
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:shrink-0 max-sm:pt-2.5 max-sm:border-t max-sm:border-slate-100">
                        {recording.has_materials && (
                            <button
                                type="button"
                                onClick={() => { void getMaterial(); }}
                                disabled={materialBusy}
                                className="max-sm:flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 transition-colors disabled:opacity-60 cursor-pointer"
                            >
                                {materialBusy ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : <Download className="w-3.5 h-3.5 shrink-0" />}
                                <span>Materi</span>
                            </button>
                        )}
                        <Link
                            to={order.watch_path as string}
                            className="max-sm:flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-br from-jfu-primary to-jfu-dark hover:brightness-105 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(25,118,210,0.5)] transition-all"
                        >
                            <Play className="w-3.5 h-3.5 shrink-0 fill-current" />
                            <span>Tonton rekaman</span>
                        </Link>
                    </div>
                )}

                {hint?.text === 'Waktu bayar habis' && (
                    <div className="sm:shrink-0 max-sm:pt-2.5 max-sm:border-t max-sm:border-slate-100">
                        <Link
                            to={`/dashboard/webinar/beli/${event.slug}`}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-blue-200 bg-blue-50/70 hover:bg-blue-50 px-4 py-2 text-xs sm:text-sm font-semibold text-jfu-primary transition-colors"
                        >
                            Pesan lagi →
                        </Link>
                    </div>
                )}

                {hint?.endLabel && (
                    <span className="hidden sm:inline-flex shrink-0 items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                        {hint.endLabel}
                    </span>
                )}
            </div>

            {!hint && isPending && (
                <div className="border-t border-amber-100/90 bg-amber-50/40 px-4 sm:px-5 py-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1">
                            <p className="text-xs font-medium text-amber-900/80">Selesaikan pembayaran dalam</p>
                            <p className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-jfu-primary">{formatPayCountdown(payLeft)}</p>
                        </div>
                        <div className="sm:w-56">
                            {order.payment_url ? (
                                <a
                                    href={order.payment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full rounded-full bg-gradient-to-br from-jfu-primary to-jfu-dark hover:brightness-105 px-5 py-2.5 text-center text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgba(25,118,210,0.5)] transition-all"
                                >
                                    Lanjutkan bayar
                                </a>
                            ) : (
                                <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="w-4 h-4 animate-spin" /> Link bayar sedang disiapkan…</p>
                            )}
                        </div>
                    </div>
                    {checking && (
                        <p className="flex items-center gap-2 text-xs sm:text-sm text-slate-600"><Loader2 className="w-4 h-4 animate-spin" /> Memeriksa pembayaran…</p>
                    )}
                    <p className="rounded-xl border border-amber-200/70 bg-white/80 px-3 py-2 text-xs sm:text-sm text-slate-600">
                        <span className="font-semibold text-slate-700">Bayar di HP ini?</span> Screenshot kode QR → buka e-wallet atau m-banking → scan dari galeri.
                    </p>
                    <p className="text-xs text-slate-600">
                        {order.amount_label} · {order.kind === 'replay'
                            ? 'Setelah bayar, rekaman langsung bisa ditonton di menu Webinar.'
                            : 'Setelah bayar, tiket otomatis masuk email.'} Kamu boleh menutup halaman ini.
                    </p>
                </div>
            )}

            {!hint && join && phase && phase !== 'after' && (
                <div className="border-t border-blue-100/80 bg-blue-50/30 px-4 sm:px-5 py-4 space-y-3">
                    {phase === 'before' && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1">
                                <p className="text-xs font-medium text-slate-600">Ruang dibuka dalam</p>
                                <p className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-jfu-primary">{formatJoinCountdown(join.opens_at_ms - now)}</p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
                                {calendarUrl(order) && (
                                    <a
                                        href={calendarUrl(order) as string}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 transition-colors"
                                    >
                                        <CalendarPlus className="w-3.5 h-3.5 text-slate-500" />
                                        <span>Tambah ke kalender</span>
                                    </a>
                                )}
                                <button
                                    type="button"
                                    disabled
                                    className="cursor-not-allowed rounded-full bg-slate-200/90 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-500"
                                >
                                    Gabung · dibuka {join.opens_label}
                                </button>
                            </div>
                        </div>
                    )}
                    {phase === 'open' && (join.meeting_ready && order.join_url ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <p className="flex-1 text-sm font-semibold text-emerald-700">Ruang Zoom sudah dibuka — silakan bergabung.</p>
                            <div className="sm:shrink-0">
                                <a
                                    href={order.join_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full sm:w-auto rounded-full bg-gradient-to-br from-jfu-primary to-jfu-dark hover:brightness-105 px-6 py-2.5 text-center text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgba(25,118,210,0.5)] transition-all"
                                >
                                    Gabung ke webinar
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <p className="flex-1 text-sm text-amber-800">Link sedang disiapkan. Muat ulang sebentar lagi.</p>
                            {onReload && (
                                <div className="sm:shrink-0">
                                    <button
                                        type="button"
                                        onClick={onReload}
                                        className="w-full sm:w-auto rounded-full border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2 text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
                                    >
                                        Muat ulang
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                    <p className="text-xs text-slate-500">
                        E-tiket dikirim ke <strong className="font-semibold text-slate-700">{order.buyer_email}</strong>. Tidak bisa hadir? Sudah termasuk rekaman dan PPT.
                    </p>
                </div>
            )}
        </div>
    );
});
