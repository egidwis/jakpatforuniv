import type { ImgHTMLAttributes } from 'react';
import { useNearViewport } from '../hooks/nearViewport';

/**
 * <img> yang baru diberi `src` saat mendekati layar (src/hooks/nearViewport.ts).
 * Sebelum itu hanya pembungkus kosong — latar kartu (bg-slate-100) jadi
 * placeholder, dan width/height kartu tetap, jadi tanpa lompatan tata letak.
 * `eager` = kartu pertama (LCP): langsung dimuat.
 */
export function NearViewportImg({ eager, ...img }: ImgHTMLAttributes<HTMLImageElement> & { eager: boolean }) {
    const [ref, near] = useNearViewport<HTMLSpanElement>(eager);
    return (
        <span ref={ref} data-near-viewport="" className="block w-full h-full">
            {near ? <img {...img} /> : null}
        </span>
    );
}
