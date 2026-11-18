import { BOOT_BRAND, BOOT_COPY, type BootLang } from './bootRoute';

/**
 * Skeleton halaman responden. Tiga tahap memuat memakai bentuk yang SAMA supaya
 * responden melihat satu layar yang terisi, bukan putih → loader → halaman:
 *
 *   F1  JS belum ada ......... salinan statis di index.html (data-boot-skeleton)
 *   F2  sesi dibaca / chunk .. SurveyListPageSkeleton / SurveyDetailSkeleton (via BootLoader)
 *   F3  data dimuat .......... SurveyListingPage memakai SurveyListCardsSkeleton,
 *                              SurveyPage memakai SurveyDetailCardSkeleton
 *
 * ⚠️ Geometri (navbar, header, grid) disalin dari SurveyListingPage.tsx dan
 * SurveyPage.tsx. Ubah tata letak di sana → ubah di sini DAN di index.html.
 * Murni tampilan: tanpa tautan/tombol, tanpa data.
 */

const DOT_GRID = {
    backgroundImage: 'radial-gradient(circle, rgba(25, 118, 210, 0.08) 1px, transparent 1px)',
    backgroundSize: '24px 24px',
} as const;

const CARD =
    'rounded-[20px] bg-white/60 border border-white/80 shadow-[0_8px_30px_rgba(25,118,210,0.08),inset_0_1px_1px_rgba(255,255,255,0.95)] overflow-hidden animate-pulse motion-reduce:animate-none';

function CardSkeleton() {
    return (
        <div data-skeleton-card="" className={CARD}>
            <div className="aspect-[2.5/1] bg-slate-200/80" />
            <div className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="h-3.5 w-24 bg-slate-200 rounded-full" />
                    <div className="h-3.5 w-20 bg-slate-100 rounded-full" />
                </div>
                <div className="h-5 w-11/12 bg-slate-200 rounded-lg" />
                <div className="h-4 w-4/5 bg-slate-100 rounded-lg" />
                <div className="pt-3.5 border-t border-slate-900/[0.06] flex justify-between items-center">
                    <div className="space-y-1.5">
                        <div className="h-5 w-28 bg-slate-200 rounded-md" />
                        <div className="h-3 w-20 bg-slate-100 rounded-md" />
                    </div>
                    <div className="h-8 w-20 bg-slate-200 rounded-full" />
                </div>
            </div>
        </div>
    );
}

/** Grid kartu — dipakai SurveyListingPage saat data dimuat (F3) dan oleh skeleton penuh (F2). */
export function SurveyListCardsSkeleton({ label }: { label: string }) {
    return (
        <div role="status" aria-label={label} aria-busy="true">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                    <CardSkeleton key={idx} />
                ))}
            </div>
        </div>
    );
}

/** Seluruh halaman /pages (F2): navbar statis + judul asli + grid kartu. */
export function SurveyListPageSkeleton({ lang }: { lang: BootLang }) {
    const copy = BOOT_COPY[lang];
    return (
        <div
            data-boot-skeleton="pages"
            className="min-h-screen flex flex-col bg-[#f8fafc] text-[#0f172a] font-jakarta antialiased [color-scheme:light] relative overflow-x-hidden"
        >
            <div className="relative z-10 overflow-hidden">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-35" style={DOT_GRID} />
                <div className="relative z-30 pt-4 px-3 sm:px-6 lg:px-10">
                    <div className="max-w-[1280px] mx-auto bg-white/70 rounded-[20px] px-4 sm:px-6 py-3 border border-white/85 shadow-[0_10px_35px_rgba(25,118,210,0.09),0_2px_6px_rgba(15,23,42,0.03),inset_0_1px_1px_rgba(255,255,255,0.95)] flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 shrink-0">
                            <img src="/favicon.webp" alt="" width={32} height={32} className="h-7 sm:h-8 w-auto" />
                            <span className="font-bold text-sm sm:text-lg tracking-tight text-[#1976D2]">{BOOT_BRAND}</span>
                        </div>
                        <div aria-hidden="true" className="hidden md:flex items-center gap-1">
                            <span className="h-9 w-20 rounded-full bg-slate-200/70" />
                            <span className="h-9 w-20 rounded-full bg-slate-200/70" />
                            <span className="h-9 w-28 rounded-full bg-[#1976D2]/[0.12]" />
                        </div>
                        <div aria-hidden="true" className="flex items-center gap-2 sm:gap-2.5">
                            <span className="hidden sm:inline-block h-9 w-36 rounded-full bg-[#1976D2]/25" />
                            <span className="md:hidden inline-block w-9 h-9 rounded-xl bg-slate-200/70" />
                        </div>
                    </div>
                </div>
                <div className="relative z-10 max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-6 sm:pt-10 sm:pb-7">
                    <div className="text-center max-w-xl mx-auto space-y-2 py-2">
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1a1a1a] tracking-[-0.02em] leading-tight">{copy.heading}</h1>
                        <p className="text-sm sm:text-base text-[#555555] leading-relaxed">{copy.subtitle}</p>
                    </div>
                </div>
            </div>
            <div className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 pb-14">
                <SurveyListCardsSkeleton label={copy.loadingList} />
            </div>
        </div>
    );
}

/** Kartu info survei saat memuat — dipakai SurveyPage (F3) di dalam PublicLayout. */
export function SurveyDetailCardSkeleton({ lang }: { lang: BootLang }) {
    const copy = BOOT_COPY[lang];
    return (
        <div
            role="status"
            aria-busy="true"
            className="min-h-screen bg-gray-50 pb-20"
        >
            <div className="aspect-[2.5/1] w-full bg-slate-200/80 animate-pulse motion-reduce:animate-none" />
            <div className="max-w-4xl mx-auto px-0 sm:px-4 -mt-4 sm:-mt-10 relative z-10 w-full">
                <div className="bg-white border-t-4 border-t-blue-500 rounded-none sm:rounded-xl sm:shadow-lg px-4 py-5 md:p-6 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                        <img src="/favicon.webp" alt="" width={20} height={20} className="h-5 w-5" />
                        <span>{copy.loadingSurvey}</span>
                    </div>
                    <div className="animate-pulse motion-reduce:animate-none space-y-4">
                        <div className="h-6 w-24 bg-blue-100 rounded-full" />
                        <div className="h-7 w-11/12 bg-slate-200 rounded-lg" />
                        <div className="h-7 w-3/5 bg-slate-200 rounded-lg" />
                        <div className="h-20 w-full bg-slate-100 rounded-xl" />
                        <div className="h-4 w-full bg-slate-100 rounded-md" />
                        <div className="h-4 w-5/6 bg-slate-100 rounded-md" />
                        <div className="h-11 w-full bg-blue-200/70 rounded-lg" />
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Halaman /pages/:slug sebelum aplikasi siap (F2): ruang PublicLayout + kartu. */
export function SurveyDetailSkeleton({ lang }: { lang: BootLang }) {
    return (
        // Sama dengan PublicLayout di App.tsx (`<main className="container py-8">`).
        <main data-boot-skeleton="survey" className="container py-8">
            <SurveyDetailCardSkeleton lang={lang} />
        </main>
    );
}
