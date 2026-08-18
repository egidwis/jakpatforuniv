import type { AdScheduleEntry, FormSubmission } from '@/utils/supabase';

/**
 * Aturan dua sumbu untuk dashboard PENELITI (Task 9B).
 *
 * Sampai sekarang seluruh layar peneliti diturunkan dari SATU kolom,
 * `form_submissions.submission_status`, yang memuat dua hal sekaligus: hasil
 * review (`in_review`/`approved`/`rejected`/`spam`) dan keadaan tayang
 * (`slot_reserved`/`waiting_payment`/`paid`/`live`/`completed`). Begitu order
 * bergerak, yang satu menimpa yang lain — dan yang tertimpa selalu review.
 *
 * `ad_schedules` sejak `sql/46` memisahkan keduanya: `review_status` (milik
 * ORDER, sama di semua barisnya) dan `status` (milik JADWAL, sumbu tayang
 * saja). Modul ini satu-satunya tempat kedua sumbu itu dibaca; `deriveOrderUiState`,
 * `buildScheduleCards`, dan `ReviewPhase` semuanya lewat sini supaya tidak bisa
 * berbeda pendapat.
 *
 * ⚠️ BACA DUA HAL INI SEBELUM MENGUBAH URUTAN CABANG DI `orderStepOf`.
 *
 * 1. **Lunas mengalahkan review.** Terukur di produksi 2026-08-08: 156 order
 *    ber-`submission_status = 'in_review'` TAPI `payment_status = 'paid'` —
 *    sudah bayar, sudah tayang, sudah selesai, hanya kolom statusnya yang tidak
 *    pernah dimajukan. Kalau sumbu review dievaluasi lebih dulu, ke-156 order
 *    itu mundur jadi "menunggu review" di layar penelitinya.
 * 2. **Tanpa tanggal = belum memilih jadwal, apa pun kata sumbu tayang.**
 *    4 order berstatus `slot_reserved` tidak punya tanggal sama sekali
 *    (kejanggalan data yang dicatat `sql/46`). Menyuruh mereka membayar sesuatu
 *    yang belum punya jendela tayang adalah jalan buntu.
 *
 * Selisih yang DISENGAJA terhadap `getCurrentStepIndex` lama, diukur atas
 * seluruh 971 order (664 identik, 307 berubah — semuanya perbaikan):
 *
 * | Jumlah | Dulu | Sekarang | Kenapa |
 * |---|---|---|---|
 * | 237 | 2 (menunggu bayar) | 0 (menunggu review) | `in_review` yang sudah memilih tanggal saat checkout. Ditagih sebelum direview |
 * | 65 | 2 | -1 (perlu revisi) | ditandai **spam**, tetap disuruh bayar |
 * | 5  | 2 | -1 (perlu revisi) | **ditolak**, tetap disuruh bayar |
 */

/** Sumbu tayang yang berarti uangnya sudah masuk. */
const PAID_AIRING = ['paid', 'scheduled', 'live', 'completed'];

/**
 * Pembayaran satu JADWAL — bukan satu order. Kuncinya `sourceId`: id
 * `form_submissions` untuk jadwal pertama, id `form_submissions_extend` untuk
 * sisanya. Itu persis kunci yang sudah dipakai `transactions.extend_id`, jadi
 * peta ini tidak perlu bentuk baru; Task 11 yang akan menggantinya dengan
 * kolom `schedule_id` eksplisit.
 */
export interface SchedulePaymentInfo {
    paymentUrl: string | null;
    paymentId: string | null;
    /** Status transaksi: pending | paid | expired | failed */
    status: string | null;
    amount: number;
}

export type SchedulePaymentMap = Record<string, SchedulePaymentInfo>;

const airingOf = (s: AdScheduleEntry) => (s.status || '').toLowerCase();

export function isSchedulePaid(s: AdScheduleEntry): boolean {
    return s.paymentStatus === 'paid' || PAID_AIRING.includes(airingOf(s));
}

export const scheduleStart = (s: AdScheduleEntry): Date | null =>
    s.startDate ? new Date(s.startDate) : null;

export const scheduleEnd = (s: AdScheduleEntry): Date | null =>
    s.endDate ? new Date(s.endDate) : null;

/** Jadwal pertama (ordinal 1) — sumbu review & administrasi order tinggal di sini. */
export function firstScheduleOf(schedules: AdScheduleEntry[]): AdScheduleEntry | null {
    return schedules.find((s) => s.ordinal === 1) || null;
}

export function laterSchedulesOf(schedules: AdScheduleEntry[]): AdScheduleEntry[] {
    return schedules.filter((s) => s.ordinal > 1).sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * Cadangan kalau cermin belum sempat menuliskan baris ordinal 1.
 *
 * Sejak `sql/46` aturannya total — satu order SELALU punya satu baris ordinal 1,
 * cabang DELETE-nya dibuang — jadi ini tidak seharusnya pernah terpakai. Tapi
 * ongkos salahnya tidak simetris: kalau baris itu absen barang sedetik, order
 * peneliti HILANG dari dashboardnya sendiri. Lima belas baris ini menukar
 * kejadian itu dengan tampilan yang sedikit tertinggal.
 *
 * Tanggalnya diangkat lewat aturan iklan regular (15.00 WIB). Untuk Kilat itu
 * salah, tapi jalur ini hanya hidup saat cermin gagal — dan cermin adalah
 * satu-satunya tempat gelombang Kilat diketahui.
 */
export function scheduleFromSubmission(submission: FormSubmission): AdScheduleEntry {
    const asInstant = (d: string | null | undefined): string | null => {
        if (!d) return null;
        const parsed = new Date(d);
        if (isNaN(parsed.getTime())) return null;
        if (!d.includes('T')) parsed.setUTCHours(8, 0, 0, 0); // 15.00 WIB
        return parsed.toISOString();
    };

    const status = (submission.submission_status || 'in_review').toLowerCase();
    const hasDates = !!submission.start_date && !!submission.end_date;

    return {
        id: `local-${submission.id}`,
        submissionId: submission.id || '',
        ordinal: 1,
        isExtension: false,
        sourceId: submission.id || '',
        // Jaring pengaman, bukan jalur normal: sejak sql/51 setiap order PUNYA
        // baris ordinal 1, jadi `firstScheduleOf()` hampir selalu menang dan
        // baris ini tidak terpakai. Kalau toh terpakai (cermin belum sempat
        // ditulis saat halaman dimuat), tampilkan bentuk LAMA — 8 hex pertama
        // id order — supaya peneliti melihat kode yang sudah ia kenal alih-alih
        // kolom kosong. Sengaja bukan string acak: kode ini boleh usang, tapi
        // tidak boleh membingungkan support.
        bookingId: (submission.id || '').slice(0, 8).toUpperCase(),
        startDate: asInstant(submission.start_date),
        endDate: asInstant(submission.end_date),
        duration: submission.duration ?? null,
        // Terjemahan harfiah airing_status_of() (sql/46).
        status: ['rejected', 'spam'].includes(status)
            ? 'cancelled'
            : ['waiting_payment', 'paid', 'scheduled', 'live', 'completed', 'slot_reserved'].includes(status)
                ? status
                : hasDates ? 'requested' : 'unscheduled',
        // Terjemahan harfiah review_status_of() (sql/46).
        reviewStatus: [
            'approved', 'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed',
        ].includes(status) ? 'approved' : status,
        paymentStatus: submission.payment_status || null,
        distributionType: submission.distribution_type || null,
        kilatSlotHour: null,
        totalCost: Number(submission.total_cost || 0),
        subtotal: typeof submission.ppn_amount === 'number' ? submission.subtotal ?? null : null,
        ppnAmount: submission.ppn_amount ?? null,
        voucherCode: submission.voucher_code || null,
        prizePerWinner: Number(submission.prize_per_winner || 0),
        winnerCount: Number(submission.winner_count || 0),
        additionalPrizePerWinner: 0,
        isNewPeriod: false,
        // Jadwal pertama tidak pernah punya `period_batch` — pool-nya belum
        // dinamai — jadi NULL di sini bukan kehilangan, melainkan nilai yang benar.
        periodBatch: null,
        createdAt: submission.created_at || null,
        slotBookedBy: submission.slot_booked_by || null,
        slotReservedAt: submission.slot_reserved_at || null,
        title: submission.title || '',
        researcherName: submission.full_name || '',
        university: submission.university || null,
        submissionCreatedAt: submission.created_at || new Date().toISOString(),
        pageStatus: 'none',
        isExtraAd: false,
        // Jalur cadangan ini tidak menanyakan `survey_pages` sama sekali, jadi ia
        // tidak tahu banner apa yang dipakai. `false` = "tidak ada yang perlu
        // dilaporkan", bukan "sudah diganti" — dan itu jawaban yang benar di sini:
        // penanda banner cuma dirender di papan admin, yang selalu membaca cermin.
        pageBannerIsPlaceholder: false,
    };
}

/**
 * Langkah order pada skala lama (-1 revisi · 0 review · 1 pilih jadwal ·
 * 2 bayar · 3 tayang · 4 selesai), diturunkan dari DUA sumbu jadwal pertama.
 *
 * Skalanya sengaja tidak diubah: `getActiveDashboardPhase`, rail ①②③, dan
 * seluruh callout sudah berbicara dalam angka-angka ini. Yang berubah adalah
 * dari mana angkanya berasal.
 */
export function orderStepOf(first: AdScheduleEntry, now: Date = new Date()): number {
    const airing = airingOf(first);
    const paid = isSchedulePaid(first);
    const start = scheduleStart(first);
    const end = scheduleEnd(first);
    const hasDates = !!start && !!end;

    // 1. Ditolak/spam yang belum pernah bayar → revisi. Diletakkan di atas
    //    karena sumbu tayangnya ('cancelled') tidak membawa informasi apa pun.
    if (!paid && ['rejected', 'spam'].includes(first.reviewStatus)) return -1;

    // 2. Lunas menutup sumbu review — lihat catatan (1) di kepala berkas.
    if (paid) {
        if (airing === 'completed' || (end && end < now)) return 4;
        if (airing === 'live' || (start && end && start <= now && end >= now)) return 3;
        return hasDates ? 3 : 2;
    }

    // 3. Belum lunas: review yang menentukan, bukan tanggal.
    if (first.reviewStatus !== 'approved') return 0;

    // 4. Sudah disetujui tapi belum punya jendela tayang — lihat catatan (2).
    if (!hasDates) return 1;

    // 5. Sisanya (`requested`/`slot_reserved`/`waiting_payment`): tanggal sudah
    //    dipilih, tinggal urusan tagihan.
    return 2;
}

export interface EffectiveAiring {
    /** Langkah setelah jadwal ke-2 dst. ikut diperhitungkan. */
    effectiveStep: number;
    /** Jendela tayang yang sedang berlaku — bisa milik jadwal ke-2 dst. */
    activeStart: Date | null;
    activeEnd: Date | null;
    /** Jadwal yang menyumbang jendela di atas; null berarti jadwal pertama. */
    activeSchedule: AdScheduleEntry | null;
    /** Order ini punya lebih dari satu jendela tayang yang sudah lunas. */
    hasLaterAiring: boolean;
    /** Jadwal ke-2 dst. yang tagihannya terbit dan belum dibayar. */
    waitingPayment: AdScheduleEntry[];
}

/**
 * Jendela tayang efektif sebuah order. Turunan langsung
 * `computeEffectiveExtendStatus` lama, dengan satu perbedaan yang penting:
 * tanggalnya dibaca sebagai INSTANT dari cermin, bukan disintesis 15.00 WIB.
 *
 * Untuk iklan regular hasilnya sama persis. Untuk **Kilat** tidak: gelombangnya
 * 08/11/14/17 WIB, jadi order yang didorong pukul 08.00 selama ini baru dianggap
 * "sedang tayang" oleh dashboard penelitinya sendiri tujuh jam kemudian.
 */
export function effectiveAiringOf(
    first: AdScheduleEntry,
    later: AdScheduleEntry[],
    payments: SchedulePaymentMap = {},
    now: Date = new Date()
): EffectiveAiring {
    const baseStep = orderStepOf(first, now);

    const confirmed = later.filter((s) => PAID_AIRING.includes(airingOf(s)));

    const isAiringNow = (s: AdScheduleEntry) => {
        const airing = airingOf(s);
        if (airing === 'live') return true;
        if (['completed', 'cancelled', 'waiting_payment'].includes(airing)) return false;
        const start = scheduleStart(s);
        const end = scheduleEnd(s);
        return !!(start && end && start <= now && end >= now);
    };

    const live = confirmed.find(isAiringNow) || null;

    const upcoming = confirmed
        .filter((s) => {
            const start = scheduleStart(s);
            return start && start > now;
        })
        .sort((a, b) => scheduleStart(a)!.getTime() - scheduleStart(b)!.getTime())[0] || null;

    let effectiveStep = baseStep;
    let activeStart = scheduleStart(first);
    let activeEnd = scheduleEnd(first);
    let activeSchedule: AdScheduleEntry | null = null;
    let hasLaterAiring = false;

    if (live || upcoming) {
        const winner = (live || upcoming)!;
        effectiveStep = 3;
        activeStart = scheduleStart(winner) ?? activeStart;
        activeEnd = scheduleEnd(winner) ?? activeEnd;
        activeSchedule = winner;
        hasLaterAiring = true;
    } else if (confirmed.length > 0) {
        // Tidak ada yang sedang/akan tayang, tapi ada jadwal lunas yang sudah
        // lewat — tampilkan jendela terakhir supaya order "selesai" memakai
        // tanggal akhir yang benar, bukan tanggal jadwal pertama.
        const latest = confirmed.reduce<AdScheduleEntry | null>((acc, s) => {
            const end = scheduleEnd(s);
            if (!end) return acc;
            const accEnd = acc ? scheduleEnd(acc) : null;
            return !accEnd || end > accEnd ? s : acc;
        }, null);
        const latestEnd = latest ? scheduleEnd(latest) : null;
        if (latestEnd && (!activeEnd || latestEnd > activeEnd)) {
            activeStart = scheduleStart(latest!) ?? activeStart;
            activeEnd = latestEnd;
            activeSchedule = latest;
            hasLaterAiring = true;
        }
    }

    const waitingPayment = later.filter((s) => {
        if (airingOf(s) !== 'waiting_payment') return false;
        const pay = payments[s.sourceId];
        return !!(pay && pay.paymentUrl && pay.status === 'pending');
    });

    return { effectiveStep, activeStart, activeEnd, activeSchedule, hasLaterAiring, waitingPayment };
}
