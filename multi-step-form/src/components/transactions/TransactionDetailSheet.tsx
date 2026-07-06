import { Copy, Download, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Chip } from '../ui/chip';
import { DetailSheet, DetailSheetSection } from '../data-list/DetailSheet';
import { DetailPane } from '../data-list/DetailPane';
import {
  type Transaction,
  parseTransactionNote,
  formatIDR,
  STATUS_LABELS,
  STATUS_CHIP_VARIANTS,
  methodChipInfo,
} from './types';

interface TransactionDetailSheetProps {
  transaction: Transaction | null;
  onOpenChange: (open: boolean) => void;
  /** 'sheet' renders a right drawer (default); 'pane' renders the inline reading pane */
  variant?: 'sheet' | 'pane';
}

function copyToClipboard(value: string, label: string) {
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} disalin`))
    .catch(() => toast.error('Gagal menyalin'));
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatScheduleRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return 'Belum dijadwalkan';
  if (start && end) {
    return `${formatDate(start)} — ${formatDate(end)}`;
  }
  return formatDate(start || end);
}

/**
 * Transaction detail: item breakdown + memo, payment info, and actions.
 * Same variant contract as SubmissionDetailSheet — pane at ≥1280px,
 * drawer below.
 */
export function TransactionDetailSheet({
  transaction,
  onOpenChange,
  variant = 'sheet',
}: TransactionDetailSheetProps) {
  if (!transaction) return null;

  const { items, memo } = parseTransactionNote(transaction.note);
  const method = methodChipInfo(transaction.payment_method, transaction.payment_channel);
  const title = transaction.form_submissions?.title || 'Judul tidak tersedia';

  const subtitle = (
    <>
      {transaction.form_submissions?.full_name}
      {transaction.form_submissions?.email ? ` · ${transaction.form_submissions.email}` : ''}
    </>
  );

  const chips = (
    <>
      <Chip variant={STATUS_CHIP_VARIANTS[transaction.status]} size="sm">
        {STATUS_LABELS[transaction.status]}
      </Chip>
      <Chip variant={method.variant} size="sm">
        {method.label}
      </Chip>
    </>
  );

  const body = (
    <>
      <DetailSheetSection title="Submission yang Dibayar">
        {transaction.form_submissions ? (
          <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 space-y-3.5 shadow-sm">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Judul Survey</span>
              <p className="text-sm font-semibold text-slate-800 leading-snug">
                {transaction.form_submissions.title}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-1 border-t border-slate-100">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Submission ID</span>
                <span className="font-mono text-xs font-semibold text-slate-700 bg-white border border-slate-200/50 rounded-md px-2 py-0.5">
                  #{transaction.form_submissions.id ? transaction.form_submissions.id.substring(0, 8) : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Tanggal Schedule</span>
                <span className="text-xs text-slate-700 font-semibold block">
                  {formatScheduleRange(transaction.form_submissions.start_date, transaction.form_submissions.end_date)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Data submission tidak tersedia</p>
        )}
      </DetailSheetSection>

      <DetailSheetSection title="Rincian Item">
        {items.length > 0 ? (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  {item.category && (
                    <span className="mt-1 inline-block text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {item.category}
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-gray-900 font-mono">
                    {formatIDR(item.price || 0)}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">x{item.qty || 1}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Tidak ada rincian item</p>
        )}
        {memo && (
          <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50/50 px-3 py-2 rounded-lg border border-blue-100/50">
            <span className="font-semibold shrink-0">Catatan:</span>
            <span className="italic break-words">{memo}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-gray-200 pt-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total</span>
          <span className="text-base font-bold text-gray-900 font-mono">
            {formatIDR(transaction.amount)}
          </span>
        </div>
      </DetailSheetSection>

      <DetailSheetSection title="Pembayaran">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Payment ID</dt>
            <dd className="flex items-center gap-1 min-w-0">
              <span className="font-mono text-xs text-gray-900 truncate">
                {transaction.payment_id || '—'}
              </span>
              {transaction.payment_id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-gray-400 hover:text-gray-700"
                  title="Salin Payment ID"
                  onClick={() => copyToClipboard(transaction.payment_id, 'Payment ID')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Metode</dt>
            <dd className="text-gray-900">{method.label}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Dibuat</dt>
            <dd className="text-gray-900">{formatDateTime(transaction.created_at)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Diperbarui</dt>
            <dd className="text-gray-900">{formatDateTime(transaction.updated_at)}</dd>
          </div>
        </dl>
      </DetailSheetSection>
    </>
  );

  const footer = transaction.payment_url ? (
    <div className="flex gap-2">
      {transaction.status === 'pending' && (
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-9"
          onClick={() => copyToClipboard(transaction.payment_url, 'Link pembayaran')}
        >
          <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
          Salin Link Bayar
        </Button>
      )}
      <Button asChild size="sm" className="flex-1 h-9 bg-blue-600 hover:bg-blue-700">
        <a
          href={`/invoices/${transaction.payment_id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {transaction.status === 'completed' ? 'Download Receipt' : 'Download Invoice'}
        </a>
      </Button>
    </div>
  ) : undefined;

  if (variant === 'pane') {
    return (
      <DetailPane
        title={title}
        subtitle={subtitle}
        chips={chips}
        footer={footer}
        onClose={() => onOpenChange(false)}
      >
        {body}
      </DetailPane>
    );
  }

  return (
    <DetailSheet
      open={!!transaction}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={subtitle}
      chips={chips}
      footer={footer}
    >
      {body}
    </DetailSheet>
  );
}
