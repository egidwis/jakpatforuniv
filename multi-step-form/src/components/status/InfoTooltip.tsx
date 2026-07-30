import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Ikon ⓘ kecil yang membuka keterangan tambahan saat hover (desktop) atau tap (mobile).
 * Memiliki touch target yang disesuaikan (p-1 -m-1) dan stopPropagation
 * agar tidak memicu accordion toggle saat di-tap pada perangkat mobile.
 */
export function InfoTooltip({ content }: { content: ReactNode }) {
    const [open, setOpen] = useState(false);

    const toggleOpen = (e: React.SyntheticEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setOpen((prev) => !prev);
    };

    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip open={open} onOpenChange={setOpen}>
                <TooltipTrigger asChild>
                    <span
                        tabIndex={0}
                        role="button"
                        aria-label="Info"
                        onClick={toggleOpen}
                        onPointerDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onMouseEnter={() => setOpen(true)}
                        onMouseLeave={() => setOpen(false)}
                        className="inline-flex items-center justify-center p-1 -m-1 align-middle ml-0.5 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors touch-manipulation"
                    >
                        <Info className="w-3.5 h-3.5" />
                    </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs bg-gray-900 text-white border-gray-800 px-2.5 py-1.5 shadow-lg max-w-xs z-50">
                    {content}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
