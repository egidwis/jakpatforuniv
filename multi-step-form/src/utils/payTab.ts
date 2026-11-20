/**
 * Bayar di tab yang SAMA? Ya untuk ponsel/tablet (keputusan 20 Nov 2026), tab baru
 * untuk desktop. Di iPhone, tab `about:blank` yang dibuka sebelum `await` langsung
 * jadi tab aktif: bila apa pun tertunda, pembeli menatap halaman PUTIH, dan refresh
 * tetap putih. DOKU mengembalikan pembeli ke halaman kita (webinar:
 * /dashboard/webinar/tiket/<id>; iklan: /payment-success), jadi alur di tab yang
 * sama tetap utuh. Dipakai WebinarCheckoutPage & JadwalDanBayarPage.
 *
 * `maxTouchPoints > 1` menangkap iPad yang mengaku "Macintosh" (juga laptop layar
 * sentuh — diterima, tab sama tetap berfungsi).
 */
export function payInSameTab(env: { hoverNone: boolean; coarsePointer: boolean; maxTouchPoints: number }): boolean {
    return (env.hoverNone && env.coarsePointer) || env.maxTouchPoints > 1;
}

/** `payInSameTab` untuk browser ini. Tidak pernah melempar; gagal membaca = desktop (tab baru). */
export function payInSameTabNow(win: Window = window): boolean {
    try {
        const mm = typeof win.matchMedia === 'function' ? (q: string) => win.matchMedia(q).matches : () => false;
        return payInSameTab({
            hoverNone: mm('(hover: none)'),
            coarsePointer: mm('(pointer: coarse)'),
            maxTouchPoints: win.navigator?.maxTouchPoints ?? 0,
        });
    } catch {
        return false;
    }
}
