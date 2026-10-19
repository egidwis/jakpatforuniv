const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/;

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) return `${label} tidak diizinkan`;
  return null;
}

function dateValue(value, label) {
  if (value === null) return null;
  if (typeof value !== 'string' || !DATE.test(value)) return `${label} tidak diizinkan`;
  return null;
}

function hour(value) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 23) return 'Jam tidak diizinkan';
  return null;
}

function minute(value) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 59) return 'Menit tidak diizinkan';
  return null;
}

export function validateScheduleWrite(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';

  if (body.action === 'submission-dates') {
    const id = uuid(body.submissionId, 'Order');
    if (id) return id;
    if (body.startDate === undefined && body.endDate === undefined) return 'Tanggal tidak diizinkan';
    if (body.startDate !== undefined) {
      const bad = dateValue(body.startDate, 'Tanggal mulai');
      if (bad) return bad;
    }
    if (body.endDate !== undefined) {
      const bad = dateValue(body.endDate, 'Tanggal selesai');
      if (bad) return bad;
    }
    if (body.hour !== undefined) {
      const bad = hour(body.hour);
      if (bad) return bad;
    }
    if (body.minute !== undefined) {
      const bad = minute(body.minute);
      if (bad) return bad;
    }
    return null;
  }

  if (body.action === 'extend-dates') {
    const id = uuid(body.sourceId, 'Jadwal');
    if (id) return id;
    const start = dateValue(body.startDate, 'Tanggal mulai');
    if (start) return start;
    const end = dateValue(body.endDate, 'Tanggal selesai');
    if (end) return end;
    return null;
  }

  if (body.action === 'submission-hold') return uuid(body.submissionId, 'Order');
  if (body.action === 'extend-hold') return uuid(body.sourceId, 'Jadwal');

  if (body.action === 'kilat') {
    const id = uuid(body.submissionId, 'Order');
    if (id) return id;
    const ymd = dateValue(body.ymd, 'Tanggal');
    if (ymd || body.ymd === null) return ymd || 'Tanggal tidak diizinkan';
    const bad = hour(body.hour);
    if (bad || body.hour === null) return bad || 'Jam tidak diizinkan';
    const end = dateValue(body.endYmd, 'Tanggal selesai');
    if (end) return end;
    return null;
  }

  if (body.action === 'extra-ad') {
    const id = uuid(body.scheduleId, 'Jadwal');
    if (id) return id;
    if (typeof body.isExtra !== 'boolean') return 'Kolam kuota tidak diizinkan';
    return null;
  }

  if (body.action === 'create-schedule') {
    const id = uuid(body.submissionId, 'Order');
    if (id) return id;
    const start = dateValue(body.startDate, 'Tanggal mulai');
    if (start || body.startDate === null) return start || 'Tanggal mulai tidak diizinkan';
    const end = dateValue(body.endDate, 'Tanggal selesai');
    if (end || body.endDate === null) return end || 'Tanggal selesai tidak diizinkan';
    if (!Number.isInteger(body.duration) || body.duration < 1 || body.duration > 366) return 'Durasi tidak diizinkan';
    if (!Number.isInteger(body.prizePerWinner) || body.prizePerWinner < 0) return 'Hadiah tidak diizinkan';
    if (!Number.isInteger(body.winnerCount) || body.winnerCount < 0) return 'Jumlah pemenang tidak diizinkan';
    if (!Number.isInteger(body.additionalPrize) || body.additionalPrize < 0) return 'Hadiah tidak diizinkan';
    if (typeof body.isNewBatch !== 'boolean' || typeof body.isExtra !== 'boolean') return 'Jadwal tidak diizinkan';
    return null;
  }

  return 'Tindakan tidak diizinkan';
}

export function submissionDatePatch(body) {
  const patch = { updated_at: new Date().toISOString() };
  if (body.startDate !== undefined) patch.start_date = body.startDate;
  if (body.endDate !== undefined) patch.end_date = body.endDate;
  if (body.hour !== undefined) patch.airing_hour_wib = body.hour;
  if (body.minute !== undefined) patch.airing_minute_wib = body.minute;
  return patch;
}
