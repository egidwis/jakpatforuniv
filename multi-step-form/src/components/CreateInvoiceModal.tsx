import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { createManualInvoice } from '../utils/payment';
import { createInvoice, createTransaction } from '../utils/supabase';
import type { Invoice, Transaction } from '../utils/supabase';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  formSubmissionId: string;
  defaultAmount: number;
  customerInfo: {
    fullName?: string;
    email?: string;
    phoneNumber?: string;
  };
  onSuccess?: () => void;
}

export function CreateInvoiceModal({
  isOpen,
  onClose,
  formSubmissionId,
  defaultAmount,
  customerInfo,
  onSuccess
}: CreateInvoiceModalProps) {
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [note, setNote] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateInvoice = async () => {
    try {
      setIsLoading(true);

      // Validate amount
      if (!amount || amount <= 0) {
        toast.error('Jumlah invoice harus lebih dari 0');
        return;
      }

      // Create invoice via Mayar API
      const description = note.trim()
        ? `Invoice Manual - Survey Jakpat (${note.trim()})`
        : 'Invoice Manual - Survey Jakpat';

      const mayarResponse = await createManualInvoice({
        formSubmissionId,
        amount,
        description,
        customerInfo
      });

      // Save invoice to database
      const invoiceData: Invoice = {
        form_submission_id: formSubmissionId,
        payment_id: mayarResponse.payment_id,
        invoice_url: mayarResponse.invoice_url,
        amount,
        status: 'pending'
      };

      await createInvoice(invoiceData);

      // IMPORTANT: Also create transaction so webhook can update payment_status
      const transactionData: Transaction = {
        form_submission_id: formSubmissionId,
        payment_id: mayarResponse.payment_id,
        payment_method: 'mayar_manual_invoice',
        amount,
        status: 'pending',
        payment_url: mayarResponse.invoice_url,
        note: note.trim() || null
      };

      await createTransaction(transactionData);

      toast.success('Invoice berhasil dibuat!');

      // Call onSuccess callback to refresh the invoices list
      if (onSuccess) {
        onSuccess();
      }

      // Close modal
      onClose();
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal membuat invoice');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      setAmount(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Buat Invoice Manual</DialogTitle>
          <DialogDescription>
            Buat invoice pembayaran untuk submission ini. Jumlah bisa disesuaikan sesuai kebutuhan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label htmlFor="amount" className="text-sm font-medium text-gray-900">
              Jumlah Invoice (Rp)
            </label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={handleAmountChange}
              placeholder="Masukkan jumlah"
              min="0"
              step="1000"
            />
            <p className="text-xs text-gray-500">
              Default: Rp {new Intl.NumberFormat('id-ID').format(defaultAmount)}
            </p>
          </div>

          <div className="grid gap-2">
            <label htmlFor="note" className="text-sm font-medium text-gray-900">
              Catatan (Opsional)
            </label>
            <Input
              id="note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Pembayaran tahap 2, Diskon khusus, dll"
              maxLength={100}
            />
            <p className="text-xs text-gray-500">
              Catatan akan ditampilkan di invoice dan list transaksi
            </p>
          </div>

          {customerInfo.fullName && (
            <div className="grid gap-2">
              <p className="text-sm text-gray-900">
                <span className="font-medium">Pelanggan:</span> {customerInfo.fullName}
              </p>
              {customerInfo.email && (
                <p className="text-sm text-gray-600">{customerInfo.email}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleCreateInvoice}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isLoading ? 'Membuat...' : 'Buat Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
