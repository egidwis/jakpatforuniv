// Bentuk tulisan yang boleh lewat /api/admin/self-booking (tutup reservasi
// mandiri, sql/125). Satu baris = satu masa tutup: `date` = tanggal WIB saat
// saklar dinyalakan. Aturannya kembar dengan mode libur (holidaysGate.js).

import { isCalendarYmd, HOLIDAY_LABEL_MAX } from './holidaysGate.js';

export const SELF_BOOKING_LABEL_MAX = HOLIDAY_LABEL_MAX;

export function validateSelfBooking(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';
  if (!isCalendarYmd(body.date)) return 'Tanggal tidak valid';
  if (typeof body.isActive !== 'boolean') return 'Status aktif wajib true/false';
  if (body.label !== undefined && typeof body.label !== 'string') return 'Label harus teks';
  if ((body.label || '').trim().length > SELF_BOOKING_LABEL_MAX) {
    return `Label maksimal ${SELF_BOOKING_LABEL_MAX} karakter`;
  }
  return null;
}

/**
 * Baris yang ditulis ke "JFU_self_booking_closures".
 *
 * `label` hanya ikut bila dikirim: membuka saklar mengirim `{date, isActive:
 * false}` saja, dan upsert merge-duplicates TIDAK boleh mengosongkan pesannya.
 * `labelEn` (terjemahan server) hanya ikut bila diberikan.
 */
export function selfBookingRow(body, email, nowIso, labelEn) {
  const row = {
    closed_on: body.date,
    is_active: body.isActive,
    updated_at: nowIso,
    updated_by: email,
  };
  if (body.label !== undefined) row.label = (body.label || '').trim();
  if (labelEn !== undefined) row.label_en = labelEn;
  return row;
}
