import './AmbientBackdrop.css';

export type AmbientVariant = 'login' | 'dashboard' | 'pages';

/**
 * Pendaran latar (biru Jakpat, sky, rose) di belakang halaman login, dashboard,
 * dan /pages. SATU elemen tetap ber-radial-gradient — lihat AmbientBackdrop.css
 * untuk alasan kenapa bukan lingkaran ber-blur lagi (layar putih di iPhone).
 */
export function AmbientBackdrop({ variant }: { variant: AmbientVariant }) {
    return <div aria-hidden="true" className={`fixed inset-0 pointer-events-none z-0 select-none jfu-aura--${variant}`} />;
}
