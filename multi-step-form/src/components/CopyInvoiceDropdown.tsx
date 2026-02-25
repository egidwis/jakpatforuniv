import { useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getInvoicesByFormSubmissionId, getTransactionsByFormSubmissionId } from '../utils/supabase';
import { Copy, Link as LinkIcon } from 'lucide-react';

interface CopyInvoiceDropdownProps {
  formSubmissionId: string;
  refreshTrigger?: number;
  isCompact?: boolean;
  overrideStatus?: string | null;
  inlineMode?: boolean;
}

export function CopyInvoiceDropdown({ formSubmissionId, refreshTrigger, isCompact, overrideStatus, inlineMode }: CopyInvoiceDropdownProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchInvoices = async () => {
    try {
      setIsLoading(true);
      // Try fetching invoices first
      let data = await getInvoicesByFormSubmissionId(formSubmissionId);

      // If invoices table is empty, fall back to transactions to cover older automated flows
      if (!data || data.length === 0) {
        const txData = await getTransactionsByFormSubmissionId(formSubmissionId);
        if (txData && txData.length > 0) {
          // Map transaction data to look like an invoice for the dropdown
          data = txData.map(tx => ({
            id: tx.id,
            payment_id: tx.payment_id,
            status: overrideStatus && ['paid', 'completed'].includes(overrideStatus) ? 'completed' : tx.status,
            amount: tx.amount,
            invoice_url: tx.payment_url,
            created_at: tx.created_at,
            form_submission_id: tx.form_submission_id
          }));
        }
      } else {
        // If data exists natively in invoices, still apply override
        data = data.map(inv => ({
          ...inv,
          status: overrideStatus && ['paid', 'completed'].includes(overrideStatus) ? 'completed' : inv.status
        }));
      }

      setInvoices(data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Gagal memuat daftar invoice');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch invoices when component mounts or refreshTrigger changes
  useEffect(() => {
    fetchInvoices();
  }, [formSubmissionId, refreshTrigger]);

  const copyToClipboard = async (invoiceUrl: string, paymentId: string) => {
    try {
      await navigator.clipboard.writeText(invoiceUrl);
      toast.success(`Link invoice ${paymentId.substring(0, 8)}... berhasil disalin!`);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast.error('Gagal menyalin link');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
      case 'completed':
        return <Badge className="bg-green-500 text-white">Lunas</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500 text-white">Pending</Badge>;
      case 'expired':
        return <Badge className="bg-gray-500 text-white">Expired</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-500 text-white">Dibatalkan</Badge>;
      default:
        return <Badge className="bg-gray-500 text-white">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Don't render the button if there are no invoices
  // Don't render the button if there are no invoices and not loading
  if (!isLoading && invoices.length === 0) {
    return null;
  }

  if (inlineMode) {
    if (isLoading || invoices.length === 0) return null;

    return (
      <div className="flex flex-col gap-1 w-full mt-1.5 pt-1.5 border-t border-dashed border-gray-100 dark:border-gray-800">
        <div className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-0.5 px-0.5">Daftar Invoice</div>
        {invoices.map((invoice, index) => (
          <div
            key={invoice.id || index}
            className="flex items-center justify-between group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 p-1.5 rounded transition-colors border border-transparent hover:border-gray-100 dark:hover:border-gray-700"
            onClick={() => copyToClipboard(invoice.invoice_url, invoice.payment_id)}
            title="Klik untuk menyalin link"
          >
            <div className="flex flex-col gap-0.5 overflow-hidden">
              <div className="flex items-center gap-1.5">
                <Copy className="w-3 h-3 text-gray-400 group-hover:text-blue-500 shrink-0" />
                <span className="font-mono text-[9px] text-gray-500 group-hover:text-blue-600 truncate">
                  {invoice.payment_id.substring(0, 8)}...
                </span>
              </div>
              <div className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 pl-[18px]">
                Rp {new Intl.NumberFormat('id-ID').format(invoice.amount)}
              </div>
            </div>
            <div className="scale-75 origin-right shrink-0">
              {getStatusBadge(invoice.status)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {isCompact ? (
          <Button variant="outline" size="icon" disabled={isLoading} className="h-7 w-7 border-dashed border-gray-300 hover:border-blue-300 hover:text-blue-600">
            <LinkIcon className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={isLoading} className="w-full sm:w-auto">
            <LinkIcon className="w-4 h-4 mr-2" />
            Invoice Link
            {invoices.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {invoices.length}
              </Badge>
            )}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Daftar Invoice</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="px-2 py-4 text-sm text-center text-gray-500">
            Memuat...
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-2 py-4 text-sm text-center text-gray-500">
            Belum ada invoice yang dibuat
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            {invoices.map((invoice, index) => (
              <div key={invoice.id || index}>
                <DropdownMenuItem
                  className="cursor-pointer flex flex-col items-start py-3 px-3"
                  onClick={() => copyToClipboard(invoice.invoice_url, invoice.payment_id)}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="flex items-center gap-2">
                      <Copy className="w-3 h-3" />
                      <span className="font-mono text-xs">
                        {invoice.payment_id.substring(0, 12)}...
                      </span>
                    </div>
                    {getStatusBadge(invoice.status)}
                  </div>
                  <div className="text-sm font-medium">
                    Rp {new Intl.NumberFormat('id-ID').format(invoice.amount)}
                  </div>
                  {invoice.created_at && (
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDate(invoice.created_at)}
                    </div>
                  )}
                </DropdownMenuItem>
                {index < invoices.length - 1 && <DropdownMenuSeparator />}
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
