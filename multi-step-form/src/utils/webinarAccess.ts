// Cermin functions/api/webinar/_access.js untuk tampilan. Penegaknya server;
// ini hanya menyembunyikan menu dan rute. Saat rilis, ubah keduanya bersamaan.
export const WEBINAR_PREVIEW_ONLY = true;
export const WEBINAR_PREVIEW_EMAILS = ['tegar@jakpat.net'];

export function webinarOpenFor(email: string | null | undefined): boolean {
    if (!WEBINAR_PREVIEW_ONLY) return true;
    const normalized = String(email || '').trim().toLowerCase();
    return normalized !== '' && WEBINAR_PREVIEW_EMAILS.includes(normalized);
}
