import type { ReactNode } from 'react';

/**
 * Judul halaman inline — ikut ter-scroll bersama konten. AppNav adalah
 * satu-satunya bar sticky; header halaman tidak lagi menjadi chrome kedua.
 */
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
    return (
        <div className="max-w-4xl mx-auto px-4 md:px-6 pt-5 md:pt-8 pb-1 flex items-center justify-between gap-3">
            <h1 className="text-lg md:text-xl font-bold text-[#1a1a1a] dark:text-white truncate">
                {title}
            </h1>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}
