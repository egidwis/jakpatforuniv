const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES = ['stop_aired', 'cancel_before_air'];

export function validateStopCredit(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';
  if (typeof body.scheduleId !== 'string' || !UUID.test(body.scheduleId)) {
    return 'Jadwal tidak diizinkan';
  }
  if (!MODES.includes(body.mode)) return 'Mode tidak diizinkan';
  return null;
}
