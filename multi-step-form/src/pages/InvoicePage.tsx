import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase'; // Adjust path if needed, check structure
import { Loader2, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import jakpatLogo from '../assets/Jakpat Navbar Logo.webp';

interface InvoiceItem {
    category: string;
    price: number;
    qty: number;
}

interface InvoiceData {
    id: string; // Transaction ID
    payment_id: string;
    amount: number;
    status: string;
    created_at: string;
    note: string | null;
    form_submissions: {
        full_name: string;
        email: string;
        phone_number: string;
        university: string;
    } | null;
}

export function InvoicePage() {
    const { paymentId } = useParams();
    const [data, setData] = useState<InvoiceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchInvoice();
    }, [paymentId]);

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
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
                    <p className="text-gray-500">{error}</p>
                </div>
            </div>
        );
    }

    // Parse items
    let items: InvoiceItem[] = [];
    try {
        if (data.note && data.note.startsWith('{')) {
            const parsed = JSON.parse(data.note);
            items = parsed.items || [];
        } else {
            // Fallback if note is simple text or empty, though ideally it's always JSON for this app
            items = [{ category: 'Payment', price: data.amount, qty: 1 }];
        }
    } catch (e) {
        items = [{ category: 'Payment', price: data.amount, qty: 1 }];
    }

    // Format Helpers
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    // Generate Invoice Number (using part of ID or Payment ID)
    const invoiceNumber = `INV-${data.payment_id.substring(0, 8).toUpperCase()}`;

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 print:bg-white print:p-0">
            {/* Styles for Print */}
            <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background-color: white; }
          .page-container { box-shadow: none; border: none; padding: 0; margin: 0; }
        }
      `}</style>

            {/* Toolbar */}
            <div className="max-w-[800px] mx-auto mb-6 flex justify-end gap-2 no-print">
                <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                </Button>
            </div>

            {/* Invoice Container */}
            <div className="page-container max-w-[800px] mx-auto bg-white p-8 md:p-12 shadow-lg rounded-lg border border-gray-200">

                {/* Header */}
                <div className="flex justify-between items-start mb-12">
                    <div>
                        <img src={jakpatLogo} alt="Jakpat Logo" className="h-10 mb-4" />
                        <h2 className="font-bold text-gray-900 text-lg">Jakpat</h2>
                        <p className="text-sm text-gray-500 mt-1">product@jakpat.net</p>
                        <p className="text-sm text-gray-500">+62 877-5915-3120</p>
                        <p className="text-sm text-gray-500 mt-1">Yogyakarta, Indonesia</p>
                    </div>
                    <div className="text-right">
                        <h1 className="text-4xl font-bold text-gray-800 mb-2">INVOICE</h1>
                        {data.status === 'completed' || data.status === 'paid' ? (
                            <span className="inline-block bg-green-100 text-green-700 text-sm font-bold px-3 py-1 rounded">
                                LUNAS
                            </span>
                        ) : (
                            <span className="inline-block bg-yellow-100 text-yellow-700 text-sm font-bold px-3 py-1 rounded">
                                BELUM LUNAS
                            </span>
                        )}
                    </div>
                </div>

                {/* Info Grid */}
                <div className="flex justify-between mb-12">
                    <div>
                        <h3 className="font-bold text-gray-900 mb-2">Kepada:</h3>
                        <p className="text-gray-800 font-medium">{data.form_submissions?.full_name || 'N/A'}</p>
                        <p className="text-sm text-gray-500">{data.form_submissions?.email}</p>
                        <p className="text-sm text-gray-500">{data.form_submissions?.phone_number}</p>
                        <p className="text-sm text-gray-500 mt-1">{data.form_submissions?.university}</p>
                    </div>
                    <div className="text-right">
                        <div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-1 text-sm">
                            <div className="text-gray-500 font-medium">Invoice #</div>
                            <div className="font-bold text-gray-900">{invoiceNumber}</div>

                            <div className="text-gray-500 font-medium">Tanggal</div>
                            <div className="text-gray-900">{formatDate(data.created_at)}</div>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="mb-12">
                    <table className="w-full">
                        <thead className="bg-gray-800 text-white">
                            <tr>
                                <th className="py-3 px-4 text-left text-sm font-semibold rounded-tl-md">Item</th>
                                <th className="py-3 px-4 text-center text-sm font-semibold w-16">Qty</th>
                                <th className="py-3 px-4 text-right text-sm font-semibold w-32">Harga</th>
                                <th className="py-3 px-4 text-right text-sm font-semibold w-32 rounded-tr-md">Sub-Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} className="border-b border-gray-100">
                                    <td className="py-4 px-4 text-sm text-gray-800 font-medium">{item.category}</td>
                                    <td className="py-4 px-4 text-center text-sm text-gray-600">{item.qty}</td>
                                    <td className="py-4 px-4 text-right text-sm text-gray-600">{formatCurrency(item.price)}</td>
                                    <td className="py-4 px-4 text-right text-sm text-gray-900 font-bold">
                                        {formatCurrency(item.price * item.qty)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Totals */}
                <div className="flex justify-end mb-12">
                    <div className="w-64 bg-gray-100 p-4 rounded-md flex justify-between items-center">
                        <span className="font-bold text-gray-700">TOTAL</span>
                        <span className="font-bold text-xl text-gray-900">{formatCurrency(data.amount)}</span>
                    </div>
                </div>

                {/* Footer Note */}
                <div className="text-sm text-gray-500 border-t border-gray-100 pt-8">
                    <p className="font-medium mb-1">Catatan:</p>
                    <p>Terima kasih telah menggunakan layanan Jakpat for University.</p>
                    {data.status !== 'completed' && data.status !== 'paid' && (
                        <p className="mt-2">Silakan lakukan pembayaran melalui link yang telah dikirimkan.</p>
                    )}
                </div>

                <div className="mt-8 text-center text-[10px] text-gray-400 uppercase tracking-wider">
                    Powered by Jakpat
                </div>

            </div>
        </div>
    );
}
