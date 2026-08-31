import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase'; // Adjust path if needed, check structure
import { Loader2, Download, CheckCircle2, Clock, ExternalLink, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { terbilangCapitalized } from '../utils/terbilang';
import { formatPaymentChannel } from '../utils/paymentChannel';
import { calculatePpn } from '../utils/cost-calculator';
import jakpatLogo from '../assets/Jakpat Navbar Logo.webp';

interface InvoiceItem {
    name?: string; // Added optional name
    category: string;
    price: number;
    qty: number;
}

interface ScheduleInfo {
    startDate?: string | null;
    endDate?: string | null;
    duration?: number | null;
    distributionType?: string | null;
    kilatSlotHour?: number | null;
}

interface InvoiceData {
    id: string; // Transaction ID
    payment_id: string;
    form_submission_id?: string;
    entity_type?: 'submission' | 'extend';
    extend_id?: string | null;
    billed_start_date?: string | null;
    amount: number;              // grand total (termasuk PPN utk invoice baru)
    subtotal?: number | null;    // DPP sebelum PPN (null utk invoice lama pra-PPN)
    ppn_rate?: number | null;    // tarif PPN saat transaksi (mis. 0.11)
    ppn_amount?: number | null;  // nominal PPN (null utk invoice lama pra-PPN)
    status: string;
    payment_method?: string;
    payment_channel?: string;
    payment_url?: string;
    created_at: string;
    note: string | null;
    form_submissions: {
        id?: string;
        title?: string;
        full_name: string;
        email: string;
        phone_number: string;
        university: string;
        start_date?: string | null;
        end_date?: string | null;
        duration?: number | null;
        distribution_type?: string | null;
    } | null;
}

// Paid/due metadata sourced from the matching `invoices` row (paid_at is the
// only real payment timestamp; transactions has none).
interface InvoiceMeta {
    paid_at: string | null;
    expires_at: string | null;
}

// Stamp-duty (bea meterai) threshold under UU 10/2020. Below this, no materai
// is required on a receipt; above it we surface a note (handled manually).
const MATERAI_THRESHOLD = 5_000_000;

// Derive a clean, short, professional document code from a messy payment_id.
// Known payment_id formats:
//   JFU-INV-<6hex>-<13digit-timestamp>  (manual invoice)
//   JFU-<8hex>-<timestamp>              (self-service)
//   sim_doku_<timestamp> / sim_<...>    (simulation)
// We strip the known leading prefixes, take the first meaningful token, uppercase
// it and cap at ~8 chars. Result looks like "5C97C5" (so callers prefix INV-/RCP-).
function shortDocCode(paymentId?: string | null): string {
    const raw = (paymentId || '').trim();
    if (!raw) return 'XXXXXXXX';

    let rest = raw;
    for (const prefix of ['JFU-INV-', 'JFU-', 'sim_doku_', 'sim_']) {
        if (rest.toLowerCase().startsWith(prefix.toLowerCase())) {
            rest = rest.slice(prefix.length);
            break;
        }
    }

    // First meaningful token after the prefix.
    const token = rest.split(/[-_]/).find((t) => t.length > 0) || '';
    const cleaned = token.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cleaned) return cleaned.slice(0, 8);

    // Fallback: cleaned slice of the raw id.
    const fallback = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return (fallback || 'XXXXXXXX').slice(0, 8);
}

export function InvoicePage() {
    const { paymentId } = useParams();
    const [data, setData] = useState<InvoiceData | null>(null);
    const [meta, setMeta] = useState<InvoiceMeta>({ paid_at: null, expires_at: null });
    const [schedule, setSchedule] = useState<ScheduleInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchInvoice();
    }, [paymentId]);

    // Set a meaningful document title (used as the filename for "Save as PDF").
    // Kept at the top level so it isn't called conditionally after early returns.
    useEffect(() => {
        if (!data) return;
        const isPaidDoc = ['completed', 'paid'].includes((data.status || '').toLowerCase());
        const num = `${isPaidDoc ? 'RCP' : 'INV'}-${shortDocCode(data.payment_id)}`;
        const prev = document.title;
        document.title = num;
        return () => { document.title = prev; };
    }, [data]);

    const fetchInvoice = async () => {
        try {
            setLoading(true);
            const { data: transaction, error } = await supabase
                .from('transactions')
                .select(`
          *,
          form_submissions (
            id,
            title,
            full_name,
            email,
            phone_number,
            university,
            start_date,
            end_date,
            duration,
            distribution_type
          )
        `)
                .eq('payment_id', paymentId)
                .single();

            if (error) throw error;
            setData(transaction);

            // Derive schedule info
            const sourceId = (transaction.entity_type === 'extend' && transaction.extend_id)
                ? transaction.extend_id
                : (transaction.form_submission_id || transaction.form_submissions?.id);

            let sched: ScheduleInfo = {
                startDate: transaction.billed_start_date || transaction.form_submissions?.start_date || null,
                endDate: transaction.form_submissions?.end_date || null,
                duration: transaction.form_submissions?.duration || null,
                distributionType: transaction.form_submissions?.distribution_type || null,
                kilatSlotHour: null,
            };

            if (sourceId) {
                try {
                    const { data: scheduleRow } = await supabase
                        .from('ad_schedules')
                        .select('start_date, end_date, duration, distribution_type, kilat_slot_hour')
                        .eq('source_id', sourceId)
                        .maybeSingle();

                    if (scheduleRow) {
                        sched = {
                            startDate: scheduleRow.start_date || sched.startDate,
                            endDate: scheduleRow.end_date || sched.endDate,
                            duration: scheduleRow.duration ?? sched.duration,
                            distributionType: scheduleRow.distribution_type || sched.distributionType,
                            kilatSlotHour: scheduleRow.kilat_slot_hour ?? null,
                        };
                    }
                } catch (schedErr) {
                    console.warn('Ad schedule query unavailable:', schedErr);
                }
            }

            if (transaction.entity_type === 'extend' && transaction.extend_id && (!sched.startDate || !sched.endDate)) {
                try {
                    const { data: extendRow } = await supabase
                        .from('form_submissions_extend')
                        .select('start_date, end_date, duration')
                        .eq('id', transaction.extend_id)
                        .maybeSingle();
                    if (extendRow) {
                        sched.startDate = sched.startDate || extendRow.start_date;
                        sched.endDate = sched.endDate || extendRow.end_date;
                        sched.duration = sched.duration ?? extendRow.duration;
                    }
                } catch (extErr) {
                    console.warn('Extend row query unavailable:', extErr);
                }
            }

            setSchedule(sched);

            // Pull paid_at / expires_at from the matching invoice row (best-effort).
            try {
                const { data: invoiceRow } = await supabase
                    .from('invoices')
                    .select('paid_at, expires_at')
                    .eq('payment_id', paymentId)
                    .maybeSingle();
                if (invoiceRow) {
                    setMeta({
                        paid_at: invoiceRow.paid_at ?? null,
                        expires_at: invoiceRow.expires_at ?? null,
                    });
                }
            } catch (metaErr) {
                console.warn('Invoice meta (paid_at/expires_at) unavailable:', metaErr);
            }
        } catch (err: any) {
            console.error('Error fetching invoice:', err);
            setError('Invoice not found or deleted.');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#f8fafc] font-jakarta">
                <Loader2 className="w-8 h-8 animate-spin text-[#0066cc]" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#f8fafc] font-jakarta">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
                    <p className="text-gray-600 mb-4">{error || 'Invoice tidak ditemukan'}</p>
                    <Button onClick={() => window.history.back()} variant="outline">
                        Kembali
                    </Button>
                </div>
            </div>
        );
    }

    // ---- Derived state -----------------------------------------------------
    const isPaid = ['completed', 'paid'].includes((data.status || '').toLowerCase());

    // Parse line items from the transaction note (JSON), with a safe fallback.
    let items: InvoiceItem[] = [];
    try {
        if (data.note && data.note.trim().startsWith('{')) {
            const parsed = JSON.parse(data.note);
            items = parsed.items || [];
        } else {
            items = [{ category: 'Pembayaran', price: data.subtotal ?? data.amount, qty: 1 }];
        }
    } catch (e) {
        items = [{ category: 'Pembayaran', price: data.subtotal ?? data.amount, qty: 1 }];
    }
    if (items.length === 0) {
        items = [{ category: 'Pembayaran', price: data.subtotal ?? data.amount, qty: 1 }];
    }

    // Normalize any stale Kilat Add-on item that has 250.000 price to 200.000, and rename Incentive to Reward
    let itemsWereCorrected = false;
    items = items.map((item) => {
        let updated = { ...item };
        if ((updated.name === 'Add-on JFU Kilat' || updated.category === 'Add-on JFU Kilat') && updated.price === 250000) {
            itemsWereCorrected = true;
            updated.price = 200000;
        }
        if (updated.name && /incentive/i.test(updated.name)) {
            updated.name = updated.name.replace(/incentive/gi, 'Reward');
        }
        if (updated.category && /incentive/i.test(updated.category)) {
            updated.category = updated.category.replace(/incentive/gi, 'Reward');
        }
        return updated;
    });

    const itemsSubtotal = items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
    const subtotalValue = itemsWereCorrected
        ? itemsSubtotal
        : (data.subtotal ?? (data.amount - (data.ppn_amount ?? 0)));
    const ppnAmount = itemsWereCorrected
        ? calculatePpn(subtotalValue)
        : (data.ppn_amount ?? 0);
    const grandTotal = itemsWereCorrected
        ? (subtotalValue + ppnAmount)
        : data.amount;

    const hasPpn = data.ppn_amount != null || itemsWereCorrected;

    // ---- Formatters --------------------------------------------------------
    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);

    const formatDate = (dateString?: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    const formatDateTime = (dateString?: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }) + ' WIB';
    };

    const formatScheduleDate = (
        startDate?: string | null,
        endDate?: string | null,
        duration?: number | null,
        distType?: string | null,
        kilatHour?: number | null,
    ) => {
        if (!startDate && !endDate) return 'Belum dijadwalkan';

        const isKilat = distType === 'kilat';
        const startStr = startDate ? formatDate(startDate) : '';
        const endStr = endDate ? formatDate(endDate) : '';

        if (isKilat) {
            const wave = kilatHour ? ` · Slot ${kilatHour}:00 WIB` : '';
            return `${startStr || endStr} (Kilat${wave})`;
        }

        const dur = duration || 1;
        if (dur === 1 && startDate) {
            return `${startStr} (1 Hari)`;
        }

        if (startDate && endDate) {
            if (startStr === endStr) {
                return `${startStr} (${dur} Hari)`;
            }
            return `${startStr} — ${endStr} (${dur} Hari)`;
        }

        if (startDate) {
            return `${startStr} (${dur} Hari)`;
        }

        return endStr;
    };

    const methodLabel = (() => {
        // Prefer the actual channel (QRIS / VA / e-wallet) when DOKU reported it.
        if (data.payment_channel) return formatPaymentChannel(data.payment_channel);
        const m = (data.payment_method || '').toLowerCase();
        if (m === 'doku') return 'DOKU';
        if (m === 'simulation') return 'Simulasi';
        return data.payment_method ? data.payment_method.toUpperCase() : 'DOKU';
    })();

    // ---- Document identity -------------------------------------------------
    const shortCode = shortDocCode(data.payment_id);
    const invoiceNumber = `INV-${shortCode}`;
    const receiptNumber = `RCP-${shortCode}`;
    const docNumber = isPaid ? receiptNumber : invoiceNumber;
    const docTitle = isPaid ? 'RECEIPT' : 'INVOICE';
    const paidDate = meta.paid_at;
    const showMaterai = data.amount > MATERAI_THRESHOLD;

    return (
        <div className="min-h-screen bg-[#f8fafc] font-jakarta p-4 md:p-8 print:bg-white print:p-0 relative overflow-x-hidden selection:bg-blue-100 selection:text-jfu-primary">
            {/* Modern Mesh Aurora Glow (Selaras dengan Dashboard Peneliti) */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none no-print" aria-hidden="true">
                {/* Titik 1: Mid-Right — Pendaran Biru Jakpat Cerah & Sky Blue */}
                <div
                    className="absolute top-[10%] -right-[6%] md:right-[2%] w-[600px] md:w-[850px] h-[600px] md:h-[850px] rounded-full pointer-events-none transform-gpu"
                    style={{
                        background: 'radial-gradient(circle at center, rgba(24, 124, 255, 0.22) 0%, rgba(56, 189, 248, 0.14) 45%, transparent 75%)',
                        filter: 'blur(90px)',
                    }}
                />

                {/* Titik 2: Mid-Left — Aksen Warm Rose / Blush Pink yang Hidup */}
                <div
                    className="absolute top-[18%] -left-[8%] md:-left-[4%] w-[550px] md:w-[800px] h-[550px] md:h-[800px] rounded-full pointer-events-none transform-gpu"
                    style={{
                        background: 'radial-gradient(circle at center, rgba(251, 113, 133, 0.18) 0%, rgba(244, 114, 182, 0.10) 45%, transparent 75%)',
                        filter: 'blur(95px)',
                    }}
                />

                {/* Titik 3: Lower-Right — Aksen Soft Rose Pink */}
                <div
                    className="absolute top-[55%] -right-[5%] md:right-[4%] w-[550px] md:w-[750px] h-[550px] md:h-[750px] rounded-full pointer-events-none transform-gpu"
                    style={{
                        background: 'radial-gradient(circle at center, rgba(244, 114, 182, 0.16) 0%, rgba(251, 113, 133, 0.08) 50%, transparent 75%)',
                        filter: 'blur(95px)',
                    }}
                />

                {/* Titik 4: Lower-Left — Pendaran Sky Cyan & Biru Jakpat Segar */}
                <div
                    className="absolute top-[65%] -left-[6%] md:left-[0%] w-[600px] md:w-[850px] h-[600px] md:h-[850px] rounded-full pointer-events-none transform-gpu"
                    style={{
                        background: 'radial-gradient(circle at center, rgba(14, 165, 233, 0.20) 0%, rgba(24, 124, 255, 0.12) 45%, transparent 75%)',
                        filter: 'blur(95px)',
                    }}
                />
            </div>

            {/* Print styles */}
            <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background-color: #ffffff !important; }
          .page-container { box-shadow: none !important; border: none !important; margin: 0 !important; border-radius: 0 !important; }
          .print-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 14mm; }
        }
        .tabular { font-variant-numeric: tabular-nums; }
      `}</style>

            {/* Toolbar */}
            <div className="relative z-10 max-w-[820px] mx-auto mb-6 flex justify-end gap-2 no-print">
                <Button onClick={handlePrint} className="bg-[#0066cc] hover:bg-[#0055aa] text-white shadow-sm">
                    <Download className="w-4 h-4 mr-2" />
                    Unduh PDF
                </Button>
            </div>

            {/* Document */}
            <div className="page-container relative z-10 max-w-[820px] mx-auto bg-white shadow-lg rounded-2xl border border-gray-200 overflow-hidden">
                {/* Brand accent bar */}
                <div className={`print-exact h-1.5 w-full ${isPaid ? 'bg-emerald-600' : 'bg-[#0066cc]'}`} />

                <div className="p-8 md:p-12">
                    {/* Header */}
                    <div className="flex justify-between items-start gap-6">
                        <div>
                            <div className="flex items-center gap-3 mb-2.5">
                                <img src={jakpatLogo} alt="Jakpat" className="h-9 w-auto" />
                                <h2 className="font-extrabold text-gray-900 text-lg md:text-xl leading-tight">Jakpat for Universities</h2>
                            </div>
                            <p className="text-[13px] text-gray-600 flex items-center gap-2">
                                <span>product@jakpat.net</span>
                                <span className="text-gray-300">•</span>
                                <span>+62 877-5915-3120</span>
                            </p>
                            <p className="text-[13px] text-gray-400 mt-0.5">Yogyakarta, Indonesia</p>
                        </div>
                        <div className="text-right">
                            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 leading-none">{docTitle}</h1>
                            <p className="text-sm font-semibold text-gray-400 mt-1.5 tabular">#{docNumber}</p>
                            <div className="mt-2.5 flex justify-end">
                                {isPaid ? (
                                    <span className="print-exact inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-3 py-1 rounded-full">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        LUNAS
                                    </span>
                                ) : (
                                    <span className="print-exact inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-3 py-1 rounded-full">
                                        <Clock className="w-3.5 h-3.5" />
                                        BELUM LUNAS
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Accent rule */}
                    <div className={`print-exact h-px w-full my-6 ${isPaid ? 'bg-emerald-100' : 'bg-[#0066cc]/15'}`} />

                    {/* Parties + Payment / Billing Details (Clean Balanced 2-Column Flex) */}
                    <div className="flex justify-between items-start gap-6 mb-8">
                        {/* Customer block */}
                        <div className="min-w-0 flex-1">
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                {isPaid ? 'Diterima Dari' : 'Ditagihkan Kepada'}
                            </h3>
                            <p className="text-gray-900 font-bold text-base">{data.form_submissions?.full_name || 'N/A'}</p>
                            {data.form_submissions?.university && (
                                <p className="text-sm font-medium text-gray-700 mt-0.5">{data.form_submissions.university}</p>
                            )}
                            <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                                {data.form_submissions?.email && <p className="break-words">{data.form_submissions.email}</p>}
                                {data.form_submissions?.phone_number && <p>{data.form_submissions.phone_number}</p>}
                            </div>
                        </div>

                        {/* Payment / Billing Meta block */}
                        <div className="shrink-0 text-left">
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                {isPaid ? 'Detail Pembayaran' : 'Detail Tagihan'}
                            </h3>
                            <table className="text-sm text-left border-separate border-spacing-y-1">
                                <tbody>
                                    <tr>
                                        <td className="text-gray-400 text-xs text-left">Tanggal Terbit</td>
                                        <td className="text-gray-400 text-xs px-2 text-center">:</td>
                                        <td className="font-medium text-gray-800 tabular text-left">{formatDate(data.created_at)}</td>
                                    </tr>
                                    {isPaid ? (
                                        <tr>
                                            <td className="text-gray-400 text-xs text-left">Tanggal Bayar</td>
                                            <td className="text-gray-400 text-xs px-2 text-center">:</td>
                                            <td className="font-medium text-gray-800 tabular text-left">{formatDateTime(paidDate)}</td>
                                        </tr>
                                    ) : (
                                        <tr>
                                            <td className="text-gray-400 text-xs text-left">Jatuh Tempo</td>
                                            <td className="text-gray-400 text-xs px-2 text-center">:</td>
                                            <td className="font-medium text-gray-800 tabular text-left">{formatDate(meta.expires_at)}</td>
                                        </tr>
                                    )}
                                    <tr>
                                        <td className="text-gray-400 text-xs text-left">Metode</td>
                                        <td className="text-gray-400 text-xs px-2 text-center">:</td>
                                        <td className="font-medium text-gray-800 text-left">{methodLabel}</td>
                                    </tr>
                                    <tr>
                                        <td className="text-gray-400 text-xs text-left">Ref. Pembayaran</td>
                                        <td className="text-gray-400 text-xs px-2 text-center">:</td>
                                        <td className="font-mono text-xs text-gray-600 text-left">{data.payment_id}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="overflow-hidden rounded-xl border border-gray-200 mb-6 shadow-2xs">
                        <table className="w-full text-sm">
                            <thead className="print-exact bg-slate-50 border-b border-gray-200 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                                <tr>
                                    <th className="py-3 px-4 text-left">Deskripsi</th>
                                    <th className="py-3 px-4 text-center w-16">Qty</th>
                                    <th className="py-3 px-4 text-right w-32">Harga</th>
                                    <th className="py-3 px-4 text-right w-32">Sub-Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => {
                                    const itemName = item.name || item.category;
                                    const isAdItem = itemName.toLowerCase().includes('jakpat for universities') || item.category.toLowerCase().includes('ads') || item.category === 'Pembayaran';
                                    const isReward = itemName.toLowerCase().includes('reward') || item.category.toLowerCase().includes('reward');
                                    const scheduleText = formatScheduleDate(
                                        schedule?.startDate,
                                        schedule?.endDate,
                                        schedule?.duration,
                                        schedule?.distributionType,
                                        schedule?.kilatSlotHour
                                    );

                                    return (
                                        <tr key={idx} className="border-t border-gray-100 hover:bg-slate-50/40 transition-colors">
                                            <td className="py-3.5 px-4 text-gray-800">
                                                <div className="font-semibold text-gray-900">{itemName}</div>
                                                
                                                {/* Sub-keterangan untuk item Iklan / Platform */}
                                                {isAdItem && (
                                                    <div className="mt-1.5 space-y-0.5 text-xs text-gray-600">
                                                        {data.form_submissions?.title && (
                                                            <div className="flex items-start gap-1.5 leading-relaxed">
                                                                <span className="text-gray-400 select-none">•</span>
                                                                <span><strong className="font-medium text-gray-700">Survei:</strong> {data.form_submissions.title}</span>
                                                            </div>
                                                        )}
                                                        {scheduleText && scheduleText !== 'Belum dijadwalkan' && (
                                                            <div className="flex items-start gap-1.5 leading-relaxed">
                                                                <span className="text-gray-400 select-none">•</span>
                                                                <span><strong className="font-medium text-gray-700">Jadwal:</strong> {scheduleText}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Sub-keterangan untuk item Reward Responden */}
                                                {isReward && item.qty > 0 && (
                                                    <div className="mt-1.5 text-xs text-gray-500 flex items-start gap-1.5 leading-relaxed">
                                                        <span className="text-gray-400 select-none">•</span>
                                                        <span>Distribusi reward untuk {item.qty} responden terpilih</span>
                                                    </div>
                                                )}

                                                {/* Kategori sekunder bila ada */}
                                                {!isAdItem && !isReward && item.name && item.name !== item.category && (
                                                    <div className="text-xs text-gray-400 mt-0.5">{item.category}</div>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center text-gray-600 tabular align-top">{item.qty}</td>
                                            <td className="py-3.5 px-4 text-right text-gray-600 tabular align-top">{formatCurrency(item.price)}</td>
                                            <td className="py-3.5 px-4 text-right text-gray-900 font-semibold tabular align-top">
                                                {formatCurrency(item.price * item.qty)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary (Subtotal → PPN → Total Hero Card) */}
                    <div className="flex flex-col items-end mb-10">
                        {hasPpn && (
                            <div className="w-full sm:w-[320px] mb-2 text-sm space-y-1.5">
                                <div className="flex justify-between items-center py-0.5 text-gray-600">
                                    <span className="text-gray-500">Subtotal</span>
                                    <span className="font-medium text-gray-800 tabular">{formatCurrency(subtotalValue)}</span>
                                </div>
                                <div className="flex justify-between items-center py-0.5 text-gray-600 border-b border-gray-200 pb-2">
                                    <span className="text-gray-500">PPN 11%</span>
                                    <span className="font-medium text-gray-800 tabular">{formatCurrency(ppnAmount)}</span>
                                </div>
                            </div>
                        )}
                        <div className="print-exact w-full sm:w-[320px] bg-[#0066cc] text-white rounded-xl px-5 py-4 flex justify-between items-center shadow-sm">
                            <span className="text-xs font-bold uppercase tracking-wider text-blue-100">Total</span>
                            <span className="font-bold text-2xl tabular text-white">{formatCurrency(grandTotal)}</span>
                        </div>
                        <p className="w-full sm:w-[320px] text-right text-xs italic text-gray-500 mt-2.5 leading-relaxed">
                            Terbilang: {terbilangCapitalized(grandTotal)}
                        </p>
                    </div>

                    {/* Notes & Verification Footer */}
                    <div className="border-t border-gray-100 pt-7 text-sm">
                        {isPaid ? (
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 print-exact text-xs text-gray-600 space-y-2">
                                <div className="flex items-center gap-2 font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                                    <ShieldCheck className="w-4 h-4 text-[#0066cc]" />
                                    <span>Tanda Terima Elektronik Sah</span>
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Pembayaran telah berhasil kami terima. Dokumen ini diterbitkan secara otomatis oleh sistem <strong>Jakpat for Universities</strong> serta sah dan mengikat untuk keperluan administrasi, LPPM, dan pelaporan keuangan kampus tanpa tanda tangan basah.
                                </p>
                                {showMaterai && (
                                    <p className="text-[11px] text-gray-400 pt-1.5 border-t border-slate-200/60">
                                        * Untuk transaksi dengan nilai di atas {formatCurrency(MATERAI_THRESHOLD)}, e-meterai dapat dilampirkan atas permintaan.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <p className="font-bold text-gray-900 mb-1.5">Catatan Tagihan</p>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Silakan selesaikan pembayaran sebelum batas waktu berakhir melalui tautan pembayaran aman di bawah ini.
                                    </p>
                                    {data.payment_url && (
                                        <div className="no-print mt-3.5">
                                            <a
                                                href={data.payment_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 bg-[#0066cc] hover:bg-[#0055aa] text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-colors"
                                            >
                                                Bayar Sekarang
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                            <p className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-2">
                                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                Pembayaran diproses secara aman melalui payment gateway DOKU.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {showMaterai && (
                                    <p className="text-[11px] text-gray-400">
                                        * Untuk transaksi dengan nilai di atas {formatCurrency(MATERAI_THRESHOLD)}, e-meterai dapat dilampirkan atas permintaan.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="mt-8 text-center text-[10px] text-gray-400 uppercase tracking-wider">
                        Powered by Jakpat
                    </div>
                </div>
            </div>
        </div>
    );
}
