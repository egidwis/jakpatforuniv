import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Jaring terakhir untuk rute lazy yang tetap gagal dimuat setelah satu kali
 * reload otomatis (lihat utils/lazyRoute.ts) — biasanya koneksi putus. Tanpa
 * ini React melepas seluruh pohon dan pengguna melihat layar putih.
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown, info: ErrorInfo) {
        console.error('[RouteErrorBoundary]', error, info.componentStack);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-[#f8fafc]">
                <img src="/favicon.webp" alt="" width={48} height={48} className="h-12 w-12" />
                <h1 className="text-lg font-bold text-slate-900">Halaman gagal dimuat</h1>
                <p className="max-w-sm text-sm text-slate-600">
                    Koneksi sedang tidak stabil atau aplikasi baru saja diperbarui. Coba muat ulang halaman ini.
                </p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-full bg-[#1976D2] px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976D2]"
                >
                    Muat Ulang
                </button>
            </div>
        );
    }
}
