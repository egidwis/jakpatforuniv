import type { ReactNode } from 'react';

interface PhaseProps {
    number: number;
    title: string;
    chip?: ReactNode;
    isLast?: boolean;
    /** Sudah tercapai/sedang berjalan (kumulatif) — nomor menyala biru.
     * Belum tercapai — nomor abu-abu netral. Default `true` supaya caller
     * yang belum sempat menghitung status (kalau ada) tidak diam-diam
     * berubah tampilan. */
    active?: boolean;
    /** Garis penghubung ke fase BERIKUTNYA menyala biru — beda dari `active`:
     * ini baru benar kalau fase berikutnya JUGA sudah tercapai (bukan cuma
     * fase ini sendiri), supaya rail terbaca sebagai jejak progres yang
     * tersambung, bukan cuma nomor yang menyala sendiri-sendiri. Default
     * ikut `active` kalau tak dioper eksplisit oleh pemanggil. */
    lineActive?: boolean;
    children: ReactNode;
}

/**
 * Satu fase dalam rail vertikal bernomor (Review, Jadwal Iklan, ...).
 * Menggantikan stepper: nomor + garis penghubung tetap memberi rasa
 * "perjalanan", tapi isi tiap fase adalah data, bukan simbol abstrak.
 */
export function Phase({ number, title, chip, isLast, active = true, lineActive, children }: PhaseProps) {
    const lineOn = lineActive ?? active;
    return (
        <div className={`relative pl-8 sm:pl-9 ${isLast ? '' : 'pb-6'}`}>
            {!isLast && (
                <div className={`absolute left-[11px] top-6 bottom-0 w-0.5 rounded-full ${lineOn ? 'bg-jfu-primary/40' : 'bg-slate-200'}`} />
            )}
            <div
                className={`absolute left-0 top-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-extrabold transition-colors ${
                    active 
                        ? 'bg-blue-50 border-blue-300/80 text-jfu-primary ring-2 ring-blue-50' 
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                }`}
            >
                {number}
            </div>
            <div className="flex items-center justify-between gap-2 min-h-[24px] mb-2.5">
                <h3 className={`text-sm font-bold tracking-tight ${active ? 'text-slate-900' : 'text-slate-400'}`}>{title}</h3>
                {chip}
            </div>
            {children}
        </div>
    );
}
