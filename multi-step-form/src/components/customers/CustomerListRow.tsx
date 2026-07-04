import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Customer, customerDisplayId } from './types';
import { CustomerTierChip } from './CustomerTierChip';

interface CustomerListRowProps {
  customer: Customer;
  onOpen: (key: string) => void;
  /** Row currently open in the detail pane */
  active?: boolean;
}

/**
 * Compact list row: customer id · name with email subtitle · university ·
 * tier chip · chevron. Metrics (orders, spent, last order) and history
 * live in the drawer/pane. Responsive hiding uses plain `hidden md:block`
 * wrappers (never `hidden md:flex` — styles.css overrides `.flex`).
 */
export function CustomerListRow({ customer, onOpen, active }: CustomerListRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(customer.key)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(customer.key);
        }
      }}
      className={cn(
        'group relative flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
        'hover:bg-gray-50',
        active && 'bg-blue-50'
      )}
    >
      {active && <span aria-hidden="true" className="absolute left-0 top-0 h-full w-0.5 bg-blue-600" />}

      {/* Customer ID (derived — no natural id) — hidden below md */}
      <span
        className="hidden md:block w-[110px] shrink-0 font-mono text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 truncate"
        title={customer.key}
      >
        #{customerDisplayId(customer)}
      </span>

      {/* Customer: name, email subtitle below */}
      <div className="flex-1 min-w-0 flex flex-col leading-tight">
        <span className="text-sm font-semibold text-gray-900 truncate" title={customer.name}>
          {customer.name}
        </span>
        <span className="text-[11px] text-gray-500 truncate mt-0.5">{customer.email}</span>
      </div>

      {/* Universitas, jurusan · jenjang subtitle — hidden below lg */}
      <div className="hidden lg:block w-[220px] shrink-0">
        <div className="flex flex-col leading-tight">
          <span className="text-sm text-gray-700 truncate" title={customer.university}>
            {customer.university}
          </span>
          <span className="text-[11px] text-gray-500 truncate mt-0.5">
            {customer.department}
            {customer.education !== '-' ? ` · ${customer.education}` : ''}
          </span>
        </div>
      </div>

      {/* Tier chip */}
      <div className="shrink-0 w-[92px]">
        <CustomerTierChip customer={customer} />
      </div>

      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </div>
  );
}
