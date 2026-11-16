import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatRupiah } from '@/utils/webinarAdmin';
import type { AdminWebinarOrder } from '@/utils/webinarParticipants';

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** C6. Kirim ulang e-tiket, sekaligus tempat mengoreksi alamat tujuannya. */
export function WebinarResendDialog({
    order, onClose, onSubmit,
}: {
    order: AdminWebinarOrder | null;
    onClose: () => void;
    onSubmit: (order: AdminWebinarOrder, email: string) => Promise<void>;
}) {
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { setEmail(order?.buyer_email ?? ''); setBusy(false); }, [order]);
    const valid = EMAIL_RE.test(email.trim());
    const replay = order?.kind === 'replay';

    return (
        <Dialog open={Boolean(order)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{replay ? 'Kirim ulang bukti pembelian?' : 'Kirim ulang e-tiket?'}</DialogTitle>
                    <DialogDescription>{replay ? 'Email "Rekamanmu siap"' : 'E-tiket'} + kwitansi PDF dikirim ke:</DialogDescription>
                </DialogHeader>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    aria-label={replay ? 'Email tujuan bukti pembelian' : 'Email tujuan e-tiket'}
                />
                <p className="text-[13px] text-slate-500">Alamat baru juga dipakai email otomatis berikutnya untuk peserta ini.</p>
                <DialogFooter className="gap-2">
                    <Button variant="outline" disabled={busy} onClick={onClose}>Kembali</Button>
                    <Button
                        disabled={!valid || busy}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                        onClick={async () => {
                            if (!order) return;
                            setBusy(true);
                            try { await onSubmit(order, email.trim()); } finally { setBusy(false); }
                        }}
                    >
                        {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Kirim
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** C7. Tandai refund: final, catatan wajib (hanya admin), pembeli tidak menerima email. */
export function WebinarRefundDialog({
    order, onClose, onSubmit,
}: {
    order: AdminWebinarOrder | null;
    onClose: () => void;
    onSubmit: (order: AdminWebinarOrder, note: string) => Promise<void>;
}) {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { setNote(''); setBusy(false); }, [order]);
    const valid = note.trim().length >= 3 && note.trim().length <= 500;

    return (
        <Dialog open={Boolean(order)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Tandai refund?</DialogTitle>
                    {order && (
                        <DialogDescription className="font-semibold text-slate-800">
                            {order.buyer_name || 'Peserta'} · {order.ticket_code} · {formatRupiah(order.amount)}
                        </DialogDescription>
                    )}
                </DialogHeader>
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-700">
                    {order?.kind === 'replay' ? (
                        <li>Akses rekaman langsung berhenti.</li>
                    ) : (
                        <>
                            <li>Tiket langsung tidak aktif; link gabung berhenti meneruskan ke Zoom.</li>
                            <li>Kursi kembali bisa dibeli.</li>
                        </>
                    )}
                    <li>Uang dikembalikan manual di luar sistem.</li>
                    <li>Pembeli tidak menerima email; kabari sendiri.</li>
                    <li>Tidak bisa dibatalkan dari layar ini.</li>
                </ul>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-700">
                    Catatan (hanya admin)*
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={500}
                        rows={2}
                        placeholder="Mis. bentrok jadwal kuliah"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                </label>
                <DialogFooter className="gap-2">
                    <Button variant="outline" disabled={busy} onClick={onClose}>Kembali</Button>
                    <Button
                        disabled={!valid || busy}
                        className="bg-red-600 text-white hover:bg-red-700"
                        onClick={async () => {
                            if (!order) return;
                            setBusy(true);
                            try { await onSubmit(order, note.trim()); } finally { setBusy(false); }
                        }}
                    >
                        {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Tandai refund
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
