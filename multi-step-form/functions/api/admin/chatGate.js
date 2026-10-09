/**
 * Gerbang tulisan admin chat.
 *
 * Hanya tiga aksi: balas sebagai admin, ambil alih / kembalikan ke Mimin,
 * dan tandai sesi selesai. Email pengirim diambil dari JWT di function,
 * bukan dari body.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateAdminChat(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';
  if (typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)) return 'Sesi tidak diizinkan';

  if (body.action === 'reply') {
    if (typeof body.content !== 'string') return 'Pesan kosong';
    const text = body.content.trim();
    if (!text || text.length > 4000) return 'Pesan kosong atau terlalu panjang';
    return null;
  }

  if (body.action === 'mode') {
    if (body.mode !== 'ai' && body.mode !== 'human') return 'Mode tidak diizinkan';
    return null;
  }

  if (body.action === 'resolve') {
    if (typeof body.isResolved !== 'boolean') return 'Status selesai tidak diizinkan';
    return null;
  }

  return 'Aksi tidak diizinkan';
}
