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

export const SELF_BOOKING_CLOSED = 'self_booking_closed';

/**
 * Tutup reservasi mandiri (sql/125). Jalur ini menulis dengan service_role,
 * jadi trigger DB `trg_01_self_booking` TIDAK menjaganya — keputusan di sini
 * satu-satunya penjaga server untuk "Kunci tanggal" Iklan.
 *
 * Order bercap (`self_booking_closed_at`) ditolak SELAMANYA, walau saklar
 * sudah dibuka lagi: tim yang menjadwalkannya, dan menawarkan kunci mandiri
 * di situ mengundang balapan slot dengan admin.
 */
export function selfBookingBlock(row, closed) {
  if (row?.self_booking_closed_at) {
    return { code: SELF_BOOKING_CLOSED, error: 'Jadwal order ini ditetapkan tim Jakpat — tunggu tagihan dari tim, atau hubungi tim lewat Chat Mimin.' };
  }
  if (closed) {
    return { code: SELF_BOOKING_CLOSED, error: 'Reservasi mandiri sedang ditutup sementara. Coba lagi nanti, atau minta tim Jakpat menjadwalkan lewat Chat Mimin.' };
  }
  return null;
}
