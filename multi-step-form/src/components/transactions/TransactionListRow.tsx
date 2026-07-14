import { ChevronRight, Copy } from 'lucide-react';
import { Chip } from '../ui/chip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  type Transaction,
  formatIDR,
  STATUS_LABELS,
  STATUS_CHIP_VARIANTS,
  methodChipInfo,
} from './types';

interface TransactionListRowProps {
  transaction: Transaction;
  onOpen: (id: string) => void;
  /** Row currently open in the detail pane */
  active?: boolean;
}

/**
 * Compact list row: date · payment id · title with researcher subtitle ·
 * total · status chip · method chip · chevron. All item detail & actions
 * live in the drawer. Responsive hiding uses plain `hidden sm:block`
 * wrappers (never `hidden md:flex` — styles.css overrides `.flex`).
 */
export function TransactionListRow({ transaction, onOpen, active }: TransactionListRowProps) {
  const date = new Date(transaction.created_at);
  const method = methodChipInfo(transaction.payment_method, transaction.payment_channel, transaction.status);
  const title = transaction.form_submissions?.title || 'Judul tidak tersedia';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(transaction.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(transaction.id);
        }
      }}
      className={cn(
        'group relative flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
        'hover:bg-gray-50',
        active && 'bg-blue-50'
      )}
    >
      {active && <span aria-hidden="true" className="absolute left-0 top-0 h-full w-0.5 bg-blue-600" />}

      {/* Tanggal pembayaran — hidden on mobile (folds into subtitle) */}
      <div className="hidden sm:block w-[76px] shrink-0">
        <div className="flex flex-col text-[11px] text-gray-500 leading-tight">
          <span className="font-medium text-gray-900">
            {date.toLocaleDateString('id-ID')}
          </span>
          <span>
            {date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* ID transaksi (Invoice) — hidden below md */}
      <div className="hidden md:flex items-center gap-1 w-[200px] shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (transaction.payment_id) {
              navigator.clipboard.writeText(transaction.payment_id)
                .then(() => toast.success('Invoice disalin'))
                .catch(() => toast.error('Gagal menyalin'));
            }
          }}
          className="group/copy flex items-center justify-between text-left font-mono text-[11px] text-gray-500 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 border border-gray-200/60 rounded pl-1.5 pr-1 py-0.5 truncate w-full transition-colors"
          title="Klik untuk menyalin Invoice"
        >
          <span className="truncate flex-1">
            {transaction.payment_id || '—'}
          </span>
          <Copy className="w-3.5 h-3.5 text-gray-400 group-hover/copy:text-gray-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
        </button>
      </div>

      {/* Judul survei, peneliti subtitle below (no leading chip) */}
      <div className="flex-1 min-w-0 flex flex-col leading-tight">
        <span className="text-sm font-semibold text-gray-900 truncate" title={title}>
          {title}
        </span>
        <span className="text-[11px] text-gray-500 truncate mt-0.5">
          {transaction.form_submissions?.full_name}
          <span className="sm:hidden"> · {date.toLocaleDateString('id-ID')}</span>
        </span>
      </div>

      {/* Total */}
      <span className="shrink-0 sm:w-[110px] text-right font-mono text-sm font-semibold text-gray-900">
        {formatIDR(transaction.amount)}
      </span>

      {/* Status chip */}
      <div className="shrink-0 sm:w-[88px]">
        <Chip variant={STATUS_CHIP_VARIANTS[transaction.status]} size="sm">
          {STATUS_LABELS[transaction.status]}
        </Chip>
      </div>

      {/* Metode chip — hidden on mobile */}
      <div className="hidden sm:block w-[110px] shrink-0">
        <Chip variant={method.variant} size="sm">
          {method.label}
        </Chip>
      </div>

      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </div>
  );
}
