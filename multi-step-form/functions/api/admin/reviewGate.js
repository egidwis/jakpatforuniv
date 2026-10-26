const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVIEW = new Set(['approved', 'rejected', 'cancelled', 'in_review', 'spam']);

function historyEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'Riwayat review tidak diizinkan';
  if (entry.action !== undefined && (typeof entry.action !== 'string' || entry.action.length > 40)) {
    return 'Riwayat review tidak diizinkan';
  }
  if (entry.actor !== undefined && (typeof entry.actor !== 'string' || entry.actor.length > 40)) {
    return 'Riwayat review tidak diizinkan';
  }
  if (entry.notes !== undefined && (typeof entry.notes !== 'string' || entry.notes.length > 4000)) {
    return 'Riwayat review tidak diizinkan';
  }
  if (entry.timestamp !== undefined && (typeof entry.timestamp !== 'string' || entry.timestamp.length > 40)) {
    return 'Riwayat review tidak diizinkan';
  }
  return null;
}

export function validateReviewWrite(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';
  if (body.action !== 'decision') return 'Tindakan tidak diizinkan';
  if (typeof body.submissionId !== 'string' || !UUID.test(body.submissionId)) return 'Order tidak diizinkan';
  if (!REVIEW.has(body.status)) return 'Status review tidak diizinkan';
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 4000)) {
    return 'Catatan tidak diizinkan';
  }
  if (body.reviewHistory !== undefined) {
    if (!Array.isArray(body.reviewHistory) || body.reviewHistory.length > 200) return 'Riwayat review tidak diizinkan';
    for (const entry of body.reviewHistory) {
      const invalid = historyEntry(entry);
      if (invalid) return invalid;
    }
  }
  return null;
}

export function reviewPatch(body) {
  const patch = { submission_status: body.status };
  if (body.notes !== undefined) patch.admin_notes = body.notes;
  if (body.reviewHistory !== undefined) {
    patch.review_history = body.reviewHistory.map((entry) => {
      const copy = {};
      if (entry.action !== undefined) copy.action = entry.action;
      if (entry.actor !== undefined) copy.actor = entry.actor;
      if (entry.notes !== undefined) copy.notes = entry.notes;
      if (entry.timestamp !== undefined) copy.timestamp = entry.timestamp;
      return copy;
    });
  }
  return patch;
}

/*
  Keputusan yang MENGAKHIRI order. Order yang sudah punya uang lunas tidak
  boleh diakhiri: membatalkannya berarti refund, dan fitur refund belum ada.
  UI admin sudah mengunci tombolnya (isReviewDecisionLocked), tapi endpoint
  ini menulis dengan service_role — tidak ada trigger form_submissions yang
  menolak — jadi syaratnya ditegakkan DI SINI. Status lunas sama dengan
  door_cancel_order (sql/128); 6 order lunas-tapi-batal di prod lahir dari
  triase sql/69 (25 Agu 2026), bukan dari endpoint ini.
*/
export const ENDING_REVIEW = new Set(['cancelled', 'spam', 'rejected']);

const PAID_MONEY = 'paid,completed,settled';
const COMMITTED_LIFECYCLE = new Set(['paid', 'scheduled', 'live', 'completed']);

export function paidCheckPaths(id) {
  return {
    order: `form_submissions?id=eq.${id}&select=payment_status,submission_status`,
    tx: `transactions?form_submission_id=eq.${id}&status=in.(${PAID_MONEY})&select=id&limit=1`,
    inv: `invoices?form_submission_id=eq.${id}&status=in.(${PAID_MONEY})&select=id&limit=1`,
    // Semua jadwal order ini, termasuk perpanjangan / gelombang tambahan.
    sched: `ad_schedules?submission_id=eq.${id}&payment_status=in.(paid,completed)&select=id&limit=1`,
  };
}

/** `null` = boleh diakhiri; selain itu pesan penolakan untuk admin. */
export function paidBlockReason({ order, tx, inv, sched }) {
  const payment = String(order?.payment_status || '').toLowerCase();
  const lifecycle = String(order?.submission_status || '').toLowerCase();
  if (['paid', 'completed'].includes(payment) || tx.length > 0 || inv.length > 0 || sched.length > 0) {
    return 'Order ini sudah punya pembayaran lunas — tidak bisa dibatalkan (belum ada refund).';
  }
  if (COMMITTED_LIFECYCLE.has(lifecycle)) {
    return 'Order ini sudah dijadwalkan tayang — hentikan lewat tab Jadwal & Bayar, bukan keputusan review.';
  }
  return null;
}
