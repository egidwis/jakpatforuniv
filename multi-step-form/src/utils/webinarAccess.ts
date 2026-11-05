// Cermin functions/api/webinar/_access.js untuk tampilan. Penegaknya server;
// ini hanya menyembunyikan menu dan rute. Saat rilis, ubah keduanya bersamaan.
export const WEBINAR_PREVIEW_ONLY = true;
export const WEBINAR_PREVIEW_EMAILS = ['tegar@jakpat.net'];

// Uji lokal: build `npm run dev:full` memakai mode 'localtest'. Masa uji hanya
// terbuka bila mode itu DAN halaman dibuka di localhost. Build produksi selalu
// mode 'production', jadi cabang ini tidak pernah aktif di sana.
export function webinarLocalOpen(
    mode: string | undefined = import.meta.env?.MODE,
    hostname: string | undefined = typeof window !== 'undefined' ? window.location.hostname : undefined,
): boolean {
    return mode === 'localtest' && (hostname === 'localhost' || hostname === '127.0.0.1');
}

export function webinarOpenFor(email: string | null | undefined): boolean {
    if (!WEBINAR_PREVIEW_ONLY || webinarLocalOpen()) return true;
    const normalized = String(email || '').trim().toLowerCase();
    return normalized !== '' && WEBINAR_PREVIEW_EMAILS.includes(normalized);
}
