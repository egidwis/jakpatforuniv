const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateMarkOnCredit(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';
  if (!Array.isArray(body.scheduleIds) || body.scheduleIds.length === 0 || body.scheduleIds.length > 50) {
    return 'Daftar jadwal tidak diizinkan';
  }
  if (body.scheduleIds.some((id) => typeof id !== 'string' || !UUID.test(id))) {
    return 'Daftar jadwal tidak diizinkan';
  }
  if (body.note != null && (typeof body.note !== 'string' || body.note.length > 500)) {
    return 'Catatan tidak diizinkan';
  }
  return null;
}
