import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase'; // Adjust path if needed, check structure
import { Loader2, Download, CheckCircle2, Clock, ExternalLink, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { terbilangCapitalized } from '../utils/terbilang';
import { formatPaymentChannel } from '../utils/paymentChannel';
import jakpatLogo from '../assets/Jakpat Navbar Logo.webp';

interface InvoiceItem {
    name?: string; // Added optional name
    category: string;
    price: number;
    qty: number;
}

interface InvoiceData {
    id: string; // Transaction ID
    payment_id: string;
    amount: number;
    status: string;
    payment_method?: string;
    payment_channel?: string;
    payment_url?: string;
    created_at: string;
    note: string | null;
    form_submissions: {
        full_name: string;
        email: string;
        phone_number: string;
        university: string;
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

    // Strip known leading prefixes (longest first so JFU-INV- wins over JFU-).
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
            full_name,
            email,
            phone_number,
            university
          )
        `)
                .eq('payment_id', paymentId)
                .single();

            if (error) throw error;
            setData(transaction);

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
            <div className="flex items-center justify-center min-h-screen bg-slate-100">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-100">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
                    <p className="text-gray-500">{error}</p>
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
            items = [{ category: 'Pembayaran', price: data.amount, qty: 1 }];
        }
    } catch (e) {
        items = [{ category: 'Pembayaran', price: data.amount, qty: 1 }];
    }
    if (items.length === 0) {
        items = [{ category: 'Pembayaran', price: data.amount, qty: 1 }];
    }

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
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 print:bg-white print:p-0">
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
            <div className="max-w-[820px] mx-auto mb-6 flex justify-end gap-2 no-print">
                <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 shadow-sm">
                    <Download className="w-4 h-4 mr-2" />
                    Unduh PDF
                </Button>
            </div>

            {/* Document */}
            <div className="page-container max-w-[820px] mx-auto bg-white shadow-lg rounded-2xl border border-gray-200 overflow-hidden">
                {/* Brand accent bar */}
                <div className={`print-exact h-1.5 w-full ${isPaid ? 'bg-emerald-600' : 'bg-blue-600'}`} />

                <div className="p-8 md:p-12">
                    {/* Header */}
                    <div className="flex justify-between items-start gap-6">
                        <div>
                            <img src={jakpatLogo} alt="Jakpat" className="h-9 mb-4" />
                            <h2 className="font-bold text-gray-900 text-base">Jakpat for Universities</h2>
                            <p className="text-sm text-gray-500 mt-1">product@jakpat.net</p>
                            <p className="text-sm text-gray-500">+62 877-5915-3120</p>
                            <p className="text-sm text-gray-500">Yogyakarta, Indonesia</p>
                        </div>
                        <div className="text-right">
                            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">{docTitle}</h1>
                            <p className="text-sm font-medium text-gray-400 mt-1 tabular">#{docNumber}</p>
                            <div className="mt-3 flex justify-end">
                                {isPaid ? (
                                    <span className="print-exact inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-bold px-3 py-1 rounded-full">
                                        <CheckCircle2 className="w-4 h-4" />
                                        LUNAS
                                    </span>
                                ) : (
                                    <span className="print-exact inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-sm font-bold px-3 py-1 rounded-full">
                                        <Clock className="w-4 h-4" />
                                        BELUM LUNAS
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Accent rule */}
                    <div className={`print-exact h-px w-full my-8 ${isPaid ? 'bg-emerald-100' : 'bg-blue-100'}`} />

                    {/* Parties + meta */}
                    <div className="flex flex-col sm:flex-row justify-between gap-x-10 gap-y-8 mb-10">
                        {/* Party block */}
                        <div className="min-w-0">
                            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
                                {isPaid ? 'Diterima dari' : 'Ditagihkan kepada'}
                            </h3>
                            <p className="text-gray-900 font-semibold text-[15px]">{data.form_submissions?.full_name || 'N/A'}</p>
                            <p className="text-sm text-gray-500 mt-1 break-words">{data.form_submissions?.email}</p>
                            <p className="text-sm text-gray-500">{data.form_submissions?.phone_number}</p>
                            <p className="text-sm text-gray-500 mt-1.5">{data.form_submissions?.university}</p>
                        </div>

                        {/* Meta spec block — compact, fixed width, tidily aligned */}
                        <div className="w-full sm:w-[280px] shrink-0">
                            <dl className="text-sm divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50/60 print-exact">
                                <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                                    <dt className="text-gray-400 font-medium whitespace-nowrap">{isPaid ? 'Receipt #' : 'Invoice #'}</dt>
                                    <dd className="font-semibold text-gray-900 tabular text-right">{docNumber}</dd>
                                </div>

                                {isPaid && (
                                    <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                                        <dt className="text-gray-400 font-medium whitespace-nowrap">Ref. Invoice</dt>
                                        <dd className="text-gray-700 tabular text-right">{invoiceNumber}</dd>
                                    </div>
                                )}

                                <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                                    <dt className="text-gray-400 font-medium whitespace-nowrap">Tanggal Terbit</dt>
                                    <dd className="text-gray-700 text-right">{formatDate(data.created_at)}</dd>
                                </div>

                                {isPaid ? (
                                    <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                                        <dt className="text-gray-400 font-medium whitespace-nowrap">Tanggal Bayar</dt>
                                        <dd className="text-gray-700 text-right">{formatDateTime(paidDate)}</dd>
                                    </div>
                                ) : (
                                    <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                                        <dt className="text-gray-400 font-medium whitespace-nowrap">Jatuh Tempo</dt>
                                        <dd className="text-gray-700 text-right">{formatDate(meta.expires_at)}</dd>
                                    </div>
                                )}

                                <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                                    <dt className="text-gray-400 font-medium whitespace-nowrap">Metode</dt>
                                    <dd className="text-gray-700 text-right">{methodLabel}</dd>
                                </div>

                                <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                                    <dt className="text-gray-400 font-medium whitespace-nowrap shrink-0">Ref. Pembayaran</dt>
                                    <dd className="text-gray-600 text-[13px] tabular text-right break-all min-w-0">{data.payment_id}</dd>
                                </div>
                            </dl>
                        </div>
                    </div>

                    {/* Items */}
                    <div className="overflow-hidden rounded-xl border border-gray-200 mb-6">
                        <table className="w-full text-sm">
                            <thead className="print-exact bg-slate-900 text-white">
                                <tr>
                                    <th className="py-3 px-4 text-left font-semibold">Deskripsi</th>
                                    <th className="py-3 px-4 text-center font-semibold w-16">Qty</th>
                                    <th className="py-3 px-4 text-right font-semibold w-32">Harga</th>
                                    <th className="py-3 px-4 text-right font-semibold w-32">Sub-Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => (
                                    <tr key={idx} className="border-t border-gray-100">
                                        <td className="py-3.5 px-4 text-gray-800">
                                            <div className="font-semibold">{item.name || item.category}</div>
                                            {item.name && item.name !== item.category && (
                                                <div className="text-xs text-gray-400 mt-0.5">{item.category}</div>
                                            )}
                                        </td>
                                        <td className="py-3.5 px-4 text-center text-gray-600 tabular">{item.qty}</td>
                                        <td className="py-3.5 px-4 text-right text-gray-600 tabular">{formatCurrency(item.price)}</td>
                                        <td className="py-3.5 px-4 text-right text-gray-900 font-semibold tabular">
                                            {formatCurrency(item.price * item.qty)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Total + terbilang */}
                    <div className="flex flex-col items-end mb-10">
                        <div className="print-exact w-full sm:w-[320px] bg-slate-900 text-white rounded-xl px-5 py-4 flex justify-between items-center">
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Total</span>
                            <span className="font-bold text-2xl tabular">{formatCurrency(data.amount)}</span>
                        </div>
                        <p className="w-full sm:w-[320px] text-right text-xs italic text-gray-500 mt-2.5 leading-relaxed">
                            Terbilang: {terbilangCapitalized(data.amount)}
                        </p>
                    </div>

                    {/* Notes / action */}
                    <div className="border-t border-gray-100 pt-7 text-sm">
                        <p className="font-semibold text-gray-700 mb-1">Catatan</p>
                        {isPaid ? (
                            <p className="text-gray-500">
                                Pembayaran telah kami terima. Terima kasih telah menggunakan layanan Jakpat for Universities.
                            </p>
                        ) : (
                            <>
                                <p className="text-gray-500">
                                    Silakan selesaikan pembayaran Anda melalui tombol di bawah ini.
                                </p>
                                {data.payment_url && (
                                    <div className="no-print mt-4">
                                        <a
                                            href={data.payment_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
                                        >
                                            Bayar Sekarang
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                        <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
                                            <ShieldCheck className="w-3.5 h-3.5" />
                                            Pembayaran diproses secara aman melalui DOKU.
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        {showMaterai && (
                            <p className="text-xs text-gray-400 mt-4">
                                Untuk dokumen dengan nilai di atas {formatCurrency(MATERAI_THRESHOLD)}, materai/e-meterai dapat
                                ditambahkan atas permintaan.
                            </p>
                        )}

                        <p className="text-xs text-gray-400 mt-4 italic">
                            Dokumen ini sah dan diterbitkan secara elektronik, sehingga tidak memerlukan tanda tangan.
                        </p>
                    </div>

                    <div className="mt-8 text-center text-[10px] text-gray-400 uppercase tracking-wider">
                        Powered by Jakpat
                    </div>
                </div>
            </div>
        </div>
    );
}
