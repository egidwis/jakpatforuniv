// SATU sumber isi tampilan webinar. Halaman publik memanggil modul ini langsung,
// dashboard dan homepage menerima hasilnya dari /api/webinar/events. Aturan
// keadaan penjualan sendiri tetap milik webinar_offer_state (sql/131); modul ini
// hanya menerjemahkannya menjadi kalimat dan urutan.
//
// Teks di sini dilihat pembeli: jangan menyebut refund. Dikunci webinarView.spec.js.

export const SITE_URL = 'https://submit.jakpatforuniv.com';
export const ADMIN_CONTACT = 'product@jakpat.net';
export const SEATS_VISIBLE_AT = 20;

// meeting_url dan preview_token sengaja tidak ada di sini, karena daftar ini juga
// dipakai untuk kolom yang keluar ke publik.
export const PUBLIC_EVENT_COLUMNS = [
  'id', 'slug', 'title', 'summary', 'description_blocks', 'speakers', 'poster_url',
  'starts_at', 'duration_minutes', 'price', 'status', 'offer_kind', 'sales_mode',
  'is_listed', 'is_test', 'recording_minutes', 'recording_published_at',
  'webinar_offer_state',
].join(',');

const WIB = { timeZone: 'Asia/Jakarta' };

/** Ruang gabung dibuka 30 menit sebelum acara dan tutup saat acara selesai. */
export const JOIN_OPENS_MINUTES = 30;

/**
 * Satu aturan jendela gabung untuk link gabung (redirect) dan halaman tiket (hitung mundur).
 * @returns {{ phase: 'before'|'open'|'after', opensAt: number, closesAt: number } | null}
 */
export function joinWindow(event, now = Date.now()) {
  if (!event?.starts_at) return null;
  const start = new Date(event.starts_at).getTime();
  const opensAt = start - JOIN_OPENS_MINUTES * 60_000;
  const closesAt = start + (Number(event.duration_minutes) || 0) * 60_000;
  const phase = now < opensAt ? 'before' : now < closesAt ? 'open' : 'after';
  return { phase, opensAt, closesAt };
}

export function formatPrice(price) {
  return `Rp ${Number(price).toLocaleString('id-ID')}`;
}

export function formatDateWib(iso) {
  return new Date(iso).toLocaleDateString('id-ID', { ...WIB, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatShortDateWib(iso) {
  return new Date(iso).toLocaleDateString('id-ID', { ...WIB, day: 'numeric', month: 'short' });
}

export function formatTimeWib(iso) {
  return new Date(iso).toLocaleTimeString('id-ID', { ...WIB, hour: '2-digit', minute: '2-digit' });
}

function scheduleLabel(event) {
  if (!event.starts_at) return null;
  const start = formatTimeWib(event.starts_at);
  const end = event.duration_minutes
    ? `–${formatTimeWib(new Date(new Date(event.starts_at).getTime() + event.duration_minutes * 60_000).toISOString())}`
    : '';
  return `${formatDateWib(event.starts_at)} · ${start}${end} WIB`;
}

const BENEFITS = {
  live: ['Sesi live via Zoom', 'Materi PPT', 'Rekaman video webinar'],
  replay: ['Rekaman video webinar', 'Materi PPT'],
};

const BUY_LABEL = { live: 'Beli tiket', replay: 'Beli rekaman' };

function stateCopy(state, offer) {
  const opens = offer.opens_at
    ? `${formatShortDateWib(offer.opens_at)}, ${formatTimeWib(offer.opens_at)} WIB`
    : null;
  switch (state) {
    case 'on_sale':
      return { badge: 'Dijual', tone: 'on_sale', note: null };
    case 'coming_soon':
      return { badge: 'Segera hadir', tone: 'soon', note: opens ? `Dibuka ${opens}` : null };
    case 'seats_held':
      return { badge: 'Kursi ditahan', tone: 'held', note: 'Kursi sedang ditahan pembeli lain, coba lagi beberapa menit.' };
    case 'sold_out':
      return { badge: 'Habis', tone: 'ended', note: 'Kursi live habis. Rekaman bisa dibeli setelah acara.' };
    case 'closed':
    case 'sales_ended':
      return { badge: 'Ditutup', tone: 'ended', note: 'Penjualan ditutup.' };
    case 'cancelled':
      return { badge: 'Batal', tone: 'ended', note: `Acara dibatalkan. Ada pertanyaan? Hubungi ${ADMIN_CONTACT}.` };
    default:
      return { badge: 'Draft', tone: 'ended', note: null };
  }
}

/** Mengubah baris webinar_events + webinar_offer_state menjadi isi tampilan. */
export function buildEventView(event) {
  const offer = event.webinar_offer_state || {};
  const state = offer.state || 'draft';
  const copy = stateCopy(state, offer);
  const seatsLeft = typeof offer.seats_left === 'number' ? offer.seats_left : null;

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    summary: event.summary ?? null,
    poster_url: event.poster_url ?? null,
    speakers: Array.isArray(event.speakers) ? event.speakers : [],
    kind: event.offer_kind,
    state,
    badge: copy.badge,
    tone: copy.tone,
    note: copy.note,
    can_buy: state === 'on_sale',
    buy_label: BUY_LABEL[event.offer_kind] ?? BUY_LABEL.live,
    buy_url: `${SITE_URL}/dashboard/webinar/beli/${event.slug}`,
    detail_url: `/webinar/${event.slug}`,
    price_label: event.price != null ? formatPrice(event.price) : null,
    schedule_label: scheduleLabel(event),
    short_date: event.starts_at ? formatShortDateWib(event.starts_at) : null,
    starts_at: event.starts_at ?? null,
    duration_minutes: event.duration_minutes ?? null,
    recording_minutes: event.recording_minutes ?? null,
    recording_published_at: event.recording_published_at ?? null,
    seconds_until_open: offer.seconds_until_open ?? null,
    seats_label: state === 'on_sale' && seatsLeft !== null && seatsLeft <= SEATS_VISIBLE_AT
      ? `Sisa ${seatsLeft} kursi`
      : null,
    benefits: BENEFITS[event.offer_kind] ?? BENEFITS.live,
  };
}

const byStart = (a, b) => new Date(a.starts_at) - new Date(b.starts_at);
const byNewestRecording = (a, b) => new Date(b.recording_published_at ?? 0) - new Date(a.recording_published_at ?? 0);

const isLiveIn = (states) => (v) => v.kind === 'live' && states.includes(v.state);

/**
 * Isi /webinar. Baris tidak terdaftar, batal, atau sudah tutup tidak masuk, tetapi
 * URL detailnya tetap hidup.
 *
 * @param {object[]} rows baris webinar_events + webinar_offer_state
 */
export function buildListing(rows) {
  const views = rows
    .filter((row) => row.is_listed && row.status === 'published')
    .map(buildEventView);

  const onSale = views.filter(isLiveIn(['on_sale', 'seats_held'])).sort(byStart);
  const soldOut = views.filter(isLiveIn(['sold_out'])).sort(byStart);
  const soon = views.filter(isLiveIn(['coming_soon'])).sort(byStart);
  const videos = views
    .filter((v) => v.kind === 'replay' && ['on_sale', 'coming_soon'].includes(v.state))
    .sort(byNewestRecording);

  const ordered = [...onSale, ...soldOut, ...soon, ...videos];
  const hero = ordered[0] ?? null;
  const others = (list) => list.filter((v) => v !== hero);

  return {
    hero,
    upcoming: others([...onSale, ...soldOut, ...soon]),
    videos: others(videos),
    // Homepage hanya tiket mendatang.
    homepage: [...onSale, ...soldOut, ...soon].slice(0, 2),
    // Baris di beranda dashboard hanya untuk yang benar-benar bisa dibeli.
    dashboard_row: ordered.find((v) => v.can_buy) ?? null,
  };
}

export const EMPTY_LISTING_TEXT = 'Webinar berikutnya sedang disiapkan. Cek lagi nanti ya.';
