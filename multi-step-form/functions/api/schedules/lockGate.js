const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const BOOKABLE = new Set(['approved', 'waiting_payment', 'slot_reserved']);
const AIRING_HOUR_WIB = 15;
const CUTOFF_HOUR_WIB = 13;

function realYmd(value) {
  const match = YMD.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateLock(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Body kosong';
  if (typeof body.submissionId !== 'string' || !UUID.test(body.submissionId)) return 'Order tidak diizinkan';
  if (!realYmd(body.startYmd)) return 'Tanggal tidak diizinkan';
  if (!Number.isInteger(body.duration) || body.duration < 1 || body.duration > 366) return 'Durasi tidak diizinkan';
  if ('paymentStatus' in body || 'submissionStatus' in body || 'totalCost' in body) {
    return 'Status pembayaran tidak boleh dikirim';
  }
  return null;
}

export function wibNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const hour = Number(get('hour'));
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    hour: hour === 24 ? 0 : hour,
  };
}

export function bookingClosed(ymd, now = new Date()) {
  const wib = wibNow(now);
  if (ymd < wib.ymd) return true;
  if (ymd > wib.ymd) return false;
  return wib.hour >= CUTOFF_HOUR_WIB;
}

export function lockInstants(ymd, duration) {
  const midnightUtc = Date.parse(`${ymd}T00:00:00.000Z`);
  const startMs = midnightUtc + (AIRING_HOUR_WIB * 60 - 7 * 60) * 60000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + duration * 86400000).toISOString(),
  };
}

export function lockPatch(row, body, now = new Date()) {
  if (bookingClosed(body.startYmd, now)) return { error: 'Pemesanan untuk tanggal itu sudah ditutup (batas 13.00 WIB)' };
  if (['paid', 'completed'].includes(row.payment_status || '')) {
    return { error: 'Slot tidak bisa dikunci — kemungkinan sudah lunas, atau jadwalnya dibatalkan tim Jakpat.' };
  }
  if (!BOOKABLE.has(row.submission_status || '')) {
    return { error: 'Slot tidak bisa dikunci — kemungkinan sudah lunas, atau jadwalnya dibatalkan tim Jakpat.' };
  }
  const stored = Number(row.duration);
  const duration = Number.isInteger(stored) && stored >= 1 && stored <= 366 ? stored : body.duration;
  const instants = lockInstants(body.startYmd, duration);
  return {
    patch: {
      start_date: instants.start,
      end_date: instants.end,
      slot_booked_by: 'user',
      slot_reserved_at: now.toISOString(),
      submission_status: 'waiting_payment',
      payment_status: 'pending',
      updated_at: now.toISOString(),
    },
  };
}

/*
  Satu pintu jadwal peneliti (sql/123). `action` kosong = `lock`, supaya
  klien lama (sebelum Push A) tetap jalan. Aturan tanggal Kilat, perpanjangan,
  lepas, dan batal TIDAK ada di sini — fungsi door_* menilainya di DB dengan
  klaim peneliti. Gerbang ini hanya memeriksa bentuk.
*/
const ACTIONS = new Set(['lock', 'extend', 'release', 'cancel']);
const KILAT_HOURS = new Set([11, 15]);
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function instant(value) {
  return typeof value === 'string' && INSTANT.test(value) && Number.isFinite(Date.parse(value));
}

function count(value) {
  return Number.isInteger(value) && value >= 0;
}

export function actionOf(body) {
  return body?.action === undefined ? 'lock' : body.action;
}

export function validateAction(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Body kosong';
  const action = actionOf(body);
  if (!ACTIONS.has(action)) return 'Tindakan tidak diizinkan';
  if ('paymentStatus' in body || 'submissionStatus' in body || 'totalCost' in body) {
    return 'Status pembayaran tidak boleh dikirim';
  }
  if (typeof body.submissionId !== 'string' || !UUID.test(body.submissionId)) return 'Order tidak diizinkan';

  if (action === 'lock') {
    const invalid = validateLock(body);
    if (invalid) return invalid;
    if ('kilatHour' in body && !KILAT_HOURS.has(body.kilatHour)) return 'Gelombang tidak diizinkan';
    return null;
  }
  if (action === 'extend') {
    if (!instant(body.startDate) || !instant(body.endDate)) return 'Tanggal tidak diizinkan';
    if (Date.parse(body.endDate) <= Date.parse(body.startDate)) return 'Tanggal tidak diizinkan';
    if (!Number.isInteger(body.duration) || body.duration < 1 || body.duration > 366) return 'Durasi tidak diizinkan';
    if (!count(body.prizePerWinner) || !count(body.winnerCount)) return 'Hadiah tidak diizinkan';
    if (typeof body.isNewPeriod !== 'boolean') return 'Batch hadiah tidak diizinkan';
    return null;
  }
  if (action === 'cancel') {
    if (typeof body.sourceId !== 'string' || !UUID.test(body.sourceId)) return 'Jadwal tidak diizinkan';
    if (typeof body.isExtension !== 'boolean') return 'Jadwal tidak diizinkan';
    return null;
  }
  return null;
}

/*
  Bentuk kunci HARUS cocok dengan produknya. Kilat lewat PATCH service role
  (bentuk Iklan) melompati validate_kilat_wave_claim — jam 11/15, hari kerja,
  libur, 3 hari kerja, H-2 jam — karena trigger itu mempercayai service_role.
*/
export function lockRoute(row, body) {
  const kilat = row?.distribution_type === 'kilat';
  const hasHour = body?.kilatHour !== undefined;
  if (kilat && !hasHour) return { error: 'Order Kilat dikunci per gelombang — pilih jam gelombangnya dulu.' };
  if (!kilat && hasHour) return { error: 'Order ini bukan Kilat, jadi tidak punya gelombang.' };
  return { kind: kilat ? 'kilat' : 'iklan' };
}

/** Argumen RPC door_* — identitas dari /auth/v1/user, bukan dari body. */
export function doorCall(action, user, body) {
  const actor = { p_actor: user.id, p_email: user.email, p_submission_id: body.submissionId };
  if (action === 'lock') {
    return { fn: 'door_lock_kilat_wave', args: { ...actor, p_ymd: body.startYmd, p_hour: body.kilatHour } };
  }
  if (action === 'extend') {
    return {
      fn: 'door_create_extension',
      args: {
        ...actor,
        p_start_date: body.startDate,
        p_end_date: body.endDate,
        p_duration: body.duration,
        p_prize_per_winner: body.prizePerWinner,
        p_winner_count: body.winnerCount,
        p_additional_prize_per_winner: 0,
        p_is_new_period: body.isNewPeriod,
      },
    };
  }
  if (action === 'release') return { fn: 'door_release_slot', args: actor };
  return {
    fn: 'door_cancel_schedule',
    args: { ...actor, p_source_id: body.sourceId, p_is_extension: body.isExtension },
  };
}
