import { Chip } from '../ui/chip';
import { DetailSheet, DetailSheetSection } from '../data-list/DetailSheet';
import { DetailPane } from '../data-list/DetailPane';
import { formatIDR } from '../transactions/types';
import { type Customer, formatDate, submissionStatusChip } from './types';
import { CustomerTierChip } from './CustomerTierChip';

interface CustomerDetailSheetProps {
  customer: Customer | null;
  onOpenChange: (open: boolean) => void;
  /** 'sheet' renders a right drawer (default); 'pane' renders the inline reading pane */
  variant?: 'sheet' | 'pane';
}

/**
 * Customer detail: profile info + full order history. Same variant
 * contract as TransactionDetailSheet — pane at ≥1280px, drawer below.
 */
export function CustomerDetailSheet({
  customer,
  onOpenChange,
  variant = 'sheet',
}: CustomerDetailSheetProps) {
  if (!customer) return null;

  const subtitle = (
    <>
      {customer.email}
      {customer.phone !== '-' ? ` · ${customer.phone}` : ''}
    </>
  );

  const chips = (
    <>
      <CustomerTierChip customer={customer} />
      {!customer.isLinked && (
        <Chip variant="orange" size="sm">Unlinked Account</Chip>
      )}
    </>
  );

  const body = (
    <>
      <DetailSheetSection title="Profil">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Customer ID</dt>
            <dd
              className="text-gray-900 text-right font-mono text-xs min-w-0 truncate"
              title={customer.authUserId ?? customer.key}
            >
              {customer.authUserId ?? customer.key}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Universitas</dt>
            <dd className="text-gray-900 text-right truncate">{customer.university}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Jurusan</dt>
            <dd className="text-gray-900 text-right truncate">{customer.department}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Jenjang</dt>
            <dd className="text-gray-900 text-right">{customer.education}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Order Pertama</dt>
            <dd className="text-gray-900 text-right">{formatDate(customer.firstOrder)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Order Terakhir</dt>
            <dd className="text-gray-900 text-right">{formatDate(customer.lastOrder)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Total Order</dt>
            <dd className="text-gray-900 text-right">{customer.totalOrders}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Total Spent</dt>
            <dd className="text-gray-900 text-right font-mono font-semibold">{formatIDR(customer.totalSpent)}</dd>
          </div>
        </dl>
      </DetailSheetSection>

      <DetailSheetSection title={`Riwayat Order (${customer.submissions.length})`}>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {customer.submissions.map((sub) => {
            const chip = submissionStatusChip(sub.submission_status, sub.payment_status);
            return (
              <div key={sub.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate" title={sub.title || undefined}>
                    {sub.title || 'Untitled Survey'}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    <span className="font-mono text-gray-500">#{sub.id.slice(0, 8)}</span> · {formatDate(sub.created_at)}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <Chip variant={chip.variant} size="sm">{chip.label}</Chip>
                  <span className="text-sm font-semibold text-gray-900 font-mono">
                    {formatIDR(sub.total_cost || 0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </DetailSheetSection>
    </>
  );

  if (variant === 'pane') {
    return (
      <DetailPane
        title={customer.name}
        subtitle={subtitle}
        chips={chips}
        onClose={() => onOpenChange(false)}
      >
        {body}
      </DetailPane>
    );
  }

  return (
    <DetailSheet
      open={!!customer}
      onOpenChange={onOpenChange}
      title={customer.name}
      subtitle={subtitle}
      chips={chips}
    >
      {body}
    </DetailSheet>
  );
}
