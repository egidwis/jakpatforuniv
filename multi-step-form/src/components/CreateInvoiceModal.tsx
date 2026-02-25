import { useState, useEffect } from 'react';
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
import { Trash2, Plus } from 'lucide-react';

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
  defaultItems?: {
    name: string;
    qty: number;
    price: number;
    category: string;
  }[];
  onSuccess?: () => void;
}

interface InvoiceItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  category: string;
}

export function CreateInvoiceModal({
  isOpen,
  onClose,
  formSubmissionId,
  defaultAmount,
  customerInfo,
  defaultItems,
  onSuccess
}: CreateInvoiceModalProps) {
  // Items state
  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (defaultItems && defaultItems.length > 0) {
      return defaultItems.map((item, index) => ({
        id: Date.now().toString() + index,
        ...item
      }));
    }
    return [
      { id: '1', name: 'Jakpat for University (ads)', qty: 1, price: defaultAmount, category: 'Jakpat for University (ads)' }
    ];
  });

  const [note, setNote] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(defaultAmount);

  // Recalculate total whenever items change
  useEffect(() => {
    const total = items.reduce((sum, item) => sum + (item.qty * item.price), 0);
    setTotalAmount(total);
  }, [items]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (defaultItems && defaultItems.length > 0) {
        setItems(defaultItems.map((item, index) => ({
          id: Date.now().toString() + index,
          ...item
        })));
      } else {
        setItems([{ id: Date.now().toString(), name: 'Jakpat for University (ads)', qty: 1, price: defaultAmount, category: 'Jakpat for University (ads)' }]);
      }
      setNote('');
    }
  }, [isOpen, defaultAmount, defaultItems]);

  const handleAddItem = () => {
    setItems([
      ...items,
      { id: Date.now().toString(), name: '', qty: 1, price: 0, category: 'Lainnya' }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length === 1) {
      toast.error('Minimal satu item diperlukan');
      return;
    }
    setItems(items.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updates: Partial<InvoiceItem> = { [field]: value };
        if (field === 'category') {
          if (value !== 'Lainnya') {
            updates.name = value as string;
          } else {
            updates.name = '';
          }
        }
        return { ...item, ...updates };
      }
      return item;
    }));
  };

  const handleCreateInvoice = async () => {
    try {
      setIsLoading(true);

      // Validate items
      const invalidItems = items.filter(item => !item.name.trim() || item.price < 0 || item.qty < 1);
      if (invalidItems.length > 0) {
        toast.error('Mohon lengkapi semua data item dengan benar');
        return;
      }

      if (totalAmount <= 0) {
        toast.error('Total invoice harus lebih dari 0');
        return;
      }

      // Create description from items for Mayar
      const itemSummary = items.map(item => `${item.name} (${item.qty}x)`).join(', ');
      const description = note.trim()
        ? `${itemSummary} - ${note.trim()}`
        : itemSummary;

      // Prepare JSON data for note column
      const noteData = {
        memo: note.trim(),
        items: items.map(({ name, qty, price, category }) => ({ name, qty, price, category }))
      };
      const noteJson = JSON.stringify(noteData);

      const mayarResponse = await createManualInvoice({
        formSubmissionId,
        amount: totalAmount,
        description, // Simplified description for Mayar
        customerInfo
      });

      // Save invoice to database
      const invoiceData: Invoice = {
        form_submission_id: formSubmissionId,
        payment_id: mayarResponse.payment_id,
        invoice_url: mayarResponse.invoice_url,
        amount: totalAmount,
        status: 'pending'
      };

      await createInvoice(invoiceData);

      // Create transaction with JSON note
      const transactionData: Transaction = {
        form_submission_id: formSubmissionId,
        payment_id: mayarResponse.payment_id,
        payment_method: 'mayar_manual_invoice',
        amount: totalAmount,
        status: 'pending',
        payment_url: mayarResponse.invoice_url,
        note: noteJson // Store JSON here
      };

      await createTransaction(transactionData);



      toast.success('Invoice berhasil dibuat!');

      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error(error instanceof Error ? error.message : 'Gagal membuat invoice');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Invoice Manual</DialogTitle>
          <DialogDescription>
            Buat invoice pembayaran dengan rincian item.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">Items*</label>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 items-start">
                  <div className="w-32 md:w-40">
                    <select
                      value={item.category || 'Lainnya'}
                      onChange={(e) => handleItemChange(item.id, 'category', e.target.value)}
                      className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="Jakpat for University (ads)">Jakpat for University (ads)</option>
                      <option value="Jakpat for University (Platform)">Jakpat for University (Platform)</option>
                      <option value="Respondent's Incentive">Respondent's Incentive</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <Input
                      placeholder="Nama Item"
                      value={item.name}
                      onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                      className="w-full placeholder:text-gray-400"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      placeholder="Qty"
                      min="1"
                      value={item.qty}
                      onChange={(e) => handleItemChange(item.id, 'qty', parseInt(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      className="w-full border p-2 rounded placeholder:text-gray-400"
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      placeholder="Harga"
                      min="0"
                      value={item.price}
                      onChange={(e) => handleItemChange(item.id, 'price', parseInt(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      className="w-full placeholder:text-gray-400"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleRemoveItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Tambah Item
            </Button>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center text-lg font-semibold">
              <span>Total</span>
              <span>Rp {new Intl.NumberFormat('id-ID').format(totalAmount)}</span>
            </div>
          </div>

          <div className="grid gap-2">
            <label htmlFor="note" className="text-sm font-medium text-gray-900">
              Memo (Opsional)
            </label>
            <Input
              id="note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan tambahan untuk invoice ini"
              maxLength={200}
              className="placeholder:text-gray-400"
            />
          </div>

          {customerInfo.fullName && (
            <div className="bg-gray-50 p-3 rounded-md">
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
