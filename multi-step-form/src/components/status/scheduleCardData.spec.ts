import { describe, it, expect } from 'vitest';
import { airingStartHourWib, buildScheduleCards, publicationStateOf } from './airingPeriods';
import type { OrderUiState } from './deriveOrderUiState';
import type { SchedulePaymentMap } from './scheduleAxes';
import type { AdScheduleEntry, FormSubmission } from '@/utils/supabase';

/*
  Yang dijaga di sini adalah tiga janji Track D yang semuanya bisa rusak tanpa
  membuat satu pun tes lain merah — karena ketiganya soal ANGKA & LABEL yang
  ditampilkan, bukan soal alur:

    1. Aturan emas — Kilat yang gelombangnya belum ditetapkan tidak boleh
       memasok jam tayang ke layar (`start_date`-nya 00:00 WIB penampung).
    2. Uang jadwal dibaca dari yang ditagih, bukan dihitung ulang dari tarif
       hari ini — fungsi yang sama dengan kartu drawer admin.
    3. `paid`/`outstanding` benar-benar sampai ke kartu, supaya jadwal yang
       sudah dibayar sebagian berhenti menyebut harga penuh.
*/

const scheduleOf = (over: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
    id: 'sched-1',
    submissionId: 'sub-1',
    ordinal: 1,
    isExtension: false,
    bookingId: 'K3M9PQ7T',
    sourceId: 'sub-1',
    startDate: '2026-09-03T08:00:00.000Z',
    endDate: '2026-09-04T08:00:00.000Z',
    duration: 1,
    status: 'waiting_payment',
    reviewStatus: 'approved',
    paymentStatus: 'pending',
    distributionType: 'regular',
    kilatSlotHour: null,
    totalCost: 233_100,
    subtotal: 210_000,
    ppnAmount: 23_100,
    voucherCode: null,
    prizePerWinner: 30_000,
    winnerCount: 2,
    additionalPrizePerWinner: 0,
    isNewPeriod: false,
    periodBatch: null,
    slotBookedBy: 'user',
    slotReservedAt: '2026-09-02T01:00:00.000Z',
    title: 'Kuesioner uji',
    researcherName: 'Peneliti',
    university: null,
    submissionCreatedAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    pageStatus: 'none',
    isExtraAd: false,
    pageBannerIsPlaceholder: false,
    ...over,
});

const submissionOf = (over: Partial<FormSubmission> = {}): FormSubmission => ({
    id: 'sub-1',
    question_count: 20,
    distribution_type: 'regular',
    ...over,
} as FormSubmission);

const uiOf = (first: AdScheduleEntry, later: AdScheduleEntry[] = []): OrderUiState => ({
    currentStep: 2,
    eff: {
        effectiveStep: 2,
        activeStart: null,
        activeEnd: null,
        activeSchedule: null,
        hasLaterAiring: false,
        waitingPayment: [],
    },
    first,
    later,
    isExpired: false,
    isSlotCancelled: false,
    isUserBooked: true,
    isPaid: false,
    awaitingInvoice: false,
    finalPaymentLink: 'https://pay.example/abc',
    paymentDeadline: new Date('2026-09-02T02:00:00.000Z'),
    paymentDeadlineCause: 'slot',
    isTooLateToday: false,
    callout: 'payment',
    needsAction: true,
    group: 'butuh-aksi',
});

const t = ((key: string) => key) as never;

describe('buildScheduleCards — aturan emas jam tayang', () => {
    it('Kilat tanpa gelombang TIDAK memasok jam tayang ke kartu', () => {
        const first = scheduleOf({
            distributionType: 'kilat',
            kilatSlotHour: null,
            // 00:00 WIB — nilai penampung, bukan jadwal.
            startDate: '2026-09-02T17:00:00.000Z',
        });
        const [card] = buildScheduleCards(uiOf(first), {}, null, t, submissionOf({ distribution_type: 'kilat' }));

        expect(card.info.isKilat).toBe(true);
        expect(card.info.kilatSlotHour).toBeNull();
    });

    it('Kilat yang gelombangnya SUDAH ditetapkan membawa jamnya', () => {
        const first = scheduleOf({ distributionType: 'kilat', kilatSlotHour: 11 });
        const [card] = buildScheduleCards(uiOf(first), {}, null, t, submissionOf({ distribution_type: 'kilat' }));

        expect(card.info.isKilat).toBe(true);
        expect(card.info.kilatSlotHour).toBe(11);
    });

    it('iklan reguler tidak pernah ditandai Kilat', () => {
        const [card] = buildScheduleCards(uiOf(scheduleOf()), {}, null, t, submissionOf());
        expect(card.info.isKilat).toBe(false);
    });
});

describe('buildScheduleCards — uang dibaca, bukan dihitung ulang', () => {
    it('memakai `total_cost` yang tersimpan, bukan tarif hari ini', () => {
        // Harga warisan yang TIDAK mungkin keluar dari rumus hari ini.
        const first = scheduleOf({ totalCost: 1_110_000, subtotal: 1_000_000, ppnAmount: 110_000 });
        const [card] = buildScheduleCards(uiOf(first), {}, null, t, submissionOf());

        expect(card.money.total).toBe(1_110_000);
        expect(card.money.isEstimate).toBe(false);
    });

    it('menandai ESTIMASI hanya untuk jadwal yang belum pernah ditagih', () => {
        const first = scheduleOf({ totalCost: 0, subtotal: null, ppnAmount: null });
        const [card] = buildScheduleCards(uiOf(first), {}, null, t, submissionOf());

        expect(card.money.isEstimate).toBe(true);
        expect(card.money.total).toBeGreaterThan(0);
    });
});

describe('buildScheduleCards — sebagian dibayar', () => {
    const payments: SchedulePaymentMap = {
        'sub-1': {
            paymentUrl: 'https://pay.example/abc',
            paymentId: 'pay-1',
            scheduleId: 'sched-1',
            status: 'pending',
            amount: 233_100,
            paid: 100_000,
            outstanding: 133_100,
            isExpired: false,
            expiresAt: null,
            staleBilledFor: null,
        },
    };

    it('membawa `paid` dan `outstanding` apa adanya ke kartu', () => {
        const [card] = buildScheduleCards(uiOf(scheduleOf()), payments, null, t, submissionOf());

        expect(card.booking.paid).toBe(100_000);
        expect(card.booking.outstanding).toBe(133_100);
        // `amount` tetap yang DITAGIH — dua angka berbeda, jangan tertukar.
        expect(card.booking.amount).toBe(233_100);
    });

    it('nol-kan keduanya saat jadwal itu belum punya catatan tagihan', () => {
        const [card] = buildScheduleCards(uiOf(scheduleOf()), {}, null, t, submissionOf());

        expect(card.booking.paid).toBe(0);
        expect(card.booking.outstanding).toBe(0);
    });
});

/*
  Sumbu penayangan — P2.

  Aturannya dulu ditulis dua kali di `airingPeriods.ts`, sekali per cabang, dan
  keduanya sudah menyimpang di produksi. Yang di bawah ini adalah kasus yang
  gagal sebelum `publicationStateOf` lahir.
*/

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe('publicationStateOf', () => {
    const now = new Date('2026-08-26T05:00:00.000Z');
    const paid = { paymentStatus: 'paid' as const };

    it('jendela yang sudah lewat = selesai, walau kolom status belum dimajukan', () => {
        // 156 order di produksi ber-`status` macet; kolomnya tidak bisa dipercaya
        // untuk mengatakan "sudah selesai", hanya untuk mengatakan "live".
        const s = scheduleOf({
            ...paid, status: 'paid',
            startDate: '2026-08-11T08:00:00.000Z', endDate: '2026-08-12T08:00:00.000Z',
        });
        expect(publicationStateOf(s, now)).toBe('completed');
    });

    it('jam dinding menang atas kolom `status` yang macet di live', () => {
        // 177 baris produksi berstatus 'live' dengan jendela yang sudah lewat,
        // dan hanya 2 yang benar-benar tayang saat diukur. Kolom itu tidak
        // pernah dimajukan siapa pun.
        const s = scheduleOf({
            ...paid, status: 'live',
            startDate: '2026-08-11T08:00:00.000Z', endDate: '2026-08-12T08:00:00.000Z',
        });
        expect(publicationStateOf(s, now)).toBe('completed');
    });

    it('kolom `live` tetap dipakai selama jendelanya belum lewat', () => {
        const s = scheduleOf({
            ...paid, status: 'live',
            startDate: '2026-08-25T08:00:00.000Z', endDate: '2026-08-27T08:00:00.000Z',
        });
        expect(publicationStateOf(s, now)).toBe('live');
    });

    it('jendela yang sedang berjalan = tayang', () => {
        const s = scheduleOf({
            ...paid, status: 'paid',
            startDate: '2026-08-25T08:00:00.000Z', endDate: '2026-08-27T08:00:00.000Z',
        });
        expect(publicationStateOf(s, now)).toBe('live');
    });

    it('jendela yang belum dibuka = terjadwal', () => {
        const s = scheduleOf({
            ...paid, status: 'paid',
            startDate: '2026-09-03T08:00:00.000Z', endDate: '2026-09-04T08:00:00.000Z',
        });
        expect(publicationStateOf(s, now)).toBe('scheduled');
    });

    it('belum lunas = belum pernah terbit', () => {
        expect(publicationStateOf(scheduleOf({ status: 'waiting_payment' }), now)).toBe('none');
    });

    it('dibatalkan = belum pernah terbit, walau uangnya sudah masuk', () => {
        // Tanpa penjaga ini jendelanya yang sudah lewat membuatnya "Selesai" —
        // padahal ia tidak pernah tayang sama sekali.
        const s = scheduleOf({
            ...paid, status: 'cancelled',
            startDate: '2026-08-11T08:00:00.000Z', endDate: '2026-08-12T08:00:00.000Z',
        });
        expect(publicationStateOf(s, now)).toBe('none');
    });

    it('lunas tanpa jendela sama sekali = belum masuk fase penayangan', () => {
        // 38 baris. Bukan "akan tayang" — ia belum punya tanggal, dan itu
        // urusan Fase ②.
        const s = scheduleOf({ ...paid, status: 'paid', startDate: null, endDate: null });
        expect(publicationStateOf(s, now)).toBe('none');
    });

    it('belum lunas + jendela sudah lewat TETAP belum pernah terbit', () => {
        // 265 baris: `requested` dengan pembayaran kedaluwarsa. Cabang "later"
        // dulu menyebutnya "Selesai".
        const s = scheduleOf({
            status: 'requested', paymentStatus: 'expired',
            startDate: '2026-08-11T08:00:00.000Z', endDate: '2026-08-12T08:00:00.000Z',
        });
        expect(publicationStateOf(s, now)).toBe('none');
    });
});

describe('buildScheduleCards — kedua cabang memakai aturan yang sama', () => {
    /**
     * Kasus yang gagal sebelum P2, dan ia ada di cabang "later".
     *
     * Cabang itu memeriksa `status === 'live'` LEBIH DULU dari jendela
     * tanggalnya, jadi jadwal perpanjangan yang sudah selesai tayang tetap
     * berbunyi "Tayang" selamanya — 177 baris produksi berstatus 'live' dengan
     * jendela yang sudah lewat.
     */
    it('perpanjangan berstatus `live` dengan jendela lewat berbunyi Selesai', () => {
        const first = scheduleOf({
            paymentStatus: 'paid', status: 'paid',
            startDate: hoursFromNow(-72), endDate: hoursFromNow(-48),
        });
        const second = scheduleOf({
            id: 'sched-2', sourceId: 'ext-2', ordinal: 2, isExtension: true,
            paymentStatus: 'paid', status: 'live',
            startDate: hoursFromNow(-36), endDate: hoursFromNow(-12),
        });

        const ui = {
            ...uiOf(first, [second]),
            currentStep: 3,
            isPaid: true,
            eff: {
                effectiveStep: 3,
                activeStart: new Date(second.startDate!),
                activeEnd: new Date(second.endDate!),
                activeSchedule: second,
                hasLaterAiring: true,
                waitingPayment: [],
            },
        };

        const cards = buildScheduleCards(ui, {}, null, t, submissionOf());
        expect(cards).toHaveLength(2);
        expect(cards[0].publication.state).toBe('completed');
        expect(cards[1].publication.state).toBe('completed');
    });

    it('perpanjangan yang belum lunas tidak masuk fase penayangan', () => {
        // Cabang "later" dulu menggerbangkan sumbu tayang pada kolom `status`
        // saja, jadi baris yang tagihannya kedaluwarsa ikut dihitung terbit.
        const first = scheduleOf({ paymentStatus: 'paid', status: 'paid',
            startDate: hoursFromNow(-72), endDate: hoursFromNow(-48) });
        const second = scheduleOf({
            id: 'sched-2', sourceId: 'ext-2', ordinal: 2, isExtension: true,
            status: 'requested', paymentStatus: 'expired',
            startDate: hoursFromNow(-36), endDate: hoursFromNow(-12),
        });

        const ui = { ...uiOf(first, [second]), currentStep: 3, isPaid: true };
        const cards = buildScheduleCards(ui, {}, null, t, submissionOf());
        expect(cards[1].publication.state).toBe('none');
    });
});

describe('airingStartHourWib — P3', () => {
    const cardFor = (over: Partial<AdScheduleEntry>, sub: Partial<FormSubmission> = {}) =>
        buildScheduleCards(uiOf(scheduleOf(over)), {}, null, t, submissionOf(sub))[0];

    it('iklan reguler membaca jam dari instant jadwalnya, bukan konstanta', () => {
        // 2026-09-03 08:00Z = 15.00 WIB
        const card = cardFor({ startDate: '2026-09-03T08:00:00.000Z' });
        expect(airingStartHourWib(card)).toBe('15.00');
    });

    it('Kilat memakai gelombangnya, bukan 15.00', () => {
        // 2026-09-03 01:00Z = 08.00 WIB — gelombang paling pagi.
        const card = cardFor(
            { distributionType: 'kilat', kilatSlotHour: 8, startDate: '2026-09-03T01:00:00.000Z' },
            { distribution_type: 'kilat' },
        );
        expect(airingStartHourWib(card)).toBe('08.00');
    });

    it('Kilat tanpa gelombang TIDAK memasok jam sama sekali', () => {
        // `start_date` menyimpan 00.00 WIB sebagai penampung; menampilkannya
        // berarti mengarang jam yang belum diputuskan siapa pun.
        const card = cardFor(
            { distributionType: 'kilat', kilatSlotHour: null, startDate: '2026-09-02T17:00:00.000Z' },
            { distribution_type: 'kilat' },
        );
        expect(airingStartHourWib(card)).toBeNull();
    });

    it('tanpa tanggal, nol tebakan', () => {
        expect(airingStartHourWib(cardFor({ startDate: null, endDate: null }))).toBeNull();
    });
});

describe('buildScheduleCards — tagihan gabungan (A1)', () => {
    /*
      Cacat yang ditutup: kartu memajang PORSI pesanannya sendiri di sebelah
      tombol yang membuka link DOKU bernominal TOTAL GRUP. Untuk grup 3 pesanan
      @Rp 1,11jt, tiga kartu sama berbunyi Rp 1.110.000 dan ketiganya membuka
      halaman Rp 3.330.000.

      Dua janji yang dijaga di sini: hanya LEAD yang memegang link, dan
      `booking.group.total` membawa nominal yang sebenarnya ditagih.
    */
    const groupInfo = (over: Partial<NonNullable<ReturnType<typeof buildScheduleCards>[number]['booking']['group']>> = {}) => ({
        paymentId: 'JFU-INV-abc-1',
        total: 3_330_000,
        memberCount: 3,
        isLead: true,
        leadTitle: 'Survei Satu',
        others: [
            { title: 'Riset UMKM', amount: 1_110_000, isPaid: false },
            { title: 'Tracer Study', amount: 1_110_000, isPaid: false },
        ],
        allPaid: false,
        ...over,
    });

    it('kartu LEAD tetap memegang link, dan membawa total grup', () => {
        const [card] = buildScheduleCards(
            uiOf(scheduleOf()), {}, null, t, submissionOf(), () => groupInfo(),
        );

        /*
          ⚠️ YANG DIPEGANG KARTU ADALAH LINK PERANTARA, BUKAN URL DOKU.
          Sejak resolver `/bayar/<ad_schedules.id>` ada, SETIAP permukaan
          memakai jalur yang sama — email, WhatsApp, salinan admin, dan tombol
          ini. URL DOKU-nya tetap dipegang database; yang berubah hanya apa yang
          dilihat (dan bisa disalin) manusia. Lihat `payLink.ts`.
        */
        expect(card.booking.payUrl).toBe('/bayar/sched-1');
        expect(card.booking.group?.total).toBe(3_330_000);
        // `amount` tetap porsi jadwal ini — dua angka, keduanya benar untuk
        // pertanyaan masing-masing. Yang dilarang cuma memakai yang satu untuk
        // menjawab pertanyaan yang lain.
        expect(card.booking.amount).toBe(233_100);
    });

    it('kartu PENGIKUT kehilangan tombol bayarnya', () => {
        const [card] = buildScheduleCards(
            uiOf(scheduleOf()), {}, null, t, submissionOf(), () => groupInfo({ isLead: false }),
        );

        expect(card.booking.payUrl).toBeNull();
        expect(card.booking.group?.isLead).toBe(false);
    });

    it('tanpa grup, kartu berperilaku persis seperti sebelum fitur ini ada', () => {
        const [card] = buildScheduleCards(uiOf(scheduleOf()), {}, null, t, submissionOf());

        expect(card.booking.group).toBeNull();
        // Perantara juga di luar grup: satu jalur, nol cabang yang menyimpang.
        expect(card.booking.payUrl).toBe('/bayar/sched-1');
    });

    it('jadwal ke-2 dst.: pengikut kehilangan tombol, lead menyimpannya', () => {
        const later = scheduleOf({
            id: 'sched-2', ordinal: 2, isExtension: true, sourceId: 'ext-1',
            status: 'waiting_payment',
        });
        const payments: SchedulePaymentMap = {
            'ext-1': {
                paymentUrl: 'https://pay.example/grup', paymentId: 'JFU-INV-abc-1',
                scheduleId: 'sched-2',
                status: 'pending', amount: 1_110_000, paid: 0, outstanding: 1_110_000,
                isExpired: false, expiresAt: null, staleBilledFor: null,
            },
        };

        const [, pengikut] = buildScheduleCards(
            uiOf(scheduleOf(), [later]), payments, null, t, submissionOf(),
            (sourceId) => (sourceId === 'ext-1' ? groupInfo({ isLead: false }) : null),
        );
        expect(pengikut.booking.payUrl).toBeNull();

        const [, lead] = buildScheduleCards(
            uiOf(scheduleOf(), [later]), payments, null, t, submissionOf(),
            (sourceId) => (sourceId === 'ext-1' ? groupInfo({ isLead: true }) : null),
        );
        // Lead grup pun lewat perantara — resolver yang memutuskan siapa yang
        // diteruskan ke DOKU dan siapa yang dilempar ke halaman invoice.
        expect(lead.booking.payUrl).toBe('/bayar/sched-2');
    });
});

describe('buildScheduleCards — link kedaluwarsa (Case 6)', () => {
    it('`pending` yang sudah lewat masa berlaku dibaca sebagai kedaluwarsa, bukan siap bayar', () => {
        /*
          Tidak ada cron yang mengedaluwarsakan tagihan: 182 dari 183 baris
          produksi tetap `pending` sesudah link-nya mati. Tanpa cabang
          `isExpired`, kartu menawarkan tombol ke halaman DOKU yang menolaknya
          tanpa penjelasan — pola insiden af004b84.
        */
        const later = scheduleOf({
            id: 'sched-2', ordinal: 2, isExtension: true, sourceId: 'ext-1',
            status: 'waiting_payment',
        });
        const payments: SchedulePaymentMap = {
            'ext-1': {
                paymentUrl: 'https://pay.example/mati', paymentId: 'JFU-INV-mati',
                scheduleId: 'sched-2',
                status: 'pending', amount: 1_110_000, paid: 0, outstanding: 1_110_000,
                isExpired: true, expiresAt: '2026-09-01T07:00:00.000Z', staleBilledFor: null,
            },
        };

        const [, kartu] = buildScheduleCards(uiOf(scheduleOf(), [later]), payments, null, t, submissionOf());

        expect(kartu.booking.state).toBe('expired');
        expect(kartu.booking.payUrl).toBeNull();
    });
});


/*
  ═══════════════════════════════════════════════════════════════════════════
  TENGGAT KARTU JADWAL KE-2 dst. — DITENTUKAN DATANYA, BUKAN JENIS KARTUNYA
  ═══════════════════════════════════════════════════════════════════════════

  `airingPeriods` dulu menulis `deadline: null, deadlineCause: null` sebagai
  LITERAL untuk setiap kartu extend. Selama seluruh jadwal ke-2 dipesan ADMIN
  itu benar — pelepasannya manual, tidak ada jam yang jujur bisa disebut.

  Phase 4 membuka penjadwalan swalayan, dan jadwal ke-2 yang dipesan PENELITI
  punya hold 1 jam yang nyata. Kalau cabangnya tetap ditentukan jenis kartu,
  kartunya akan menjanjikan tenggat bayar (bisa berhari-hari lagi) untuk slot
  yang mati 60 menit lagi — persis kebohongan yang aturan emas dibuat untuk
  mencegah, cuma terbalik arahnya.

  Blok ini yang menahannya, DAN yang membuat Phase 4 aman dieksekusi.
*/
describe('buildScheduleCards — tenggat jadwal ke-2 dst.', () => {
    const extendOf = (over: Partial<AdScheduleEntry> = {}) => scheduleOf({
        id: 'sched-2', ordinal: 2, isExtension: true, sourceId: 'ext-1',
        status: 'waiting_payment',
        slotBookedBy: 'admin', slotReservedAt: null,
        ...over,
    });
    const payOf = (expiresAt: string | null): SchedulePaymentMap => ({
        'ext-1': {
            paymentUrl: 'https://pay.example/x', paymentId: 'JFU-INV-x',
            scheduleId: 'sched-2', status: 'pending',
            amount: 233_100, paid: 0, outstanding: 233_100,
            isExpired: false, expiresAt, staleBilledFor: null,
        },
    });

    it('dipesan ADMIN + tagihan hidup → tenggat BAYAR, bukan lagi "slot terbatas"', () => {
        const expiresAt = new Date(Date.now() + 36 * 3_600_000).toISOString();
        const [, kartu] = buildScheduleCards(
            uiOf(scheduleOf(), [extendOf()]), payOf(expiresAt), null, t, submissionOf(),
        );
        expect(kartu.booking.deadlineCause).toBe('bill');
        expect(kartu.booking.deadline?.toISOString()).toBe(expiresAt);
    });

    it('PHASE 4: dipesan PENELITI → hold 1 jam MENANG atas tenggat bayar', () => {
        /*
          Inilah kasus yang membuat literal `null` berbahaya. Tagihannya hidup
          36 jam lagi, tapi SLOTNYA mati 1 jam sejak dipesan. Yang harus
          disebut kartu adalah yang lebih dulu tiba — dan yang konsekuensinya
          berbeda: slot yang lepas mengembalikan tanggalnya ke pasar.
        */
        const reservedAt = new Date(Date.now() - 10 * 60_000).toISOString();
        const [, kartu] = buildScheduleCards(
            uiOf(scheduleOf(), [extendOf({ slotBookedBy: 'user', slotReservedAt: reservedAt })]),
            payOf(new Date(Date.now() + 36 * 3_600_000).toISOString()),
            null, t, submissionOf(),
        );
        expect(kartu.booking.deadlineCause).toBe('slot');
        expect(kartu.booking.deadline?.getTime())
            .toBe(new Date(reservedAt).getTime() + 3_600_000);
    });

    it('tenggat yang SUDAH LEWAT tidak pernah disebut — itu bukan tenggat', () => {
        const [, kartu] = buildScheduleCards(
            uiOf(scheduleOf(), [extendOf()]),
            payOf(new Date(Date.now() - 3_600_000).toISOString()),
            null, t, submissionOf(),
        );
        expect(kartu.booking.deadlineCause).toBeNull();
        expect(kartu.booking.deadline).toBeNull();
    });

    it('tagihan belum terbit → tetap null, dan aturan emas tetap utuh', () => {
        const [, kartu] = buildScheduleCards(
            uiOf(scheduleOf(), [extendOf()]), {}, null, t, submissionOf(),
        );
        expect(kartu.booking.deadlineCause).toBeNull();
        expect(kartu.booking.deadline).toBeNull();
    });

    it('slot admin TANPA slot_reserved_at tidak pernah menghasilkan tenggat slot', () => {
        // `slotReleaseDeadline` mengembalikan null = "tidak pernah lepas
        // sendiri", BUKAN "sudah lepas". Kedua arti itu mudah tertukar.
        const [, kartu] = buildScheduleCards(
            uiOf(scheduleOf(), [extendOf({ slotBookedBy: 'admin', slotReservedAt: '2026-09-02T01:00:00.000Z' })]),
            payOf(null), null, t, submissionOf(),
        );
        expect(kartu.booking.deadlineCause).toBeNull();
    });
});

/*
  ═══════════════════════════════════════════════════════════════════════════
  JEBAKAN ORDINAL 1 — "Bayar Sekarang" yang tidak bisa dibayar
  ═══════════════════════════════════════════════════════════════════════════

  Kartu ordinal ≥2 memutuskan sendiri dari `payments[sourceId]`. Kartu ordinal 1
  TIDAK — ia bergantung sepenuhnya pada `ui.finalPaymentLink`, yang dirakit di
  `StatusPage` dari `schedule_billing_bulk`. Jadi jebakannya bisa masuk dari
  DUA sisi, dan dua-duanya harus dikunci:

    sisi hulu  — `payLinkForBill` menjaga nilai itu tetap bisa `null`
                 (`payLink.spec.ts`)
    sisi hilir — cabang di bawah ini menjaga `null` benar-benar berarti
                 "menunggu tagihan", bukan "bayar sekarang"

  Yang terjadi saat sisi hulu jebol: jadwal yang SELURUH tagihannya dibatalkan
  tetap memajang tombol Bayar Sekarang; peneliti mengklik, resolver `/bayar/`
  menjawab jujur "tidak ada tagihan", dan pembayarannya berhenti di situ.
  Terukur di produksi pada jadwal MM36J2EW.
*/
describe('buildScheduleCards — ordinal 1 tanpa tagihan hidup', () => {
    const uiTanpaTagihan = (first: AdScheduleEntry): OrderUiState =>
        ({ ...uiOf(first), finalPaymentLink: null, callout: 'awaiting_invoice', awaitingInvoice: true });

    it('tanpa link → "menunggu tagihan", BUKAN "menunggu bayar"', () => {
        const [card] = buildScheduleCards(uiTanpaTagihan(scheduleOf()), {}, null, t, submissionOf());
        expect(card.booking.state).toBe('awaiting_invoice');
    });

    it('tanpa link → TIDAK ADA tombol bayar, walau jadwalnya punya id', () => {
        // `first.id` sengaja diisi: inilah yang dulu membuat `payLinkPath`
        // selalu menghasilkan tombol.
        const [card] = buildScheduleCards(uiTanpaTagihan(scheduleOf({ id: 'sched-1' })), {}, null, t, submissionOf());
        expect(card.booking.payUrl).toBeNull();
    });

    it('dengan tagihan hidup, tombolnya kembali — lewat perantara', () => {
        const [card] = buildScheduleCards(uiOf(scheduleOf()), {}, null, t, submissionOf());
        expect(card.booking.state).toBe('waiting_payment');
        expect(card.booking.payUrl).toBe('/bayar/sched-1');
    });
});
