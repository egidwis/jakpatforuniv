import { AlertTriangle, ImageIcon, MoreHorizontal, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { adminDateLabel, seatsSummary, soldLabel, zoomWarning, type AdminWebinarEvent } from '@/utils/webinarAdmin';

const TONE_CLASS: Record<string, string> = {
    on_sale: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    soon: 'bg-amber-50 text-amber-700 ring-amber-200',
    held: 'bg-orange-50 text-orange-700 ring-orange-200',
    ended: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export interface WebinarListActions {
    onEdit: (event: AdminWebinarEvent) => void;
    onParticipants: (event: AdminWebinarEvent) => void;
    onPreview: (event: AdminWebinarEvent) => void;
    onCopyLink: (event: AdminWebinarEvent) => void;
    onCloseSales: (event: AdminWebinarEvent) => void;
    onCancel: (event: AdminWebinarEvent) => void;
    onDelete: (event: AdminWebinarEvent) => void;
}

function EventCard({ event, actions, now }: { event: AdminWebinarEvent; actions: WebinarListActions; now: number }) {
    const seats = seatsSummary(event.webinar_offer_state);
    const isDraft = event.status === 'draft';
    const isPublished = event.status === 'published';
    const badge = isDraft ? 'Draft' : event.view.badge;
    const tone = isDraft ? 'ended' : event.view.tone;
    const note = event.view.state === 'coming_soon' ? event.view.note : null;
    // C18 (Fase 5B): Video kelas tanpa jadwal live; jumlah peserta = tiket live + pembeli video.
    const replay = event.offer_kind === 'replay';
    const participants = (event.sold_live ?? seats.sold) + (event.sold_replay ?? 0);
    const dateLine = replay ? event.view.recorded_label : event.starts_at ? adminDateLabel(event.starts_at) : null;

    return (
        <article className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <button
                type="button"
                onClick={() => actions.onEdit(event)}
                className="hidden aspect-video w-40 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:block"
                aria-label={`Edit ${event.title}`}
            >
                {event.poster_url
                    ? <img src={event.poster_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    : <span className="flex h-full items-center justify-center text-slate-300"><ImageIcon className="h-6 w-6" /></span>}
            </button>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-start gap-2">
                    <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-slate-900">{event.title}</h3>
                    {replay && <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">Video kelas</span>}
                    {event.is_test && <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">UJI</span>}
                </div>
                {dateLine && <p className="text-[13px] text-slate-600">{dateLine}</p>}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', TONE_CLASS[tone] ?? TONE_CLASS.ended)}>
                        {badge}
                    </span>
                    {note && <span className="text-slate-500">{note}</span>}
                    {!isDraft && (replay || event.quota != null) && (
                        <span className="tabular-nums text-slate-600">{soldLabel(event)}</span>
                    )}
                </div>
                {zoomWarning(event, now) && (
                    <p className="flex items-center gap-1 text-[13px] font-medium text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> Link Zoom belum diisi
                    </p>
                )}

                <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-2">
                    {!isDraft && (
                        <Button variant="outline" size="sm" className="h-8 text-xs font-semibold" onClick={() => actions.onParticipants(event)}>
                            Peserta ({participants})
                        </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-8 text-xs font-semibold" onClick={() => actions.onEdit(event)}>
                        {event.status === 'cancelled' ? 'Lihat' : 'Edit'}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs font-semibold" onClick={() => actions.onPreview(event)}>
                        Pratinjau
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Aksi lain">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onSelect={() => actions.onCopyLink(event)}>
                                {isDraft ? 'Salin link pratinjau' : 'Salin link'}
                            </DropdownMenuItem>
                            {isPublished && event.sales_mode !== 'closed' && (
                                <DropdownMenuItem onSelect={() => actions.onCloseSales(event)}>Tutup penjualan</DropdownMenuItem>
                            )}
                            {/* Video kelas tidak dibatalkan (pemegang tiket akan kehilangan rekaman); pakai Tutup penjualan. */}
                            {isPublished && !replay && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={() => actions.onCancel(event)}>
                                        Batalkan acara
                                    </DropdownMenuItem>
                                </>
                            )}
                            {isDraft && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={() => actions.onDelete(event)}>
                                        Hapus draft
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </article>
    );
}

export function WebinarEventList({
    events,
    loading,
    error,
    onCreate,
    onRetry,
    actions,
}: {
    events: AdminWebinarEvent[];
    loading: boolean;
    error: string | null;
    onCreate: () => void;
    onRetry: () => void;
    actions: WebinarListActions;
}) {
    const now = Date.now();
    return (
        <div className="flex min-h-full flex-col">
            <div className="mx-auto w-full max-w-4xl flex-1 px-5 pb-24 pt-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Webinar</h1>
                        <p className="text-[13px] text-slate-500">Acara, tiket, dan halaman pembelian.</p>
                    </div>
                    <Button onClick={onCreate} className="hidden h-9 gap-1.5 bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 sm:inline-flex">
                        <Plus className="h-4 w-4" /> Buat Acara
                    </Button>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        {[0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-white/70" />)}
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
                        {error}
                        <div className="mt-3"><Button variant="outline" size="sm" onClick={onRetry}>Coba lagi</Button></div>
                    </div>
                ) : events.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
                        <p className="text-sm font-semibold text-slate-800">Belum ada acara</p>
                        <p className="mt-1 text-[13px] text-slate-500">Buat acara pertama. Draft tersimpan otomatis dan tidak tampil sebelum diterbitkan.</p>
                        <Button onClick={onCreate} className="mt-4 h-9 gap-1.5 bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700">
                            <Plus className="h-4 w-4" /> Buat Acara
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {events.map((event) => <EventCard key={event.id} event={event} actions={actions} now={now} />)}
                    </div>
                )}
            </div>

            {/* HP: tombol buat menempel di bawah */}
            <div className="sticky bottom-0 border-t border-slate-200 bg-white/90 p-3 backdrop-blur-md sm:hidden">
                <Button onClick={onCreate} className="h-11 w-full gap-1.5 bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700">
                    <Plus className="h-4 w-4" /> Buat Acara
                </Button>
            </div>
        </div>
    );
}
