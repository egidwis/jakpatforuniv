import type { ReactNode } from 'react';

interface PhaseProps {
    number: number;
    title: string;
    chip?: ReactNode;
    isLast?: boolean;
    children: ReactNode;
}

/**
 * Satu fase dalam rail vertikal bernomor (Review, Jadwal Iklan, ...).
 * Menggantikan stepper: nomor + garis penghubung tetap memberi rasa
 * "perjalanan", tapi isi tiap fase adalah data, bukan simbol abstrak.
 */
export function Phase({ number, title, chip, isLast, children }: PhaseProps) {
    return (
        <div className={`relative pl-8 ${isLast ? '' : 'pb-5'}`}>
            {!isLast && (
                <div className="absolute left-[11px] top-6 bottom-0 w-px bg-gray-200" />
            )}
            <div className="absolute left-0 top-0 w-[22px] h-[22px] rounded-full bg-jfu-primary/10 border border-jfu-primary/20 text-jfu-primary flex items-center justify-center text-[11px] font-bold">
                {number}
            </div>
            <div className="flex items-center justify-between gap-2 min-h-[22px] mb-2.5">
                <h3 className="text-sm font-bold text-[#1a1a1a]">{title}</h3>
                {chip}
            </div>
            {children}
        </div>
    );
}
