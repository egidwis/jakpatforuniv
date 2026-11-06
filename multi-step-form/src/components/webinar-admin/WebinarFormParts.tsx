import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldDomId, type FieldKey } from '@/utils/webinarAdmin';

/** Pembungkus satu isian: label, petunjuk, dan galat merah. `id` dipakai untuk lompat ke isian yang kurang. */
export function Field({
    field,
    label,
    hint,
    error,
    aside,
    children,
}: {
    field: FieldKey;
    label: ReactNode;
    hint?: ReactNode;
    error?: string;
    aside?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div id={fieldDomId(field)} className={cn('scroll-mt-24 rounded-xl', error && 'ring-2 ring-red-200 ring-offset-4 ring-offset-white')}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-slate-800">{label}</span>
                {aside && <span className="text-[11px] text-slate-500 tabular-nums">{aside}</span>}
            </div>
            {children}
            {error ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600" role="alert">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
                </p>
            ) : hint ? (
                <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
            ) : null}
        </div>
    );
}

/** Judul kecil seksi di panel kanan. */
export function PanelHeading({ children }: { children: ReactNode }) {
    return <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{children}</h3>;
}

// Warna border input dipaksa `#root input {… !important}` di InternalDashboardWithLayout,
// jadi tanda galat ada di cincin pembungkus Field, bukan di border input.
export const inputClass = (_error?: string) =>
    'h-10 w-full rounded-lg border px-3 text-sm text-slate-900 placeholder:text-slate-400 disabled:opacity-60';

/** Tanggal + jam WIB berdampingan. */
export function WibDateTime({
    date,
    time,
    onChange,
    disabled,
    error,
    label,
}: {
    date: string;
    time: string;
    onChange: (next: { date: string; time: string }) => void;
    disabled?: boolean;
    error?: string;
    label: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <input
                type="date"
                value={date}
                onChange={(e) => onChange({ date: e.target.value, time })}
                disabled={disabled}
                className={cn(inputClass(error), 'min-w-0 flex-1')}
                aria-label={`${label} — tanggal`}
            />
            <input
                type="time"
                value={time}
                onChange={(e) => onChange({ date, time: e.target.value })}
                disabled={disabled}
                className={cn(inputClass(error), '!w-[6.5rem] shrink-0')}
                aria-label={`${label} — jam`}
            />
            <span className="text-xs font-semibold text-slate-500">WIB</span>
        </div>
    );
}
