import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/utils/webinarAdmin';
import { errorMessage } from '@/utils/webinarParticipants';
import { checkOrder, getParticipant, type CheckOrderResult } from '@/utils/webinarAdminApi';
import {
    alarmLabel, emailHistoryFor, participantGroup, shortStamp, unpaidLabel,
    type AdminWebinarOrder,
} from '@/utils/webinarParticipants';

const ALARM_HELP: Record<string, string> = {
    'Bayar dobel': 'Akun ini punya lebih dari satu tiket lunas. Hubungi pembeli, lalu tandai refund salah satunya.',
    'Lewat kuota': 'Tiket terbit melebihi kuota (bayar telat). Pastikan kapasitas Zoom cukup.',
    'Bayar sesudah batal': 'Pembeli membayar sesudah acara dibatalkan. Hubungi pembeli.',
};

const DELIVERY_TEXT: Record<string, string> = {
    sent: '✓', failed: 'gagal', skipped: 'dilewati', pending: 'belum',
};

function checkText(r: CheckOrderResult): string {
    const at = shortStamp(new Date().toISOString());
    if (r.reason === 'too_soon') return 'Order baru dibuat. Cek lagi sesudah 1 menit.';
    if (r.reason === 'recently_checked') return 'Baru saja dicek. Coba lagi sesudah 1 menit.';
    if (r.reason === 'doku_error') return 'DOKU tidak menjawab. Coba lagi sebentar.';
    if (r.status === 'paid') return 'Lunas — tiket terbit dan e-tiket dikirim.';
    return `Belum dibayar di DOKU (${at})${r.dokuStatus ? ` · ${r.dokuStatus}` : ''}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 py-1 text-[13px]">
            <span className="text-slate-500">{label}</span>
            <div className="min-w-0 break-words font-medium text-slate-800">{children}</div>
        </div>
    );
}

/** C5. Detail peserta: panel kanan di desktop, lembar bawah di HP. */
export function WebinarParticipantSheet({
    order, onClose, onResend, onRefund, onChanged,
}: {
    order: AdminWebinarOrder | null;
    onClose: () => void;
    onResend: (order: AdminWebinarOrder) => void;
    onRefund: (order: AdminWebinarOrder) => void;
    /** Dipanggil sesudah Cek ke DOKU menemukan pembayaran, supaya daftar dimuat ulang. */
    onChanged: () => void;
}) {
    const [accountEmail, setAccountEmail] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<string | null>(null);
    const desktop = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches;

    useEffect(() => {
        setAccountEmail(null);
        setCheckResult(null);
        if (!order) return;
        let alive = true;
        getParticipant(order.id).then((r) => { if (alive) setAccountEmail(r.account_email); }).catch(() => {});
        return () => { alive = false; };
    }, [order]);

    const group = order ? participantGroup(order) : null;
    const alarm = order ? alarmLabel(order.alarm_outcome) : null;
    const history = order ? emailHistoryFor(order) : [];

    const runCheck = async () => {
        if (!order) return;
        setChecking(true);
        try {
            const r = await checkOrder(order.id);
            setCheckResult(checkText(r));
            if (r.status === 'paid') onChanged();
        } catch (err) {
            toast.error(errorMessage(err, 'Status pembayaran belum bisa dicek'));
        } finally {
            setChecking(false);
        }
    };

    return (
        <Sheet open={Boolean(order)} onOpenChange={(open) => { if (!open) onClose(); }}>
            <SheetContent
                side={desktop ? 'right' : 'bottom'}
                className={cn('overflow-y-auto', desktop ? 'w-full sm:max-w-md' : 'max-h-[88vh] rounded-t-2xl')}
            >
                {order && (
                    <>
                        <SheetHeader className="text-left">
                            <SheetTitle className="flex items-center justify-between gap-3 pr-6">
                                <span className="min-w-0 truncate">{order.buyer_name || 'Peserta'}</span>
                                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                                    group === 'paid' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                        : group === 'refunded' ? 'bg-slate-100 text-slate-600 ring-slate-200'
                                            : 'bg-amber-50 text-amber-700 ring-amber-200')}
                                >
                                    {group === 'paid' ? 'Lunas' : group === 'refunded' ? 'Refund' : unpaidLabel(order)}
                                </span>
                            </SheetTitle>
                            <SheetDescription className="sr-only">Detail peserta webinar</SheetDescription>
                        </SheetHeader>

                        {alarm && (
                            <div className="mt-3 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span><strong>{alarm}.</strong> {ALARM_HELP[alarm] ?? ''}</span>
                            </div>
                        )}

                        <div className="mt-3">
                            <Field label="Email e-tiket">{order.buyer_email}</Field>
                            <Field label="Akun">{accountEmail ?? '…'}</Field>
                            {order.buyer_phone && <Field label="WhatsApp">{order.buyer_phone}</Field>}
                            <Field label="Kampus">{[order.buyer_university, order.buyer_major, order.buyer_status].filter(Boolean).join(' · ') || '–'}</Field>
                            {order.buyer_referral && <Field label="Referral">{order.buyer_referral}</Field>}
                            <Field label="Izin kontak">{order.marketing_consent ? `Ya${order.consent_at ? ` · ${shortStamp(order.consent_at)}` : ''}` : 'Tidak'}</Field>
                            {order.ticket_code && <Field label="Kode tiket">{order.ticket_code}</Field>}
                            <Field label="Invoice">{order.invoice_number}</Field>
                            {order.paid_at
                                ? <Field label="Dibayar">{formatRupiah(order.amount)}{order.payment_channel ? ` · ${order.payment_channel}` : ''}<br />{shortStamp(order.paid_at)} WIB</Field>
                                : <Field label="Tagihan">{formatRupiah(order.amount)} · dibuat {shortStamp(order.created_at)}</Field>}
                            <Field label="Voucher">{order.voucher_code ? `${order.voucher_code} (−${formatRupiah(order.discount_amount)})` : '–'}</Field>
                            {group === 'unpaid' && (
                                <Field label="Terakhir dicek">{order.last_status_check_at ? `${shortStamp(order.last_status_check_at)} WIB` : 'Belum pernah'}</Field>
                            )}
                            {history.length > 0 && (
                                <Field label="Email">
                                    <ul className="space-y-0.5">
                                        {history.map((h, i) => (
                                            <li key={i} className={cn(h.status === 'failed' && 'text-amber-700')}>
                                                {h.label} {DELIVERY_TEXT[h.status]}{h.at ? ` ${shortStamp(h.at)}` : ''}{h.note ? ` (${h.note})` : ''}
                                                {h.error && <span className="block text-[12px] font-normal text-slate-500">{h.error}</span>}
                                            </li>
                                        ))}
                                    </ul>
                                    {order.email_error && (
                                        <p className="mt-1 text-[12px] font-normal text-red-600">
                                            Email otomatis gagal: {order.email_error}. Tidak diulang otomatis; kabari peserta lewat WA.
                                        </p>
                                    )}
                                </Field>
                            )}
                            {group === 'refunded' && (
                                <Field label="Refund">
                                    {order.refunded_at ? `${shortStamp(order.refunded_at)} WIB` : ''}{order.refunded_by ? ` oleh ${order.refunded_by}` : ''}
                                    {order.refund_note && <span className="block font-normal text-slate-600">Catatan: “{order.refund_note}”</span>}
                                </Field>
                            )}
                        </div>

                        {group === 'paid' && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" className="h-9" onClick={() => onResend(order)}>Kirim ulang e-tiket</Button>
                                {order.join_url && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9"
                                        onClick={() => navigator.clipboard.writeText(order.join_url!).then(
                                            () => toast.success('Link gabung disalin'),
                                            () => toast.error('Link gagal disalin'),
                                        )}
                                    >
                                        Salin link gabung
                                    </Button>
                                )}
                            </div>
                        )}
                        {group === 'unpaid' && (
                            <div className="mt-4 space-y-2">
                                <Button variant="outline" size="sm" className="h-9" disabled={checking} onClick={runCheck}>
                                    {checking && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Cek ke DOKU
                                </Button>
                                {checkResult && <p className="text-[13px] text-slate-700">{checkResult}</p>}
                            </div>
                        )}
                        {group === 'paid' && (
                            <div className="mt-5 border-t border-slate-200 pt-3">
                                <button type="button" onClick={() => onRefund(order)} className="text-[13px] font-semibold text-red-600 hover:underline">
                                    Tandai refund…
                                </button>
                            </div>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
