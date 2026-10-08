/**
 * Gerbang tulisan pelunasan manual.
 *
 * Browser hanya boleh meminta bentuk yang sama dengan `markScheduleAsPaid` /
 * `unmarkScheduleAsPaid`. Nominal, email, dan kolom lain ditolak di sini,
 * sebelum service_role menyentuh database.
 */

const TABLES = {
  invoices: {
    columns: {
      status: ['paid', 'pending'],
      paid_at: 'timestamp',
      expires_at: 'timestamp',
    },
    requireEq: ['schedule_id', 'payment_id'],
  },
  transactions: {
    columns: {
      status: ['paid', 'pending'],
      payment_method: ['manual', null],
      payment_channel: ['MANUAL_VERIFIED', null],
    },
    requireEq: ['schedule_id', 'payment_id'],
  },
  ad_schedules: {
    columns: {
      payment_status: ['paid', 'pending'],
      status: ['scheduled', 'waiting_payment'],
    },
    requireEq: ['source_table', 'source_id'],
  },
  form_submissions: {
    columns: {
      payment_status: ['paid', 'pending'],
      submission_status: ['paid', 'waiting_payment'],
    },
    requireEq: ['id'],
  },
};

const COL = /^[a-z_]+$/;

function isIsoOrNull(value) {
  if (value === null) return true;
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateManualPaymentWrite(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';
  const spec = TABLES[body.table];
  if (!spec) return 'Tabel tidak diizinkan';

  const payload = body.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Payload kosong';
  const keys = Object.keys(payload);
  if (keys.length === 0) return 'Payload kosong';
  for (const key of keys) {
    const rule = spec.columns[key];
    if (!rule) return `Kolom ${key} tidak diizinkan`;
    const value = payload[key];
    if (rule === 'timestamp') {
      if (!isIsoOrNull(value)) return `Nilai ${key} bukan waktu`;
    } else if (!rule.includes(value)) {
      return `Nilai ${key} tidak diizinkan`;
    }
  }

  if (!Array.isArray(body.filters) || body.filters.length === 0) return 'Filter kosong';
  const eqCols = new Set();
  for (const f of body.filters) {
    if (!f || (f.op !== 'eq' && f.op !== 'in')) return 'Filter tidak diizinkan';
    if (typeof f.col !== 'string' || !COL.test(f.col)) return 'Kolom filter tidak diizinkan';
    if (f.op === 'eq') {
      if (typeof f.val !== 'string' || f.val.length === 0 || f.val.length > 200) return 'Nilai filter tidak diizinkan';
      eqCols.add(f.col);
    } else {
      if (!Array.isArray(f.val) || f.val.length === 0 || f.val.length > 8) return 'Nilai filter tidak diizinkan';
      if (f.val.some((v) => typeof v !== 'string' || v.length === 0 || v.length > 80)) {
        return 'Nilai filter tidak diizinkan';
      }
    }
  }
  for (const col of spec.requireEq) {
    if (!eqCols.has(col)) return `Filter ${col} wajib`;
  }

  const select = body.select == null ? 'id' : body.select;
  if (typeof select !== 'string' || !/^[a-z_, ]+$/.test(select)) return 'Select tidak diizinkan';

  return null;
}

export function paymentWriteQuery(filters, select) {
  const parts = filters.map((f) => {
    if (f.op === 'eq') return `${f.col}=eq.${encodeURIComponent(f.val)}`;
    return `${f.col}=in.(${f.val.map((v) => encodeURIComponent(v)).join(',')})`;
  });
  parts.push(`select=${encodeURIComponent(select || 'id')}`);
  return parts.join('&');
}
