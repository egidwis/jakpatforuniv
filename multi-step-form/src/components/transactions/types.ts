import type { ChipVariant } from '../ui/chip';
import { formatPaymentChannel } from '../../utils/paymentChannel';

export interface Transaction {
  id: string;
  payment_id: string;
  payment_method: string;
  payment_channel?: string | null;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  payment_url: string;
  note?: string;
  created_at: string;
  updated_at: string;
  form_submission_id: string;
  form_submissions?: {
    id: string;
    title: string;
    full_name: string;
    email: string;
    start_date?: string | null;
    end_date?: string | null;
  };
}

export interface TransactionItem {
  name: string;
  category?: string;
  price?: number;
  qty?: number;
}

export interface ParsedNote {
  items: TransactionItem[];
  memo: string;
}

/** `note` is either plain text (memo) or JSON `{ items, memo }`. */
export function parseTransactionNote(note?: string): ParsedNote {
  if (note?.startsWith('{')) {
    try {
      const parsed = JSON.parse(note);
      return { items: parsed.items || [], memo: parsed.memo || '' };
    } catch {
      return { items: [], memo: note || '' };
    }
  }
  return { items: [], memo: note || '' };
}

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export const STATUS_LABELS: Record<Transaction['status'], string> = {
  completed: 'Lunas',
  pending: 'Menunggu',
  failed: 'Gagal',
};

export const STATUS_CHIP_VARIANTS: Record<Transaction['status'], ChipVariant> = {
  completed: 'green',
  pending: 'amber',
  failed: 'red',
};

export function methodChipInfo(
  method: string,
  channel?: string | null,
  status?: Transaction['status']
): { label: string; variant: ChipVariant } {
  // Rows created by the old always-on simulation bug (see payment.ts history):
  // the data is fake, so say so — these need admin follow-up, not disguise.
  if (method === 'simulation') {
    return { label: 'Simulasi — bukan pembayaran nyata', variant: 'red' };
  }
  if (method === 'doku') {
    if (channel) {
      return { label: formatPaymentChannel(channel), variant: 'blue' };
    }
    // Channel is only known once the webhook's success notification arrives.
    // Unpaid → genuinely not chosen yet; paid without channel → legacy row
    // from before 23_add_payment_channel.sql (or a webhook shape we missed).
    return status === 'completed'
      ? { label: 'DOKU · channel tidak tercatat', variant: 'slate' }
      : { label: 'Menunggu channel', variant: 'slate' };
  }
  // LEGACY: transaksi lama dibuat lewat Mayar (gateway lama, sudah diganti DOKU).
  // Dipertahankan agar data historis tetap tampil — tidak ada flow Mayar baru.
  if (method === 'mayar') {
    return { label: 'Mayar (legacy)', variant: 'amber' };
  }
  if (method === 'mayar_manual_invoice') {
    return { label: 'Invoice Manual', variant: 'purple' };
  }
  return { label: method, variant: 'slate' };
}
