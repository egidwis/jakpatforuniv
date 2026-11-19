import { BOOT_LOGIN_COPY, type BootLang } from './bootRoute';

/**
 * Skeleton /login untuk pengunjung yang BELUM login — terutama jalur "Beli tiket"
 * di /webinar (→ /dashboard/webinar/beli/… → PrivateRoute → /login). Dulu
 * mereka melihat "Menyiapkan workspace kamu…" yang tak bermakna bagi pembeli.
 *
 *   F1  JS belum ada ..... salinan statis di index.html (data-boot-skeleton="login")
 *   F2  sesi dibaca ...... komponen ini (via BootLoader)
 *   F3  LoginPage asli
 *
 * ⚠️ Geometri disalin dari LoginPage.tsx (kartu max-w-md, tab, tombol Google,
 * dua kolom, tombol kirim). Ubah tata letak di sana → ubah di sini DAN di
 * index.html. Murni tampilan: tanpa tombol, tautan, atau input sungguhan.
 */
export function LoginSkeleton({ lang }: { lang: BootLang }) {
    const c = BOOT_LOGIN_COPY[lang];
    return (
        <div data-boot-skeleton="login" className="relative min-h-screen w-full flex flex-col justify-between bg-[#f8fafc] px-4 py-8 overflow-hidden">
            <div className="relative z-10 flex-1 flex items-center justify-center py-4">
                <div role="status" aria-busy="true" className="w-full max-w-md bg-white/95 border border-slate-200/90 shadow-[0_4px_20px_-2px_rgba(24,124,255,0.06),0_12px_32px_-4px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden p-6 sm:p-8">
                    <div className="flex flex-col items-center text-center mb-6">
                        <div className="mb-3 h-8 md:h-9 w-36 rounded-lg bg-slate-200/80 animate-pulse motion-reduce:animate-none" />
                        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{c.heading}</h1>
                        <p className="text-xs text-slate-500 mt-1">{c.subtitle}</p>
                    </div>
                    <div className="[display:grid] grid-cols-2 p-1 bg-slate-100/90 rounded-xl mb-6 border border-slate-200/60">
                        <div className="py-2 text-xs font-bold rounded-lg text-center bg-white text-slate-900 shadow-2xs">{c.tabLogin}</div>
                        <div className="py-2 text-xs font-bold rounded-lg text-center text-slate-500">{c.tabSignup}</div>
                    </div>
                    <div className="space-y-4">
                        <div className="w-full h-11 border border-slate-200 bg-white text-slate-700 rounded-xl shadow-2xs flex items-center justify-center gap-2.5">
                            <span className="w-4 h-4 rounded-full bg-slate-200" />
                            <span className="text-xs font-bold">{c.google}</span>
                        </div>
                        <div className="relative my-2">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-slate-200" />
                            </div>
                            <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                                <span className="bg-white px-3 text-slate-400 font-semibold">{c.orEmail}</span>
                            </div>
                        </div>
                        <div className="space-y-3.5">
                            <div className="space-y-1">
                                <div className="text-xs font-bold text-slate-700">{c.email}</div>
                                <div className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50" />
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs font-bold text-slate-700">{c.password}</div>
                                <div className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50" />
                            </div>
                            <div className="w-full h-11 bg-gradient-to-r from-jfu-primary to-jfu-light text-white font-bold rounded-xl shadow-xs text-sm flex items-center justify-center mt-2 opacity-70">{c.submit}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="relative z-10 w-full max-w-5xl mx-auto pt-6 pb-2 h-[42px] border-t border-slate-200/60" />
        </div>
    );
}
