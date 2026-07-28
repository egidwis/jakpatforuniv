import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Ikon ⓘ kecil yang membuka keterangan tambahan saat hover/fokus — dipakai di
 * seluruh kartu order (Fase ① metode review, Fase ② rumus biaya & hadiah).
 * Dulu tinggal sebagai helper lokal di SchedulePhase; diangkat ke sini begitu
 * Fase ① butuh pola yang sama, supaya tidak ada dua versi yang bisa drift.
 *
 * `tabIndex={0}` disengaja: di mobile tidak ada hover, jadi trigger harus bisa
 * difokus/di-tap. `asChild` membuat Radix memasang handler-nya ke <span> ini
 * langsung, bukan membungkusnya dengan <button> (nesting tombol di dalam
 * trigger accordion = HTML invalid).
 */
export function InfoTooltip({ content }: { content: ReactNode }) {
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span
                        tabIndex={0}
                        className="inline-flex items-center align-middle ml-1 cursor-help text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <Info className="w-3.5 h-3.5" />
                    </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs bg-gray-900 text-white border-gray-800 px-2.5 py-1.5 shadow-lg max-w-xs">
                    {content}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
