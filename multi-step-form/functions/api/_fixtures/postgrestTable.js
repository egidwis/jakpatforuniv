// KHUSUS TES. Satu tabel di memori yang menjawab seperti PostgREST, sebatas sintaks
// yang dipakai kode kita: filter `kolom=op.nilai` (eq, neq, lt, gt, lte, gte, is),
// `or=(kolom.op.nilai,…)`, dan `select=a,b`.
//
// Kenapa ada: mock lama menjawab baris untuk PATCH apa pun, jadi tes hijau sementara
// produksi gagal diam-diam (insiden e-tiket webinar 3 & 5 Nov 2026). Emulator ini
// meniru perilaku yang TERBUKTI dari log produksi: PATCH dengan `or=` dan
// `Prefer: return=representation` hanya mengembalikan baris yang MASIH lolos `or`
// sesudah diubah, sehingga klaim yang mengubah kolom `or`-nya sendiri dibalas `[]`
// walau barisnya berubah. Filter kolom biasa tidak diterapkan ulang.

const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:?\d{2})$/;

/** Waktu dalam mikrodetik, atau null bila bukan timestamp ISO. */
function micros(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(TIMESTAMP_RE);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}${m[3]}`);
  if (Number.isNaN(ms)) return null;
  return ms * 1000 + Number((m[2] || '').padEnd(6, '0'));
}

function compare(rowValue, op, raw) {
  if (op === 'is') {
    if (raw === 'null') return rowValue === null || rowValue === undefined;
    if (raw === 'true') return rowValue === true;
    if (raw === 'false') return rowValue === false;
    throw new Error(`postgrestTable: is.${raw} tidak didukung`);
  }
  // Semantik SQL: perbandingan apa pun dengan NULL tidak benar.
  if (rowValue === null || rowValue === undefined) return false;

  let a;
  let b;
  const ta = micros(rowValue);
  const tb = micros(raw);
  if (ta !== null && tb !== null) {
    a = ta;
    b = tb;
  } else if (typeof rowValue === 'number') {
    a = rowValue;
    b = Number(raw);
  } else if (typeof rowValue === 'boolean') {
    a = String(rowValue);
    b = raw;
  } else {
    a = String(rowValue);
    b = raw;
  }

  switch (op) {
    case 'eq': return a === b;
    case 'neq': return a !== b;
    case 'lt': return a < b;
    case 'gt': return a > b;
    case 'lte': return a <= b;
    case 'gte': return a >= b;
    default: throw new Error(`postgrestTable: operator ${op} tidak didukung`);
  }
}

/** `kolom.op.nilai` → { column, op, value }; nilai boleh memuat titik (timestamp). */
function parseCondition(text) {
  const first = text.indexOf('.');
  const second = text.indexOf('.', first + 1);
  if (first < 0 || second < 0) throw new Error(`postgrestTable: kondisi "${text}" tidak dikenali`);
  return { column: text.slice(0, first), op: text.slice(first + 1, second), value: text.slice(second + 1) };
}

function parseQuery(url) {
  const params = new URL(url).searchParams;
  const filters = [];
  let or = null;
  let select = null;
  for (const [key, value] of params.entries()) {
    if (key === 'select') select = value;
    else if (key === 'or') {
      const inner = value.replace(/^\(/, '').replace(/\)$/, '');
      or = inner.split(',').map(parseCondition);
    } else if (key === 'order' || key === 'limit' || key === 'offset') {
      // Tidak memengaruhi tes yang memakai emulator ini.
    } else {
      const dot = value.indexOf('.');
      filters.push({ column: key, op: value.slice(0, dot), value: value.slice(dot + 1) });
    }
  }
  return { filters, or, select };
}

const passesFilters = (row, filters) => filters.every((f) => compare(row[f.column], f.op, f.value));
const passesOr = (row, or) => !or || or.some((c) => compare(row[c.column], c.op, c.value));

function project(row, select) {
  if (!select || select === '*') return { ...row };
  const out = {};
  for (const column of select.split(',')) {
    if (column.includes('(')) throw new Error(`postgrestTable: embed "${column}" tidak didukung`);
    out[column] = row[column] ?? null;
  }
  return out;
}

function preferOf(init) {
  const headers = new Headers(init?.headers || {});
  return headers.get('Prefer') || '';
}

const respondRows = (rows) => new Response(JSON.stringify(rows), {
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    'Content-Range': rows.length ? `0-${rows.length - 1}/*` : '*/*',
  },
});

/**
 * @param {object[]} seed baris awal (disalin)
 * @returns {{ rows: object[], respond: (url: string, init?: RequestInit) => Response }}
 */
export function postgrestTable(seed = []) {
  const rows = seed.map((row) => ({ ...row }));

  function respond(url, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const { filters, or, select } = parseQuery(url);
    const matched = rows.filter((row) => passesFilters(row, filters) && passesOr(row, or));

    if (method === 'GET') return respondRows(matched.map((row) => project(row, select)));

    if (method === 'PATCH') {
      const patch = init.body ? JSON.parse(init.body) : {};
      for (const row of matched) Object.assign(row, patch);
      if (!preferOf(init).includes('return=representation')) {
        return new Response(null, { status: 204, headers: { 'Content-Range': '*/*' } });
      }
      // Perilaku produksi 5 Nov: filter logika diterapkan ulang ke baris yang dikembalikan.
      return respondRows(matched.filter((row) => passesOr(row, or)).map((row) => project(row, select)));
    }

    throw new Error(`postgrestTable: metode ${method} tidak didukung`);
  }

  return { rows, respond };
}
