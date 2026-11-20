/**
 * Banner kartu /pages lewat Cloudflare Images Transformations — format URL
 * `/cdn-cgi/image/<opsi>/<sumber>` (Fase 3, 20 Nov 2026).
 *
 * Banner asli = JPEG 1280 px, 112–127 KB, padahal di ponsel tampil ±358 px.
 * Cloudflare memperkecil & memilih AVIF/WebP sesuai browser (`format=auto`).
 * `cf.image` di Pages Functions TIDAK dipakai: tidak terbukti jalan (laporan
 * komunitas, bahkan di domain kustom), sedangkan format URL resmi bisa dicek
 * dengan curl.
 *
 * Syarat: Images → Transformations aktif di zona. Bila belum aktif atau kuota
 * gratis (5.000 transformasi unik/bulan) habis: `onerror=redirect` mengirim
 * berkas asli, dan kartu jatuh ke `/cdn/` asli lewat nextBannerStage.
 *
 * Hanya path same-origin `/cdn/…` (keluaran getCdnUrl). Feed aplikasi
 * (/api/surveys), hero /pages/<slug>, dan berkas unggahan TIDAK berubah.
 */
export const BANNER_WIDTHS = [480, 800, 1200] as const;

/** Lebar slot kartu: grid 1 kolom (ponsel), 2 (md), 3 (lg ±380 px). */
export const BANNER_SIZES = '(min-width: 1024px) 380px, (min-width: 768px) 50vw, 100vw';

const OPTIONS = 'fit=scale-down,format=auto,onerror=redirect';

const transformed = (cdnPath: string, width: number) => `/cdn-cgi/image/width=${width},${OPTIONS}${cdnPath}`;

export type BannerSources = { src: string; srcSet: string; sizes: string };

/** `null` = bukan path /cdn/ → <img src> biasa (perilaku lama). */
export function bannerSources(cdnUrl: string | null | undefined): BannerSources | null {
    if (!cdnUrl || !cdnUrl.startsWith('/cdn/')) return null;
    return {
        src: transformed(cdnUrl, 800),
        srcSet: BANNER_WIDTHS.map((w) => `${transformed(cdnUrl, w)} ${w}w`).join(', '),
        sizes: BANNER_SIZES,
    };
}

/** Tahap banner saat gagal dimuat: Transformations → /cdn/ asli → panel merek. */
export type BannerStage = 'cf' | 'plain' | 'failed';

export function nextBannerStage(stage: BannerStage): BannerStage {
    return stage === 'cf' ? 'plain' : 'failed';
}
