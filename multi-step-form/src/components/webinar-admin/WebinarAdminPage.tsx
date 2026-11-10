import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/confirm-dialog';
import {
    previewEventUrl, publicEventUrl, seatsSummary, sortAdminEvents, videoDraftFromWebinar,
    type AdminWebinarEvent, type OfferKind,
} from '@/utils/webinarAdmin';
import {
    cancelWebinarEvent, closeWebinarSales, createWebinarEvent, deleteWebinarEvent, getWebinarEvent, listWebinarEvents,
} from '@/utils/webinarAdminApi';
import { WebinarEventForm } from './WebinarEventForm';
import { WebinarEventList, type WebinarListActions } from './WebinarEventList';
import { WebinarParticipantsPage } from './WebinarParticipantsPage';

type View =
    | { kind: 'list' }
    | { kind: 'edit'; id: string | null; offer?: OfferKind }
    | { kind: 'participants'; id: string };

/**
 * Menu Webinar di /internal-dash: daftar acara (C1), form acara (C2), dan peserta (C4, Fase 3).
 * Semua baca-tulis lewat /api/admin/webinar (service_role), tidak lewat supabase-js.
 */
export function WebinarAdminPage({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
    const [view, setView] = useState<View>({ kind: 'list' });
    const [events, setEvents] = useState<AdminWebinarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setEvents(sortAdminEvents(await listWebinarEvents()));
            setError(null);
        } catch (err: any) {
            setError(err?.message || 'Daftar acara belum bisa dimuat');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (view.kind === 'list') void load(); }, [view, load]);

    const replace = (event: AdminWebinarEvent) =>
        setEvents((prev) => sortAdminEvents(prev.map((e) => (e.id === event.id ? { ...e, ...event } : e))));

    const run = async (task: () => Promise<void>) => {
        try { await task(); } catch (err: any) { toast.error(err?.message || 'Terjadi kendala. Coba lagi beberapa saat.'); }
    };

    /**
     * "Buat Video kelas dari webinar ini" (Iterasi 7): draft Video kelas terisi dari baris
     * lengkap webinar (daftar tidak memuat deskripsi), lalu form-nya dibuka.
     */
    const createVideoFrom = (event: AdminWebinarEvent) => run(async () => {
        const full = await getWebinarEvent(event.id);
        const video = await createWebinarEvent(videoDraftFromWebinar(full));
        setEvents((prev) => sortAdminEvents([video, ...prev]));
        toast.success(`Draft Video kelas dibuat dari "${event.title}". Unggah poster, rekaman, dan materinya di sini.`);
        setView({ kind: 'edit', id: video.id });
    });

    const actions: WebinarListActions = {
        onEdit: (event) => setView({ kind: 'edit', id: event.id }),
        onCreateVideoFrom: (event) => { void createVideoFrom(event); },
        onParticipants: (event) => setView({ kind: 'participants', id: event.id }),
        onPreview: (event) => window.open(previewEventUrl(event.slug, event.preview_token), '_blank'),
        onCopyLink: (event) => {
            const url = event.status === 'draft' ? previewEventUrl(event.slug, event.preview_token) : publicEventUrl(event.slug);
            navigator.clipboard.writeText(url).then(
                () => toast.success(event.status === 'draft' ? 'Link pratinjau disalin' : 'Link acara disalin'),
                () => toast.error('Link gagal disalin'),
            );
        },
        onCloseSales: (event) => setConfirm({
            title: 'Tutup penjualan?',
            lines: [
                `Tombol beli hilang dari halaman "${event.title}". Tiket yang sudah terjual tetap berlaku.`,
                'Buka lagi lewat Edit: pilih Sekarang atau Pada tanggal, lalu Simpan perubahan.',
            ],
            confirmLabel: 'Tutup penjualan',
            cancelLabel: 'Kembali',
            tone: 'neutral',
            onConfirm: () => run(async () => {
                replace(await closeWebinarSales(event.id));
                toast.success('Penjualan ditutup');
            }),
        }),
        onCancel: (event) => {
            const { sold } = seatsSummary(event.webinar_offer_state);
            setConfirm({
                title: 'Batalkan acara ini?',
                highlight: event.title,
                lines: [
                    sold > 0 && `${sold} peserta otomatis menerima email pembatalan.`,
                    'Link bayar yang masih aktif dimatikan.',
                    'Tindakan ini tidak bisa dibatalkan.',
                ],
                confirmLabel: 'Batalkan acara',
                cancelLabel: 'Kembali',
                tone: 'danger',
                onConfirm: () => run(async () => {
                    const result = await cancelWebinarEvent(event.id);
                    replace(result.event);
                    if (result.doku_failed.length) {
                        toast.warning(`Acara dibatalkan, tetapi ${result.doku_failed.length} link bayar gagal dimatikan di DOKU. Pilih "Batalkan acara" lagi untuk mencoba ulang.`, { duration: 10000 });
                    } else {
                        toast.success(result.notify_scheduled
                            ? `Acara dibatalkan. Email pembatalan ke ${result.notify_scheduled} peserta berangkat dalam ±1 menit.`
                            : 'Acara dibatalkan');
                    }
                }),
            });
        },
        onDelete: (event) => setConfirm({
            title: 'Hapus draft ini?',
            highlight: event.title,
            lines: ['Draft, video rekaman, dan materinya terhapus permanen. Poster dan gambar yang sudah diunggah tetap tersimpan.'],
            confirmLabel: 'Hapus draft',
            cancelLabel: 'Kembali',
            tone: 'danger',
            onConfirm: () => run(async () => {
                const result = await deleteWebinarEvent(event.id);
                setEvents((prev) => prev.filter((e) => e.id !== event.id));
                if (result.files_removed === false) toast.warning('Draft dihapus, tetapi sebagian berkasnya gagal dibersihkan.');
                else toast.success('Draft dihapus');
            }),
        }),
    };

    if (view.kind === 'participants') {
        return <WebinarParticipantsPage key={view.id} eventId={view.id} onBack={() => setView({ kind: 'list' })} />;
    }

    if (view.kind === 'edit') {
        return (
            <WebinarEventForm
                key={view.id ?? `baru-${view.offer ?? 'live'}`}
                eventId={view.id}
                kind={view.offer ?? 'live'}
                events={events}
                onBack={() => setView({ kind: 'list' })}
                onDirtyChange={onDirtyChange}
                onCreateVideoFrom={(event) => { void createVideoFrom(event); }}
                onOpenEvent={(event) => setView({ kind: 'edit', id: event.id })}
            />
        );
    }

    return (
        <>
            <WebinarEventList
                events={events}
                loading={loading}
                error={error}
                onCreate={(offer) => setView({ kind: 'edit', id: null, offer })}
                onRetry={() => { void load(); }}
                actions={actions}
            />
            <ConfirmDialog request={confirm} onDismiss={() => setConfirm(null)} />
        </>
    );
}
