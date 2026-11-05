import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/confirm-dialog';
import {
    previewEventUrl, publicEventUrl, seatsSummary, sortAdminEvents, type AdminWebinarEvent,
} from '@/utils/webinarAdmin';
import {
    cancelWebinarEvent, closeWebinarSales, deleteWebinarEvent, listWebinarEvents,
} from '@/utils/webinarAdminApi';
import { WebinarEventForm } from './WebinarEventForm';
import { WebinarEventList, type WebinarListActions } from './WebinarEventList';

type View = { kind: 'list' } | { kind: 'edit'; id: string | null };

/**
 * Menu Webinar di /internal-dash: daftar acara (C1) dan form acara (C2).
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

    const actions: WebinarListActions = {
        onEdit: (event) => setView({ kind: 'edit', id: event.id }),
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
                    sold > 0
                        ? `${sold} pembeli akan melihat pemberitahuan acara batal. Link bayar yang masih aktif dimatikan.`
                        : 'Halaman acara menampilkan pemberitahuan batal. Link bayar yang masih aktif dimatikan.',
                    'Sistem belum mengirim email otomatis; kabari pembeli sendiri.',
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
                        toast.success('Acara dibatalkan');
                    }
                }),
            });
        },
        onDelete: (event) => setConfirm({
            title: 'Hapus draft ini?',
            highlight: event.title,
            lines: ['Draft dan isinya terhapus permanen. Gambar yang sudah diunggah tetap tersimpan.'],
            confirmLabel: 'Hapus draft',
            cancelLabel: 'Kembali',
            tone: 'danger',
            onConfirm: () => run(async () => {
                await deleteWebinarEvent(event.id);
                setEvents((prev) => prev.filter((e) => e.id !== event.id));
                toast.success('Draft dihapus');
            }),
        }),
    };

    if (view.kind === 'edit') {
        return (
            <WebinarEventForm
                key={view.id ?? 'baru'}
                eventId={view.id}
                onBack={() => setView({ kind: 'list' })}
                onDirtyChange={onDirtyChange}
            />
        );
    }

    return (
        <>
            <WebinarEventList
                events={events}
                loading={loading}
                error={error}
                onCreate={() => setView({ kind: 'edit', id: null })}
                onRetry={() => { void load(); }}
                actions={actions}
            />
            <ConfirmDialog request={confirm} onDismiss={() => setConfirm(null)} />
        </>
    );
}
