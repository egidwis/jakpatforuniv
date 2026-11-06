import { cn } from '@/lib/utils';
import type { OfferKind } from '@/utils/webinarAdmin';
import { Field } from './WebinarFormParts';

const OPTIONS: { kind: OfferKind; label: string; hint: string }[] = [
    { kind: 'live', label: 'Tiket webinar', hint: 'Sesi live + rekaman + materi' },
    { kind: 'replay', label: 'Video kelas', hint: 'Rekaman + materi, tanpa sesi live' },
];

/**
 * C17 "Halaman ini menjual" (Fase 5B), paling atas di form. Pilihan yang terkunci
 * (aturan offerLock = offerSwitchError server) abu-abu, dengan alasannya di bawah.
 */
export function WebinarOfferKindField({
    value,
    lock,
    disabled,
    error,
    onChoose,
}: {
    value: OfferKind;
    lock: { locked: OfferKind; reason: string } | null;
    disabled: boolean;
    error?: string;
    onChoose: (kind: OfferKind) => void;
}) {
    return (
        <Field field="offer_kind" label="Halaman ini menjual" error={error} hint={lock?.reason}>
            <div role="radiogroup" aria-label="Halaman ini menjual" className="[display:grid] grid-cols-2 gap-2 sm:max-w-lg">
                {OPTIONS.map((o) => {
                    const active = value === o.kind;
                    const locked = lock?.locked === o.kind && !active;
                    return (
                        <button
                            key={o.kind}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={disabled || locked}
                            onClick={() => { if (!active) onChoose(o.kind); }}
                            className={cn(
                                'rounded-xl border px-3 py-2.5 text-left transition-colors',
                                active ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:bg-slate-50',
                                (disabled || locked) && 'cursor-not-allowed opacity-50 hover:bg-white',
                            )}
                        >
                            <span className={cn('block text-sm font-semibold', active ? 'text-blue-700' : 'text-slate-800')}>{o.label}</span>
                            <span className="block text-xs text-slate-500">{o.hint}</span>
                        </button>
                    );
                })}
            </div>
        </Field>
    );
}
