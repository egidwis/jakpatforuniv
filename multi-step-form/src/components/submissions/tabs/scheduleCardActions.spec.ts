import { describe, it, expect } from 'vitest';
import {
  planCardActions, cardStateOf, isLateForSchedule, isEntryHoldLapsed, lapseKindOf, cardMoneyOf, orderMoneyOf,
  type CardState,
} from './scheduleCardActions';
import type { AdScheduleEntry, ScheduleBilling, ScheduleInvoice } from '@/utils/supabase';

const entry = (o: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 's1', submissionId: 'o1', ordinal: 1, isExtension: false, bookingId: 'AAAA1111',
  sourceId: 'o1', startDate: '2026-09-10T08:00:00Z', endDate: '2026-09-11T08:00:00Z',
  duration: 1, status: 'waiting_payment', reviewStatus: 'approved', paymentStatus: 'pending',
  distributionType: 'regular', kilatSlotHour: null, totalCost: 233100, subtotal: 210000,
  ppnAmount: 23100, voucherCode: null, prizePerWinner: 30000, winnerCount: 2,
  additionalPrizePerWinner: 0, isNewPeriod: false, periodBatch: null, createdAt: null,
  slotBookedBy: 'admin', slotReservedAt: null, title: 'T', researcherName: 'R',
  ...o,
} as unknown as AdScheduleEntry);

const billing = (o: Partial<ScheduleBilling> = {}): ScheduleBilling => ({
  invoices: [], billed: 0, paid: 0, outstanding: 0, isSettled: false,
  openInvoice: null, paymentChannel: null, ...o,
} as unknown as ScheduleBilling);

const ALL: NonNullable<Parameters<typeof planCardActions>[0]['can']> = {
  markPaid: true, unmarkPaid: true, cancelSchedule: true, createInvoice: true,
};

const plan = (state: CardState, o: Partial<Parameters<typeof planCardActions>[0]> = {}) =>
  planCardActions({ state, entry: entry(), billing: billing(), isLate: false, can: ALL, ...o });

const STATES: CardState[] = [
  'awaiting_review', 'cancelled', 'choose_schedule', 'awaiting_invoice',
  'hold_lapsed', 'waiting_payment', 'partially_paid', 'paid',
];

describe('planCardActions — bentuk yang ditegakkan', () => {
  it('TIDAK PERNAH lebih dari satu aksi utama, di kondisi mana pun', () => {
    // Inilah alasan modul ini ada: dulu `waiting_payment` menampilkan 6 kontrol.
    for (const s of STATES) {
      const p = plan(s);
      expect(Array.isArray(p.menu)).toBe(true);
      expect(p.primary === null || typeof p.primary.label === 'string').toBe(true);
    }
  });

  it('aksi merusak selalu di DASAR menu, tidak pernah di tengah', () => {
    for (const s of STATES) {
      const idx = plan(s).menu.findIndex((a) => a.destructive);
      if (idx !== -1) expect(idx).toBe(plan(s).menu.length - 1);
    }
  });

  it('nol duplikat di dalam satu kartu', () => {
    // Dulu "Pilih jadwal tayang" dan "Pilih Jadwal" tampil BERSAMAAN dan
    // memanggil handler yang sama.
    for (const s of STATES) {
      const p = plan(s);
      const ids = [...(p.primary ? [p.primary.id] : []), ...p.menu.map((a) => a.id)];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('order yang lunas maupun dibatalkan tidak punya aksi utama', () => {
    expect(plan('paid').primary).toBeNull();
    expect(plan('cancelled').primary).toBeNull();
  });

  it('order menunggu review hanya menunjuk ke tab Review — nol penagihan', () => {
    const p = plan('awaiting_review');
    expect(p.primary?.id).toBe('open_review');
    expect([...p.menu.map((a) => a.id)]).not.toContain('invoice');
    expect([...p.menu.map((a) => a.id)]).not.toContain('mark_paid');
  });

  it('"Tagih Susulan" HILANG saat tidak berlaku, bukan tampil disabled', () => {
    const open = billing({ openInvoice: { paymentId: 'x' } as any, billed: 1, paid: 1 });
    const ids = planCardActions({
      state: 'partially_paid', entry: entry(), billing: open, isLate: false, can: ALL,
    });
    expect([...(ids.primary ? [ids.primary.id] : []), ...ids.menu.map((a) => a.id)]).not.toContain('top_up');
  });

  it('lewat batas bayar: yang utama Ganti Tanggal, bukan Tandai Lunas', () => {
    const p = plan('waiting_payment', { isLate: true });
    expect(p.primary?.id).toBe('schedule');
  });

  it('menggeser tanggal order LUNAS ditandai berdialog+berkabar', () => {
    const s = plan('paid').menu.find((a) => a.id === 'schedule');
    expect(s?.warns).toBe(true);
  });

  it('tanpa hak batalkan jadwal, aksinya tidak muncul di mana pun', () => {
    for (const s of STATES) {
      const p = plan(s, { can: { ...ALL, cancelSchedule: false } });
      expect(p.menu.map((a) => a.id)).not.toContain('cancel_schedule');
    }
  });
});

describe('cardStateOf — gerbang aturan 2', () => {
  it('order yang masih in_review TIDAK jatuh ke awaiting_invoice', () => {
    // Ini bug yang membuat admin ditawari "Buat Tagihan" untuk order yang di
    // layar penelitinya berbunyi "tunggu review dulu".
    expect(cardStateOf(entry({ reviewStatus: 'in_review' }), billing())).toBe('awaiting_review');
  });

  it('tapi order in_review yang TERLANJUR LUNAS tetap dibaca lunas', () => {
    // 156 order di produksi lunas sambil kolom statusnya tertinggal di in_review.
    expect(cardStateOf(
      entry({ reviewStatus: 'in_review', paymentStatus: 'paid' }),
      billing({ isSettled: true }),
    )).toBe('paid');
  });

  it('slot yang masa tahannya lewat punya keadaan sendiri', () => {
    expect(cardStateOf(entry(), billing(), { holdLapsed: true })).toBe('hold_lapsed');
  });

  it('slot yang masa tahannya lewat TETAP hold_lapsed walau ada openInvoice menggantung', () => {
    // ⚠️ Tagihan lama ikut kedaluwarsa saat slotnya lepas — tidak boleh kembali ke waiting_payment
    const openBill = billing({ openInvoice: { paymentId: 'JFU-123' } as any, billed: 355200, outstanding: 355200 });
    expect(cardStateOf(entry(), openBill, { holdLapsed: true })).toBe('hold_lapsed');
  });

  it('pemesanan mandiri peneliti yang lewat 1 jam otomatis terdeteksi hold_lapsed', () => {
    const expiredUserEntry = entry({
      slotBookedBy: 'user',
      slotReservedAt: '2026-08-01T00:00:00.000Z',
    });
    const openBill = billing({ openInvoice: { paymentId: 'JFU-123' } as any, billed: 355200, outstanding: 355200 });
    expect(cardStateOf(expiredUserEntry, openBill)).toBe('hold_lapsed');
  });
});

describe('isLateForSchedule — satu definisi', () => {
  const past = entry({ startDate: '2026-08-01T08:00:00Z' });
  const now = new Date('2026-09-03T09:00:00Z');

  it('jadwal yang dibayar SEBAGIAN tetap terlambat kalau tanggalnya lewat', () => {
    // Definisi lama mengecualikan `partially_paid`, jadi bagian tagihan dan
    // baris aksi di kartu yang sama bisa berbeda pendapat.
    expect(isLateForSchedule(past, 'partially_paid', now)).toBe(true);
  });

  it('hanya jadwal yang benar-benar lunas yang kebal', () => {
    expect(isLateForSchedule(past, 'paid', now)).toBe(false);
  });

  it('jadwal tanpa tanggal tidak pernah terlambat', () => {
    expect(isLateForSchedule(entry({ startDate: null }), 'waiting_payment', now)).toBe(false);
  });
});

describe('notify_slot — "Kabari via WA"', () => {
  const ids = (p: ReturnType<typeof planCardActions>) =>
    [...(p.primary ? [p.primary.id] : []), ...p.menu.map((a) => a.id)];

  const withNotify = (state: CardState, e: Partial<AdScheduleEntry> = {}) =>
    planCardActions({
      state,
      entry: entry({ slotBookedBy: 'admin', startDate: '2026-09-10T08:00:00Z', ...e }),
      billing: billing(),
      isLate: false,
      can: { ...ALL, notifySlot: true },
    });

  it('muncul di menu saat slot sudah dipesan dan tagihan belum terbit', () => {
    expect(ids(withNotify('awaiting_invoice'))).toContain('notify_slot');
  });

  it('TIDAK muncul saat slotBookedBy kosong', () => {
    // 603 baris produksi ber-slot_booked_by NULL yang tak seorang pun pesan.
    // Mengabari "slot Anda sudah dipesan" di sana adalah kebohongan.
    expect(ids(withNotify('awaiting_invoice', { slotBookedBy: null }))).not.toContain('notify_slot');
  });

  it('TIDAK muncul saat jadwalnya belum bertanggal — isi pesannya justru tanggal itu', () => {
    expect(ids(withNotify('awaiting_invoice', { startDate: null }))).not.toContain('notify_slot');
  });

  it('TIDAK muncul di keadaan mana pun selain awaiting_invoice', () => {
    for (const s of STATES.filter((s) => s !== 'awaiting_invoice')) {
      expect(ids(withNotify(s))).not.toContain('notify_slot');
    }
  });

  it('TIDAK muncul kalau pemanggil tidak menyediakan handler-nya', () => {
    const p = planCardActions({
      state: 'awaiting_invoice',
      entry: entry({ slotBookedBy: 'admin' }),
      billing: billing(),
      isLate: false,
      can: ALL,
    });
    expect(ids(p)).not.toContain('notify_slot');
  });

  it('tidak pernah jadi aksi utama, dan tidak merusak', () => {
    const p = withNotify('awaiting_invoice');
    expect(p.primary?.id).not.toBe('notify_slot');
    expect(p.menu.find((a) => a.id === 'notify_slot')?.destructive).toBeUndefined();
  });
});

// ============================================================================
// Bagian 6a — jadwal tidak bisa dibatalkan selagi tagihannya masih hidup
// ============================================================================
//
// Dialog "Batalkan Jadwal" berkata tagihan yang menggantung "ikut dimatikan".
// Ia tidak: link DOKU-nya tetap bisa dibayar dari sisi bank. Order af004b84
// membuktikannya — jadwal dibatalkan 10.44, uangnya masuk keesokan malamnya.
// Urutan yang benar: matikan tagihannya dulu, baru batalkan jadwalnya.
describe('planCardActions — gerbang tagihan hidup', () => {
  const ids = (p: ReturnType<typeof planCardActions>) => p.menu.map((a) => a.id);
  const live = { paymentId: 'x', isPaid: false } as any;

  it('tagihan hidup MENGHILANGKAN "Batalkan Jadwal" dari menu', () => {
    const p = plan('waiting_payment', { billing: billing({ openInvoice: live }) });
    expect(ids(p)).not.toContain('cancel_schedule');
  });

  it('DIHILANGKAN, bukan ditampilkan disabled — kontrak berkas ini', () => {
    // "Tagih Susulan" yang disabled berikut tooltipnya adalah pola yang
    // diganti: ia memakan ruang untuk memberi tahu apa yang tidak bisa
    // dilakukan. Penjelasannya milik callout kartu, bukan menu.
    const p = plan('waiting_payment', { billing: billing({ openInvoice: live }) });
    expect(p.menu.find((a) => a.id === 'cancel_schedule')).toBeUndefined();
    expect(p.primary?.id).not.toBe('cancel_schedule');
  });

  it('tanpa tagihan hidup, aksinya kembali muncul', () => {
    const p = plan('waiting_payment', { billing: billing({ openInvoice: null }) });
    expect(ids(p)).toContain('cancel_schedule');
  });

  it('tagihan LUNAS tidak menghalangi — hanya yang HIDUP & belum dibayar', () => {
    // `openInvoice` sudah berarti "hidup DAN belum lunas"
    // (`live.find(i => !i.isPaid)`), jadi uang yang sudah masuk tidak boleh
    // mengunci pembatalan. Diuji di `partially_paid`, bukan `paid`: state
    // `paid` memang SENGAJA nol aksi pembatalan (keputusan produk yang sudah
    // ada, bukan efek gerbang ini).
    const p = plan('partially_paid', { billing: billing({ openInvoice: null, paid: 100000 }) });
    expect(ids(p)).toContain('cancel_schedule');
  });

  it('tagihan MATI/kedaluwarsa tidak menghalangi', () => {
    // Ini prasyarat (b): `openInvoice` sadar-kedaluwarsa sejak sql/83. Tanpa
    // itu, 182 dari 183 invoice `pending` produksi — yang link DOKU-nya sudah
    // mati berminggu-minggu — akan mengunci 75 jadwal dari pembatalan.
    const p = plan('awaiting_invoice', { billing: billing({ openInvoice: null }) });
    expect(ids(p)).toContain('cancel_schedule');
  });

  it('gerbangnya tidak menyentuh aksi lain', () => {
    // Yang dicabut HANYA pembatalan jadwal; kartu tetap punya jalan keluar.
    const withBill = plan('waiting_payment', { billing: billing({ openInvoice: live }) });
    expect(withBill.primary !== null || withBill.menu.length > 0).toBe(true);
  });

  it('izin admin tetap berlaku di atas gerbang ini', () => {
    // Gerbangnya MENAMBAH syarat, tidak menggantikan `can.cancelSchedule`.
    const p = planCardActions({
      state: 'waiting_payment', entry: entry(), billing: billing({ openInvoice: null }),
      isLate: false, can: { ...ALL, cancelSchedule: false },
    });
    expect(ids(p)).not.toContain('cancel_schedule');
  });
});

describe('planCardActions — cakupan "Tandai Lunas" pada tagihan gabungan', () => {
  /*
    B2: `markScheduleAsPaid()` berlingkup `schedule_id`, jadi pada anggota
    tagihan gabungan ia membalik SATU baris jadi lunas sementara link DOKU-nya
    tetap menagih total penuh — porsi yang sama bisa terbayar dua kali. Aksinya
    TIDAK dicabut (alur "peneliti transfer di luar DOKU, admin melunasi seluruh
    batch" justru yang melahirkan fitur ini); yang harus berubah namanya, supaya
    cakupannya terbaca SEBELUM tombolnya ditekan.
  */
  const label = (p: ReturnType<typeof planCardActions>) =>
    [p.primary, ...p.menu].find((a) => a?.id === 'mark_paid')?.label;

  it('tetap "Tandai Lunas" untuk tagihan biasa', () => {
    expect(label(plan('waiting_payment', { openInvoiceMemberCount: 1 }))).toBe('Tandai Lunas');
  });

  it('tanpa keterangan jumlah anggota, perilakunya persis seperti sebelum fitur ini ada', () => {
    expect(label(plan('waiting_payment'))).toBe('Tandai Lunas');
  });

  it('menyebut jumlah pesanan saat tagihannya gabungan', () => {
    expect(label(plan('waiting_payment', { openInvoiceMemberCount: 3 }))).toBe('Tandai Lunas (3 pesanan)');
  });

  it('aksinya TIDAK dicabut — cuma berganti cakupan', () => {
    const p = plan('waiting_payment', { openInvoiceMemberCount: 3 });
    expect([p.primary, ...p.menu].some((a) => a?.id === 'mark_paid')).toBe(true);
  });

  it('ditandai `warns` supaya dialog konsekuensinya wajib muncul', () => {
    const grup = [plan('waiting_payment', { openInvoiceMemberCount: 4 }).primary].find((a) => a?.id === 'mark_paid');
    expect(grup?.warns).toBe(true);
  });
});

describe('planCardActions — cakupan "Tandai Belum Lunas" pada tagihan gabungan', () => {
  /*
    Cermin dari blok di atas, dan cacatnya lahir dari perbaikannya:
    `settleGroupAsPaid` menulis `payment_channel = 'MANUAL_VERIFIED'` di tiap
    baris — nilai itulah gerbang yang memunculkan aksi ini. Cakupannya WAJIB
    ikut grup, kalau tidak membalik satu anggota memecah grup jadi separuh-lunas
    dan kuitansinya berubah kembali jadi tagihan bernominal penuh.

    Sumber angkanya BEDA dari `mark_paid`: grup yang sudah lunas tidak punya
    `openInvoice` lagi.
  */
  const label = (p: ReturnType<typeof planCardActions>) =>
    [p.primary, ...p.menu].find((a) => a?.id === 'unmark_paid')?.label;

  const paidPlan = (paidInvoiceMemberCount?: number) =>
    planCardActions({
      state: 'paid', entry: entry(), billing: billing({ isSettled: true }),
      isLate: false, can: ALL, paidInvoiceMemberCount,
    });

  it('tetap "Tandai Belum Lunas" untuk tagihan biasa', () => {
    expect(label(paidPlan(1))).toBe('Tandai Belum Lunas');
    expect(label(paidPlan())).toBe('Tandai Belum Lunas');
  });

  it('menyebut jumlah pesanan saat tagihannya gabungan', () => {
    expect(label(paidPlan(3))).toBe('Tandai Belum Lunas (3 pesanan)');
  });

  it('TIDAK memakai angka `openInvoiceMemberCount` — grup lunas tak punya tagihan terbuka', () => {
    const p = planCardActions({
      state: 'paid', entry: entry(), billing: billing({ isSettled: true }),
      isLate: false, can: ALL,
      openInvoiceMemberCount: 1,      // benar: tidak ada tagihan terbuka
      paidInvoiceMemberCount: 4,      // inilah cakupan pembalikannya
    });
    expect(label(p)).toBe('Tandai Belum Lunas (4 pesanan)');
  });
});

describe('dibatalkan ≠ kedaluwarsa — dua keadaan tidak boleh berbagi satu bacaan', () => {
  /*
    ⚠️ KEDUA FIXTURE DIAMBIL DARI SATU ORDER PRODUKSI (5b73a872, 10 Sep 2026).
    Dua jadwal, keduanya `status='cancelled'`, keduanya memakai badge merah
    "kedaluwarsa" — lewat DUA klausa berbeda di `isEntryHoldLapsed`:

      #JYTST4EE — tanggal 8 Sep disimpan sql/62 sebagai RIWAYAT, lalu klausa
                  "batas bayar hari tayang terlewat" membacanya sebagai tenggat.
      #MM36J2EW — `cancelSchedule()` menulis `payment_status='expired'` untuk
                  ordinal 1, lalu klausa `paymentStatus === 'expired'` menyala.

    Terukur hari itu: 86 dari 148 jadwal batal di produksi berbadge
    "kedaluwarsa". Kartu yang sama juga mencetak «Batas bayar terlewat — perlu
    tanggal tayang baru» tepat di bawah panel "Jadwal dibatalkan".
  */
  const nowMs = Date.parse('2026-09-10T14:00:00Z'); // 10 Sep, 21.00 WIB
  const now = new Date(nowMs);

  const cancelledPastDate = entry({
    status: 'cancelled', paymentStatus: 'pending', slotBookedBy: null,
    startDate: '2026-09-08T08:00:00Z', endDate: '2026-09-15T08:00:00Z', duration: 7,
  });
  const cancelledPaymentExpired = entry({
    status: 'cancelled', paymentStatus: 'expired', slotBookedBy: null,
    startDate: '2026-09-22T08:00:00Z', endDate: '2026-09-23T08:00:00Z',
  });

  it('jadwal batal bertanggal lampau tidak kedaluwarsa — tanggalnya riwayat, bukan tenggat', () => {
    expect(isEntryHoldLapsed(cancelledPastDate, nowMs)).toBe(false);
  });

  it('jadwal batal ber-payment_status expired tidak kedaluwarsa — itu jejak cancelSchedule()', () => {
    expect(isEntryHoldLapsed(cancelledPaymentExpired, nowMs)).toBe(false);
  });

  it('jadwal dari order ditolak tidak kedaluwarsa — ia nonaktif, bukan gugur', () => {
    expect(isEntryHoldLapsed(entry({ reviewStatus: 'rejected', startDate: '2026-09-08T08:00:00Z' }), nowMs)).toBe(false);
  });

  it('jadwal batal tidak pernah "terlambat bayar"', () => {
    expect(isLateForSchedule(cancelledPastDate, 'cancelled', now)).toBe(false);
  });

  // ── Arah sebaliknya: perbaikan tidak boleh membungkam kedaluwarsa yang SAH ──

  it('jadwal AKTIF yang bayarnya kedaluwarsa tetap kedaluwarsa', () => {
    // #MM36J2EW sebelum dibatalkan: tanggal dikosongkan, bayar expired.
    const e = entry({ status: 'unscheduled', paymentStatus: 'expired', startDate: null, endDate: null, slotBookedBy: null });
    expect(isEntryHoldLapsed(e, nowMs)).toBe(true);
  });

  it('jadwal AKTIF yang lewat batas bayar hari tayang tetap kedaluwarsa', () => {
    const e = entry({ status: 'waiting_payment', paymentStatus: 'pending', startDate: '2026-09-08T08:00:00Z' });
    expect(isEntryHoldLapsed(e, nowMs)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Fixture bersama untuk tiga blok di bawah.
// ─────────────────────────────────────────────────────────────
const NOW = Date.parse('2026-09-10T14:00:00Z'); // 10 Sep, 21.00 WIB
const PAST = '2026-09-08T08:00:00Z';            // 8 Sep 15.00 WIB — batas bayarnya sudah lewat
const FUTURE = '2026-09-14T08:00:00Z';          // 14 Sep 15.00 WIB — masih bisa dikejar

const inv = (o: Partial<ScheduleInvoice> = {}): ScheduleInvoice => ({
  paymentId: 'P1', amount: 100_000, status: 'pending', paymentUrl: null, createdAt: '2026-09-01T00:00:00Z',
  source: 'invoice', voucherCode: null, attempts: 1, isSuperseded: false, paymentMethod: null,
  paymentChannel: null, isPaid: false, isDead: false, isPending: true, billedStartDate: null,
  expiresAt: null, isExpired: false, isStale: false,
  ...o,
} as unknown as ScheduleInvoice);
const paid = (amount: number, o: Partial<ScheduleInvoice> = {}) =>
  inv({ amount, status: 'paid', isPaid: true, isPending: false, ...o });

describe('lapseKindOf — slot LEPAS ≠ LEWAT BATAS BAYAR (cermin layar peneliti)', () => {
  /*
    Peneliti sudah melihat dua keadaan: «Reservasi kedaluwarsa» (tanggalnya
    dilepas) dan «Batas bayar terlewat» (tanggalnya tak terkejar, slotnya
    TIDAK lepas sendiri). Kartu admin dulu menamai keduanya «kedaluwarsa», dan
    badge «perlu ditagih» yang dirancang untuk yang kedua mati sejak b4af05f.
  */
  it('slot admin yang lewat batas bayar 14.00: lewat batas bayar, BUKAN lepas', () => {
    expect(lapseKindOf(entry({ slotBookedBy: 'admin', startDate: PAST }), NOW)).toBe('past_cutoff');
  });

  it('pesanan mandiri peneliti yang lewat hold 1 jam: lepas', () => {
    const e = entry({ slotBookedBy: 'user', slotReservedAt: '2026-09-10T10:00:00Z', startDate: FUTURE });
    expect(lapseKindOf(e, NOW)).toBe('released');
  });

  it('keduanya berlaku sekaligus: LEPAS menang — urutan deriveOrderUiState (expired sebelum too_late)', () => {
    const e = entry({ slotBookedBy: 'user', slotReservedAt: '2026-09-07T10:00:00Z', startDate: PAST });
    expect(lapseKindOf(e, NOW)).toBe('released');
  });

  it('bayar kedaluwarsa pada jadwal aktif: lepas', () => {
    const e = entry({ status: 'unscheduled', paymentStatus: 'expired', startDate: null, endDate: null, slotBookedBy: null });
    expect(lapseKindOf(e, NOW)).toBe('released');
  });

  it('jadwal batal tidak gugur sama sekali', () => {
    expect(lapseKindOf(entry({ status: 'cancelled', slotBookedBy: null, startDate: PAST }), NOW)).toBeNull();
  });

  it('slot admin yang tanggalnya masih jauh: tidak gugur', () => {
    expect(lapseKindOf(entry({ slotBookedBy: 'admin', startDate: FUTURE }), NOW)).toBeNull();
  });
});

describe('cardMoneyOf — SATU definisi "ditagih" untuk kartu dan header', () => {
  const active = entry({ slotBookedBy: 'admin', startDate: FUTURE });

  it('menjumlahkan yang lunas dan tagihan yang masih bisa dibayar', () => {
    const b = billing({ invoices: [paid(100_000), inv({ amount: 50_000 })] });
    expect(cardMoneyOf(active, 'waiting_payment', b, NOW)).toEqual({ billed: 150_000, paid: 100_000 });
  });

  it('tagihan tersusul, basi, link kedaluwarsa, dan checkout yang ditinggal TIDAK dihitung', () => {
    const b = billing({ invoices: [
      paid(100_000),
      inv({ amount: 70_000, isSuperseded: true }),
      inv({ amount: 30_000, isStale: true }),
      inv({ amount: 40_000, isExpired: true }),
      inv({ amount: 20_000, source: 'transaction' }),
    ] });
    expect(cardMoneyOf(active, 'waiting_payment', b, NOW)).toEqual({ billed: 100_000, paid: 100_000 });
  });

  it('kartu lewat batas bayar: tagihan menggantungnya tak dihitung, uang yang SUDAH masuk tetap', () => {
    // Dulu kartu seperti ini membuang SEMUA baris, termasuk yang lunas — bayaran
    // sebagian lenyap dari kartunya sendiri.
    const late = entry({ slotBookedBy: 'admin', startDate: PAST });
    const b = billing({ invoices: [paid(60_000), inv({ amount: 40_000 })], paid: 60_000 });
    expect(cardMoneyOf(late, 'partially_paid', b, NOW)).toEqual({ billed: 60_000, paid: 60_000 });
  });

  it('kartu batal: hanya uang yang sudah masuk', () => {
    const cancelled = entry({ status: 'cancelled', slotBookedBy: null, startDate: PAST });
    const b = billing({ invoices: [paid(429_000, { source: 'transaction' }), inv({ amount: 50_000, isStale: true })] });
    expect(cardMoneyOf(cancelled, 'cancelled', b, NOW)).toEqual({ billed: 429_000, paid: 429_000 });
  });
});

describe('orderMoneyOf — header tab = jumlah kartunya', () => {
  it('menjumlahkan uang tiap kartu, bukan harga tercatat', () => {
    const e1 = entry({ id: 's1', slotBookedBy: 'admin', startDate: FUTURE, totalCost: 999_999 });
    const e2 = entry({ id: 's2', status: 'cancelled', slotBookedBy: null, startDate: PAST, totalCost: 277_500 });
    const billings = new Map([['s1', billing({ invoices: [paid(100_000), inv({ amount: 50_000 })], paid: 100_000 })]]);
    expect(orderMoneyOf([e1, e2], billings, NOW)).toEqual({ billed: 150_000, paid: 100_000, hasInvoices: true });
  });

  it('order tanpa satu pun tagihan: nol, dan tahu bahwa memang belum pernah ada', () => {
    // b672d1ae di produksi: 222.000 tercatat dari jadwal batal, nol tagihan.
    const e = entry({ status: 'cancelled', slotBookedBy: null, startDate: PAST, totalCost: 222_000 });
    expect(orderMoneyOf([e], new Map(), NOW)).toEqual({ billed: 0, paid: 0, hasInvoices: false });
  });

  it('order yang tagihannya mati semua: nol, tapi tahu bahwa tagihan PERNAH ada', () => {
    // 5b73a872 di produksi: 4 baris tagihan, tak satu pun berlaku.
    const e = entry({ id: 's1', status: 'cancelled', slotBookedBy: null, startDate: PAST });
    const dead = inv({ status: 'expired', isDead: true, isPending: false, isExpired: true });
    expect(orderMoneyOf([e], new Map([['s1', billing({ invoices: [dead] })]]), NOW))
      .toEqual({ billed: 0, paid: 0, hasInvoices: true });
  });
});
