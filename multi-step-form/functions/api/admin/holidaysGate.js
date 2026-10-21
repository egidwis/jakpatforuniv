// Bentuk tulisan yang boleh lewat /api/admin/holidays (mode libur, sql/120).
// Satu baris = satu masa libur: `date` = tanggal WIB saat toggle dinyalakan.
// Satu tanggal per panggilan — klien mematikan beberapa baris aktif dengan
// beberapa panggilan, jadi satu body tidak pernah bisa menyentuh setahun penuh.

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
export const HOLIDAY_LABEL_MAX = 80;
export const HOLIDAY_LABEL_EN_MAX = 160;

export function isCalendarYmd(value) {
  const m = typeof value === 'string' ? YMD.exec(value) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2026 || y > 2030) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function validateHoliday(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';
  if (!isCalendarYmd(body.date)) return 'Tanggal tidak valid';
  if (typeof body.isActive !== 'boolean') return 'Status aktif wajib true/false';
  if (body.label !== undefined && typeof body.label !== 'string') return 'Label harus teks';
  if ((body.label || '').trim().length > HOLIDAY_LABEL_MAX) {
    return `Label maksimal ${HOLIDAY_LABEL_MAX} karakter`;
  }
  return null;
}

/**
 * Baris yang ditulis ke "JFU_operational_holidays".
 *
 * `label` hanya ikut bila dikirim: mematikan toggle mengirim `{date,
 * isActive: false}` saja, dan upsert merge-duplicates TIDAK boleh mengosongkan
 * pesannya. `labelEn` (terjemahan server) hanya ikut bila diberikan.
 */
export function holidayRow(body, email, nowIso, labelEn) {
  const row = {
    holiday_date: body.date,
    is_active: body.isActive,
    updated_at: nowIso,
    updated_by: email,
  };
  if (body.label !== undefined) row.label = (body.label || '').trim();
  if (labelEn !== undefined) row.label_en = labelEn;
  return row;
}
