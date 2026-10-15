const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AIRING = new Set(['scheduled', 'live', 'completed']);

function money(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
}

export function validateAiringWrite(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';

  if (body.action === 'submission-status') {
    if (typeof body.submissionId !== 'string' || !UUID.test(body.submissionId)) return 'Order tidak diizinkan';
    if (!AIRING.has(body.status)) return 'Status tayang tidak diizinkan';
    return null;
  }

  if (body.action === 'extension-bill') {
    if (typeof body.sourceId !== 'string' || !UUID.test(body.sourceId)) return 'Jadwal tidak diizinkan';
    if (!money(body.totalCost) || !money(body.subtotal) || !money(body.ppnAmount)) return 'Nominal tidak diizinkan';
    if (typeof body.waitingPayment !== 'boolean') return 'Status tagihan tidak diizinkan';
    return null;
  }

  return 'Tindakan tidak diizinkan';
}
