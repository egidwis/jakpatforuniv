/**
 * Sinyal boot antara skrip inline index.html dan React.
 *
 * `window.__jfuBoot` dibuat skrip watchdog di <head> index.html. React
 * menandai `mounted` setelah commit pertama (App.tsx); watchdog memakai tanda
 * itu untuk tahu apakah JS utama sempat jalan.
 */
type BootWindow = Window & { __jfuBoot?: { mounted?: boolean } };

export function markBootMounted(w: Window = window): void {
    try {
        const boot = (w as BootWindow).__jfuBoot;
        if (boot) boot.mounted = true;
    } catch {
        /* abaikan */
    }
}

/**
 * Tampilan gagal statis untuk dipasang SETELAH React melepas pohonnya
 * (onUncaughtError). Gaya inline saja — jangan bergantung pada CSS bundel.
 */
export function staticFailureHtml(): string {
    return (
        '<div role="alert" style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif">' +
        '<img src="/favicon.webp" alt="" width="48" height="48">' +
        '<h1 style="margin:0;font-size:18px;font-weight:700;color:#0f172a">Halaman gagal dimuat</h1>' +
        '<p style="margin:0;max-width:24rem;font-size:14px;color:#475569">Koneksi sedang tidak stabil atau aplikasi baru saja diperbarui. Coba muat ulang halaman ini.</p>' +
        '<button type="button" onclick="location.reload()" style="border:0;border-radius:9999px;background:#1976D2;color:#fff;padding:10px 20px;font-size:14px;font-weight:600">Muat Ulang</button>' +
        '</div>'
    );
}
