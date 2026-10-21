import type { ReactNode } from 'react';

/**
 * Satu-satunya anatomi pil status di kartu order (chip review, chip jadwal).
 * Dulu ditulis ulang di enam tempat dengan kelas yang sama persis — dan satu salinannya
 * (`getPublicationChip`) bahkan tak pernah dipakai. Warna dioper sebagai kelas, jadi
 * pemanggil tetap memutuskan MAKNA warnanya; di sini hanya bentuknya.
 */
export function StatusPill({
    bg,
    text,
    dot,
    pulse = false,
    children,
}: {
    /** Kelas latar + border, mis. `bg-slate-100 border-slate-200`. */
    bg: string;
    /** Kelas warna teks. */
    text: string;
    /** Kelas warna titik. */
    dot: string;
    /** Titik berdenyut — hanya untuk keadaan yang menunggu seseorang. */
    pulse?: boolean;
    children: ReactNode;
}) {
    return (
        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${bg} ${text}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} ${pulse ? 'animate-pulse' : ''}`} />
            {children}
        </span>
    );
}
