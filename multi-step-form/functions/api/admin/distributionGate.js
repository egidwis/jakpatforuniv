// "Jadikan Kilat" / "Jadikan Iklan" yang menurunkan status ke 'approved'.
//
// sql/118_review_decision_service_role menolak JWT browser Product mengubah
// submission_status ke approved|rejected|cancelled|in_review|spam. Konversi
// jalur distribusi melepas slot dan menurunkan slot_reserved/waiting_payment
// ke 'approved', jadi tulisan itu pindah ke sini.
//
// service_role melewati guard_payment_columns (sql/113), jadi syaratnya
// ditegakkan ulang di filter PATCH, bukan dipercaya dari browser:
//   * status lama hanya slot_reserved|waiting_payment (tidak pernah
//     paid|scheduled|live|completed);
//   * payment_status lama bukan paid|completed (harga beku setelah lunas).
// Bentuk tulisan dikunci di sini: kolom jadwal selalu dikosongkan dan status
// selalu 'approved'. Harga tetap dihitung klien, sama seperti tulisan harga
// order belum lunas yang masih boleh dari browser.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGETS = new Set(['regular', 'kilat']);
const PPN_PERCENT = 11;
const MAX_AMOUNT = 1_000_000_000;

export const RELEASABLE_STATUSES = ['slot_reserved', 'waiting_payment'];

const amount = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_AMOUNT;

export function validateConvertWrite(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';
  if (body.action !== 'convert-release') return 'Tindakan tidak diizinkan';
  if (typeof body.submissionId !== 'string' || !UUID.test(body.submissionId)) return 'Order tidak diizinkan';
  if (!TARGETS.has(body.target)) return 'Jalur distribusi tidak diizinkan';
  if (!amount(body.subtotal) || !amount(body.ppnAmount) || !amount(body.totalCost)) return 'Harga tidak diizinkan';
  if (body.ppnAmount !== Math.round((body.subtotal * PPN_PERCENT) / 100)) return 'PPN tidak cocok dengan subtotal';
  if (body.totalCost !== body.subtotal + body.ppnAmount) return 'Total tidak cocok dengan subtotal + PPN';
  return null;
}

export function convertPatch(body, nowIso) {
  return {
    distribution_type: body.target,
    total_cost: body.totalCost,
    subtotal: body.subtotal,
    ppn_amount: body.ppnAmount,
    start_date: null,
    end_date: null,
    kilat_slot_hour: null,
    slot_booked_by: null,
    slot_reserved_at: null,
    submission_status: 'approved',
    updated_at: nowIso,
  };
}

/** Query PATCH: baris hanya berubah bila masih memenuhi syarat di atas. */
export function convertFilterQuery(submissionId) {
  const q = new URLSearchParams();
  q.set('id', `eq.${submissionId}`);
  q.set('submission_status', `in.(${RELEASABLE_STATUSES.join(',')})`);
  q.set('or', '(payment_status.is.null,payment_status.not.in.(paid,completed))');
  q.set('select', 'id,distribution_type,submission_status,total_cost,subtotal,ppn_amount');
  return q.toString();
}
