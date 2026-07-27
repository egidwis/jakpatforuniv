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
        <div className={`relative pl-8 ${isLast ? '' : 'pb-5'}`}>
            {!isLast && (
                <div className={`absolute left-[11px] top-6 bottom-0 w-px ${lineOn ? 'bg-jfu-primary' : 'bg-gray-200'}`} />
            )}
            <div
                className={`absolute left-0 top-0 w-[22px] h-[22px] rounded-full border flex items-center justify-center text-[11px] font-bold ${
                    active ? 'bg-jfu-primary/10 border-jfu-primary/20 text-jfu-primary' : 'bg-gray-50 border-gray-200 text-gray-400'
                }`}
            >
                {number}
            </div>
            <div className="flex items-center justify-between gap-2 min-h-[22px] mb-2.5">
                <h3 className={`text-sm font-bold ${active ? 'text-[#1a1a1a]' : 'text-gray-400'}`}>{title}</h3>
                {chip}
            </div>
            {children}
        </div>
    );
}
