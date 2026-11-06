import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminWebinarEvent } from '@/utils/webinarAdmin';
import {
    failedEmails, noticeStatus, purchaseEmailSummary, reminderStatus,
    type AdminWebinarOrder, type EmailLine, type Tone,
} from '@/utils/webinarParticipants';

const TONE: Record<Tone, string> = { ok: 'text-emerald-700', warn: 'text-amber-700', muted: 'text-slate-500' };

function Row({ label, line }: { label: string; line: EmailLine }) {
    return (
        <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-start sm:gap-3">
            <span className="shrink-0 text-[13px] font-medium text-slate-700 sm:w-36">{label}</span>
            <span className={cn('min-w-0 flex-1 text-[13px] tabular-nums', TONE[line.tone])}>{line.text}</span>
        </div>
    );
}

/**
 * C4' bagian "Email otomatis" di halaman Peserta (Iterasi 4). Admin tidak mengirim
 * email dari sini: cron memanggil pengirim per peserta tiap menit (sql/136b), dan
 * statusnya dibaca dari kolom penanda di setiap order. Email yang gagal tidak diulang.
 */
export function WebinarEmailStatus({
    event, orders, onOpen,
}: {
    event: AdminWebinarEvent;
    orders: AdminWebinarOrder[];
    /** Buka detail peserta (untuk daftar email gagal). */
    onOpen: (orderId: string) => void;
}) {
    const now = Date.now();
    // Email pembelian per jenis: e-tiket (tiket live) dan bukti beli Video kelas (Fase 5B).
    const tickets = purchaseEmailSummary(orders, 'live', now);
    const videos = purchaseEmailSummary(orders, 'replay', now);
    const schedule = noticeStatus('schedule_change', event, orders, now);
    const cancellation = noticeStatus('cancellation', event, orders, now);
    const recording = noticeStatus('recording_ready', event, orders, now);
    const failed = failedEmails(orders);

    return (
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="mb-1 flex items-baseline justify-between gap-3">
                <h2 className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Email otomatis</h2>
                <span className="text-[12px] text-slate-500">dikirim otomatis tiap menit</span>
            </div>
            <Row label="E-tiket" line={tickets ?? { text: '—', tone: 'muted' }} />
            {videos && <Row label="Bukti beli video" line={videos} />}
            <Row label="Pengingat H-1" line={reminderStatus(event, orders, now)} />
            {schedule && <Row label="Jadwal berubah" line={schedule} />}
            {cancellation && <Row label="Pembatalan" line={cancellation} />}
            {recording && <Row label="Rekaman tersedia" line={recording} />}

            {failed.length > 0 && (
                <div className="mt-2 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        <strong>{failed.length} email gagal</strong> · lihat peserta:{' '}
                        {failed.map((o, i) => (
                            <span key={o.id}>
                                {i > 0 && ', '}
                                <button type="button" onClick={() => onOpen(o.id)} className="font-semibold underline-offset-2 hover:underline">
                                    {o.buyer_name || o.buyer_email}
                                </button>
                            </span>
                        ))}
                    </span>
                </div>
            )}
            <p className="mt-2 text-[12px] text-slate-500">Email yang gagal tidak diulang otomatis; kabari pesertanya lewat WA.</p>
        </section>
    );
}
