// Bentuk tulisan yang boleh lewat /api/admin/holidays. Satu tanggal per
// panggilan: saklar di halaman Hari Libur memang menyentuh satu tanggal, dan
// batas ini menutup jalan "aktifkan setahun penuh" lewat satu body.

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
export const HOLIDAY_LABEL_MAX = 80;

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

/** Baris yang ditulis ke operational_holidays. */
export function holidayRow(body, email, nowIso) {
  return {
    holiday_date: body.date,
    label: (body.label || '').trim(),
    is_active: body.isActive,
    updated_at: nowIso,
    updated_by: email,
  };
}
