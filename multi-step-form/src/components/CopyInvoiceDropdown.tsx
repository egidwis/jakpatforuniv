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
import { getInvoicesByFormSubmissionId } from '../utils/supabase';
import type { Invoice } from '../utils/supabase';
import { Copy, Link as LinkIcon } from 'lucide-react';

interface CopyInvoiceDropdownProps {
  formSubmissionId: string;
  refreshTrigger?: number;
}

export function CopyInvoiceDropdown({ formSubmissionId, refreshTrigger }: CopyInvoiceDropdownProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchInvoices = async () => {
    try {
      setIsLoading(true);
      const data = await getInvoicesByFormSubmissionId(formSubmissionId);
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
  if (!isLoading && invoices.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isLoading} className="w-full sm:w-auto">
          <LinkIcon className="w-4 h-4 mr-2" />
          Invoice Link
          {invoices.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {invoices.length}
            </Badge>
          )}
        </Button>
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
