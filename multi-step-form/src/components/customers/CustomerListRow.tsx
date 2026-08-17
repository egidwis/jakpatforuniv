import { ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type Customer, customerDisplayId } from './types';
import { CustomerTierChip } from './CustomerTierChip';
import { formatIDR } from '@/utils/currency';

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

      {/* Customer ID (derived — click to copy) — hidden below md */}
      <div className="hidden md:block w-[110px] shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const idToCopy = customerDisplayId(customer);
            navigator.clipboard.writeText(idToCopy)
              .then(() => toast.success(`ID #${idToCopy} disalin`))
              .catch(() => toast.error('Gagal menyalin'));
          }}
          className="group/copy flex items-center justify-between text-left font-mono text-[11px] text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-200 rounded px-1.5 py-0.5 truncate w-full transition-colors"
          title={`Klik untuk menyalin Customer ID #${customerDisplayId(customer)}`}
        >
          <span className="truncate">#{customerDisplayId(customer)}</span>
          <Copy className="w-3 h-3 text-gray-400 group-hover/copy:text-blue-600 shrink-0 ml-1 transition-colors" />
        </button>
      </div>

      {/* Tier / Status Icon column — left of Customer */}
      <div className="shrink-0 w-12 flex items-center justify-center">
        <CustomerTierChip customer={customer} />
      </div>

      {/* Customer: name, email subtitle below */}
      <div className="flex-[1.5] min-w-0 flex flex-col leading-tight">
        <span className="text-sm font-semibold text-gray-900 truncate" title={customer.name}>
          {customer.name}
        </span>
        <span className="text-[11px] text-gray-500 truncate mt-0.5">{customer.email}</span>
      </div>

      {/* Universitas, jurusan · jenjang subtitle — hidden below lg */}
      <div className="hidden lg:block flex-1 min-w-[220px]">
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

      {/* Orders count — hidden below sm */}
      <span className="hidden sm:block w-[70px] shrink-0 text-center text-sm text-gray-600 font-medium">
        {customer.totalOrders}
      </span>

      {/* Spent amount — hidden below sm */}
      <span className="hidden sm:block w-[110px] shrink-0 text-right text-sm font-semibold font-mono text-gray-900">
        {formatIDR(customer.totalSpent)}
      </span>

      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </div>
  );
}
