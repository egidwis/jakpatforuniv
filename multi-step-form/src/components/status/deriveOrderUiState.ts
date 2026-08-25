import type { AdScheduleEntry, FormSubmission } from '@/utils/supabase';
import {
    effectiveAiringOf,
    firstScheduleOf,
    isSchedulePaid,
    laterSchedulesOf,
    orderStepOf,
    isSlotCancelledSchedule,
    scheduleFromSubmission,
    type EffectiveAiring,
    type SchedulePaymentMap,
} from './scheduleAxes';
import { isPaymentTooLateForDate, paymentCutoffInstant, toWibYmd } from '@/utils/airing-window';
import { isManualVerificationVoucher } from '@/utils/cost-calculator';

/**
 * Satu sumber kebenaran untuk state UI sebuah order. Dipakai oleh kartu
 * StatusPage (callout, badge, filter) dan konteks order yang disuntikkan
 * ke system prompt Mimin AI — supaya keduanya tidak pernah berbeda
 * pendapat soal "order ini butuh apa sekarang".
 */

export type OrderCalloutState =
    | 'revision'
    /** Pesanan dihentikan — oleh peneliti sendiri atau oleh admin. Keadaan
     * AKHIR yang tetap terlihat peneliti (tab "Selesai"), bukan disembunyikan:
     * order yang lenyap tanpa jejak justru memicu pertanyaan ke tim. */
    | 'cancelled'
    /** Satu-satunya state review. Order yang lolos auto-approval langsung ke
     * `waiting_payment` (step 2) dan tak pernah menyentuh step 0, jadi "review
     * otomatis sedang berjalan" bukan state yang bisa ada. */
    | 'review_manual'
    | 'choose_schedule'
    /** Disetujui lewat review MANUAL admin — dan sejak keputusan produk
     * 2026-08-25, admin pula yang menetapkan jadwalnya. Bolanya di admin, jadi
     * peneliti TIDAK diberi CTA "Pilih Jadwal" di sini. Order yang lolos
     * auto-review tetap menjadwalkan sendiri lewat `choose_schedule`. */
    | 'awaiting_admin_schedule'
    | 'payment'
    | 'awaiting_invoice'
    | 'expired'
    /** Tim Jakpat membatalkan tanggal tayangnya. BUKAN `cancelled` — pesanannya
     * masih berdiri dan kelulusan review-nya utuh; yang hilang cuma tanggalnya.
     * Dan BUKAN `expired` — tidak ada yang kedaluwarsa, ada yang memutuskan. */
    | 'slot_cancelled'
    | 'too_late_today'
    | 'extend_payment'
    | 'ready_to_launch'
    | 'live'
    | 'completed';

export type OrderGroup = 'butuh-aksi' | 'berjalan' | 'selesai';

export interface OrderUiState {
    /** Step efektif setelah koreksi expired (-1 = revisi) */
    currentStep: number;
    eff: EffectiveAiring;
    /** Jadwal pertama (ordinal 1) — sumbu review & administrasi order. */
    first: AdScheduleEntry;
    /** Jadwal ke-2 dst., urut ordinal. */
    later: AdScheduleEntry[];
    isExpired: boolean;
    /** Jadwalnya dibatalkan admin. Mengalahkan `isExpired`, lihat turunannya. */
    isSlotCancelled: boolean;
    isUserBooked: boolean;
    isPaid: boolean;
    awaitingInvoice: boolean;
    /** Link bayar final, termasuk fallback checkout internal untuk slot user-booked */
    finalPaymentLink: string | null;
    /** Deadline bayar efektif: yang paling awal antara slot_reserved_at + 1 jam
     * (slot user-booked) dan batas 14.00 WIB hari-H bila jadwalnya hari ini. */
    paymentDeadline: Date | null;
    /** Batas mana yang menang — menentukan konsekuensinya, dan karena itu
     * kalimatnya: `slot` = reservasi dilepas, `cutoff` = slotnya tetap tapi
     * iklan tidak bisa tayang di jadwal tersebut. */
    paymentDeadlineCause: 'slot' | 'cutoff' | null;
    /** Jadwalnya hari ini tapi batas bayar 14.00 WIB sudah lewat — admin tidak
     * lagi punya waktu membangun halaman iklan sebelum 15.00. */
    isTooLateToday: boolean;
    callout: OrderCalloutState;
    needsAction: boolean;
    group: OrderGroup;
}

/** Fase rail (①②③, lihat `PhaseRail.tsx`) yang SEDANG BERJALAN — beda dari
 * `currentStep` (skala internal -1..4 dipakai callout/booking-state). Dipakai
 * StatusPage utk (a) menyalakan nomor fase secara KUMULATIF (fase <= ini
 * dianggap tercapai/menyala biru) dan (b) menentukan card fase mana yang
 * default expand (hanya fase yang SEDANG berjalan; lainnya default collapse).
 * `null` = order sudah selesai (fase ③ tuntas) — tidak ada fase yang
 * "sedang berjalan" lagi, jadi nol card auto-expand, tapi ketiga nomor tetap
 * dianggap tercapai (dipakai pemanggil sbg `?? 3` utk kumulatif menyala semua).
 * Pemetaan (dikonfirmasi user 2026-07-27): fase ① berakhir begitu "approved"
 * (currentStep >= 1), fase ② berakhir begitu "paid" (currentStep >= 3), fase
 * ③ berakhir begitu "selesai" (currentStep === 4) — persis batas step yang
 * SUDAH ADA di `getCurrentStepIndex`, tidak ada logika status baru. */
export type DashboardPhase = 1 | 2 | 3 | null;

export function getActiveDashboardPhase(currentStep: number): DashboardPhase {
    if (currentStep <= 0) return 1; // -1 rejected, 0 in_review
    if (currentStep <= 2) return 2; // 1 choose_schedule, 2 awaiting_invoice/waiting_payment
    if (currentStep === 3) return 3; // paid, scheduled/live
    return null; // 4 completed
}

/**
 * Label RETROSPEKTIF: "order ini lolos auto-approval waktu checkout" — bukan
 * "review sedang berjalan". Review otomatis 100% sinkron (jalan saat import
 * Google Form di Step One, sebelum checkout) dan tidak ada reviewer latar
 * belakang, jadi tidak ada state "auto review in progress" yang bisa dilaporkan.
 *
 * Harus cermin `isAutoApproval` di StepCheckout: gerbang voucher verifikasi
 * manual (ILKOMUNY/JFUFEB) ikut dihitung — tanpa itu order voucher di atas
 * Google Form bersih salah dilabeli "otomatis" padahal admin yang mereview.
 *
 * Tetap tidak 100% presisi untuk order yang sudah lewat step 0: `hasPersonalData
 * Questions` tak pernah dipersistensi (proksinya `detected_keywords`), dan
 * ILKOMUNY yang sudah terpakai disimpan dengan `voucher_code` kosong. Karena itu
 * pemanggil TIDAK boleh memakai fungsi ini untuk memutuskan copy saat `step === 0`
 * — di sana review selalu manual secara konstruksi.
 */
export function isAutoReviewed(submission: FormSubmission): boolean {
    return (
        submission.submission_method !== 'manual' &&
        (submission.survey_url || '').includes('docs.google.com/forms') &&
        !(submission.detected_keywords && submission.detected_keywords.length > 0) &&
        !isManualVerificationVoucher(submission.voucher_code)
    );
}

const PAYMENT_WINDOW_MS = 3600_000; // 1 jam sejak slot_reserved_at

/**
 * @param schedules Baris `ad_schedules` milik order ini, ordinal 1 lebih dulu.
 *   Boleh kosong — lihat `scheduleFromSubmission`.
 * @param payments  Pembayaran per jadwal, dikunci `sourceId` (= `extend_id`
 *   untuk jadwal ke-2 dst., = id submission untuk jadwal pertama).
 */
export function deriveOrderUiState(
    submission: FormSubmission,
    schedules: AdScheduleEntry[] = [],
    payments: SchedulePaymentMap = {},
    paymentLink: string | null = null
): OrderUiState {
    const now = new Date();
    const first = firstScheduleOf(schedules) ?? scheduleFromSubmission(submission);
    const later = laterSchedulesOf(schedules);

    const eff = effectiveAiringOf(first, later, payments, now);
    const rawStep = orderStepOf(first, now) === -1 ? -1 : eff.effectiveStep;

    const isUserBooked = first.slotBookedBy === 'user';
    const isPaymentExpired = first.paymentStatus === 'expired';
    const isPaid = isSchedulePaid(first);
    /**
     * Dibatalkan admin — bukan kedaluwarsa. Harus dihitung SEBELUM `isExpired`
     * dan mengalahkannya: `cancelSchedule()` menulis `payment_status='expired'`
     * juga, jadi tanpa penjaga ini keduanya jatuh ke cabang yang sama dan
     * peneliti dibilang slotnya "dilepas otomatis" oleh mesin.
     */
    const isSlotCancelled = !isPaid && isSlotCancelledSchedule(first);
    const isExpired =
        !isSlotCancelled &&
        rawStep !== -1 &&
        !isPaid &&
        (isPaymentExpired ||
            (isUserBooked &&
                !!first.slotReservedAt &&
                now.getTime() > new Date(first.slotReservedAt).getTime() + PAYMENT_WINDOW_MS));

    // Slot kedaluwarsa → UI mundur ke step slot, apa pun kata DB
    const currentStep = isExpired ? 1 : rawStep;

    let finalPaymentLink = paymentLink;
    if (!finalPaymentLink && isUserBooked && !isExpired && currentStep === 2 && submission.id) {
        finalPaymentLink = `/dashboard/payment/${submission.id}`;
    }

    const awaitingInvoice = currentStep === 2 && !finalPaymentLink && !isExpired;

    // Jadwal hari-H hanya bisa dikejar kalau lunas sebelum 14.00 WIB — setelah
    // itu admin tidak sempat membangun halaman iklan untuk tayang 15.00.
    // Berlaku untuk SEMUA slot, termasuk yang dibooking admin (yang selama ini
    // tidak punya deadline sama sekali karena invoicenya berjatuh tempo 7 hari).
    // Tanggal cermin sudah berupa instant yang benar — 15.00 WIB untuk iklan
    // regular, gelombangnya sendiri untuk Kilat — jadi tidak ada lagi jam yang
    // disintesis di sini.
    const startYmd = first.startDate ? toWibYmd(new Date(first.startDate)) : null;
    const isTooLateToday =
        currentStep === 2 &&
        !isExpired &&
        !isPaid &&
        !!startYmd &&
        isPaymentTooLateForDate(startYmd);

    const slotDeadline =
        isUserBooked && submission.slot_reserved_at
            ? new Date(new Date(submission.slot_reserved_at).getTime() + PAYMENT_WINDOW_MS)
            : null;
    const cutoffDeadline = startYmd && !isPaid ? paymentCutoffInstant(startYmd) : null;
    // Ambil yang paling awal — batas mana pun yang lebih dulu tiba, itu yang
    // jujur ditampilkan ke user.
    const candidateDeadlines = [slotDeadline, cutoffDeadline].filter((d): d is Date => !!d);
    /**
     * ⚠️ JAM HANYA DISEBUT UNTUK SLOT YANG DIPESAN PENELITI SENDIRI.
     * Aturan pemilik produk 2026-08-19.
     *
     * Slot yang dipesan admin dilepas MANUAL lewat dashboard admin, kapan saja
     * — tidak ada jam yang jujur bisa disebut untuknya. Menampilkan batas
     * 14.00 WIB di situ mengarang tenggat yang bukan tenggat: lewat jam itu
     * slotnya TIDAK lepas (lihat `slotHold.ts`), yang habis cuma waktu admin
     * menyiapkan halaman iklan — dan kasus hari-H sudah ditangani keadaan
     * `too_late_today` yang terpisah. Gantinya peneliti diberi alasan yang
     * benar-benar berlaku: slotnya terbatas dan bisa habis.
     *
     * Diukur dari `isUserBooked`, BUKAN dari `paymentDeadlineCause` — keduanya
     * TIDAK sama, dan yang membedakan bukan jam pemesanan.
     *
     * Pemesanan hari-H sudah tertutup 13.00 WIB (`isBookingClosedForDate`,
     * ditegakkan keras di `submitOrder` sebelum INSERT dan di `handleRebook`),
     * jadi reservasi mandiri untuk hari ini selalu berakhir sebelum 14.00 —
     * hold 1 jam-nya SELALU tiba lebih dulu daripada cutoff. Untuk tanggal di
     * masa depan apalagi. Jadi `cause` tidak pernah 'cutoff' gara-gara jam.
     *
     * Yang membuatnya 'cutoff' pada slot milik peneliti adalah keadaan lain:
     * `slot_booked_by='user'` dengan `slot_reserved_at` NULL atau tidak bisa
     * diurai. Terukur 2026-08-19: **0 dari 68** baris user-booked seperti itu,
     * jadi cabang 'cutoff' hari ini JARING PENGAMAN, bukan jalur hidup —
     * dipertahankan karena kalau keadaan itu muncul, kalimat 'slot' yang akan
     * berbohong. `slotReleaseDeadline` mengembalikan `null` di situ — slotnya
     * TIDAK pernah lepas sendiri (dipagari eksplisit di `slotHold.test.ts`) —
     * sehingga satu-satunya batas yang tersisa memang cutoff-nya. Di situ
     * kalimat 'cutoff' justru yang benar, dan kalimat 'slot' akan berbohong.
     */
    const paymentDeadline =
        isUserBooked && currentStep === 2 && !isExpired && !isTooLateToday && candidateDeadlines.length > 0
            ? new Date(Math.min(...candidateDeadlines.map((d) => d.getTime())))
            : null;
    // Kalau keduanya jatuh di detik yang sama, `slot` yang dipakai — reservasi
    // dilepas adalah konsekuensi yang lebih keras, jadi itu yang perlu disebut.
    const paymentDeadlineCause: 'slot' | 'cutoff' | null = !paymentDeadline
        ? null
        : slotDeadline && slotDeadline.getTime() === paymentDeadline.getTime()
            ? 'slot'
            : 'cutoff';

    const hasLaterScheduleAwaitingPayment = eff.waitingPayment.length > 0;

    let callout: OrderCalloutState;
    if (currentStep === -1) {
        // -1 memuat SEMUA order mati; yang membedakan sebabnya cuma reviewStatus.
        callout = first.reviewStatus === 'cancelled' ? 'cancelled' : 'revision';
    } else if (isSlotCancelled) {
        // Sebelum cabang `isExpired`, karena keduanya cocok untuk baris yang sama.
        callout = 'slot_cancelled';
    } else if (isExpired) {
        callout = 'expired';
    } else if (hasLaterScheduleAwaitingPayment) {
        callout = 'extend_payment';
    } else if (currentStep === 0) {
        // Selalu manual: step 0 hanya tercapai kalau auto-approval DITOLAK
        // (form manual / ada keyword data pribadi / voucher verifikasi manual).
        callout = 'review_manual';
    } else if (currentStep === 1) {
        // "Disetujui tapi belum punya jendela tayang" secara KONSTRUKSI adalah
        // pendaratan approval manual: jalur auto menulis tanggal + slot sejak
        // checkout (`submitOrder`), dan order auto yang slotnya kedaluwarsa
        // mengambil cabang `isExpired` di atas lebih dulu.
        //
        // Penjaga `isAutoReviewed` tetap dipasang meski cabangnya sudah
        // struktural: ketidakpresisiannya (lihat docstring fungsi itu) hanya
        // bisa salah ke arah "dianggap auto" — dan itu jatuh ke perilaku
        // sekarang, bukan ke peneliti yang terdampar menunggu admin.
        callout = isAutoReviewed(submission) ? 'choose_schedule' : 'awaiting_admin_schedule';
    } else if (currentStep === 2) {
        // too_late_today menang atas payment/awaiting_invoice: menawarkan bayar
        // untuk jadwal yang sudah tidak bisa dikejar cuma memindahkan kekecewaan
        // ke belakang.
        callout = isTooLateToday ? 'too_late_today' : awaitingInvoice ? 'awaiting_invoice' : 'payment';
    } else if (currentStep === 4) {
        callout = 'completed';
    } else {
        // Step 3 (publishing): bedakan sudah live vs menunggu jadwal mulai.
        // Sumbu tayang yang dipakai adalah milik JADWAL yang sedang berlaku
        // (bisa jadwal ke-2 dst.), bukan status order — itulah gunanya
        // memisahkan kedua sumbu.
        const active = eff.activeSchedule ?? first;
        const isLive =
            (active.status || '').toLowerCase() === 'live' ||
            !!(eff.activeStart && eff.activeEnd && eff.activeStart <= now && eff.activeEnd >= now);
        callout = isLive ? 'live' : 'ready_to_launch';
    }

    const needsAction =
        callout === 'revision' ||
        callout === 'expired' ||
        callout === 'too_late_today' ||
        callout === 'extend_payment' ||
        callout === 'choose_schedule' ||
        (callout === 'payment' && !!finalPaymentLink);

    // `awaiting_admin_schedule` sengaja TIDAK masuk `needsAction`: bolanya di
    // admin, jadi ordernya duduk di "Berjalan", bukan berteriak di "Butuh Aksi".
    const group: OrderGroup = callout === 'cancelled'
        ? 'selesai'
        : needsAction
            ? 'butuh-aksi'
            : currentStep === 4
                ? 'selesai'
                : 'berjalan';

    return {
        currentStep,
        eff,
        first,
        later,
        isExpired,
        isSlotCancelled,
        isUserBooked,
        isPaid,
        awaitingInvoice,
        finalPaymentLink,
        paymentDeadline,
        paymentDeadlineCause,
        isTooLateToday,
        callout,
        needsAction,
        group,
    };
}

/**
 * Ringkasan satu order untuk blok ORDER CONTEXT di system prompt Mimin AI.
 * Format kompak, data apa adanya — bot dilarang mengarang di luar ini.
 */
export function describeOrderForChat(submission: FormSubmission, ui: OrderUiState): string {
    const fmt = (d: Date | string | null | undefined) => {
        if (!d) return null;
        const date = d instanceof Date ? d : new Date(d);
        if (isNaN(date.getTime())) return null;
        return date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'Asia/Jakarta',
        });
    };
    /** Jam tayang sebenarnya, dari instant cermin. Kilat didorong bergelombang
     * (08/11/14/17 WIB), jadi "15.00" yang dulu ditulis lurus di sini adalah
     * kalimat yang salah untuk sebagian order — dan Mimin mengulanginya ke user. */
    const fmtWibTime = (d: Date | null) =>
        d
            ? d.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Jakarta',
            })
            : null;

    const statusText: Record<OrderCalloutState, string> = {
        revision: 'perlu revisi karena belum sesuai syarat & ketentuan (mis. menanyakan data pribadi responden); user bisa ajukan ulang dari halaman Order Saya',
        review_manual: 'sedang direview admin (maksimal 2 hari kerja, hari kerja Senin-Jumat)',
        cancelled: 'pesanan DIBATALKAN dan tidak akan tayang; tagihan yang sempat terbit tidak berlaku lagi. Kalau user masih ingin mengiklankan survei ini, ia perlu membuat pesanan baru — bukan mengajukan ulang yang ini',
        choose_schedule: 'sudah disetujui, menunggu user memilih jadwal tayang di halaman Order Saya',
        awaiting_admin_schedule: 'sudah disetujui admin; tim Jakpat yang akan menetapkan jadwal tayang lalu menerbitkan tagihan. User TIDAK perlu memilih jadwal sendiri, cukup menunggu',
        payment: 'menunggu pembayaran dari user',
        awaiting_invoice: 'slot sudah dipesan, menunggu admin menerbitkan tagihan (maksimal 1 hari kerja)',
        expired: 'pembayaran kedaluwarsa sehingga slot dilepas; user perlu memilih jadwal baru dari halaman Order Saya (tidak perlu submit ulang)',
        // ⚠️ JANGAN samakan kalimatnya dengan `expired`. Mimin mengulangi teks ini
        // ke user; menyebut "kedaluwarsa" untuk pembatalan oleh tim akan membuat
        // user mencari kesalahannya sendiri atas keputusan yang bukan miliknya.
        slot_cancelled: 'tanggal tayangnya DIBATALKAN oleh tim Jakpat — bukan kedaluwarsa, dan bukan karena user terlambat. Kuesionernya tetap lolos review, jadi tidak perlu diajukan ulang; tim Jakpat yang akan menjadwalkan ulang. Kalau user butuh penjelasan kenapa dibatalkan, eskalasikan ke tim',
        too_late_today: 'batas pembayaran 14.00 WIB untuk jadwal hari ini sudah lewat sehingga iklan tidak bisa tayang hari ini (halaman iklan disiapkan admin pukul 14.00-15.00); user perlu memilih jadwal baru dari halaman Order Saya (tidak perlu submit ulang)',
        extend_payment: 'ada jadwal iklan berikutnya yang menunggu pembayaran',
        ready_to_launch: 'pembayaran diterima, menunggu jadwal tayang',
        live: 'sedang tayang (diiklankan ke responden Jakpat)',
        completed: 'masa tayang selesai',
    };

    const lines: string[] = [];
    lines.push(`Order "${submission.title}" (layanan ${submission.distribution_type === 'kilat' ? 'Kilat' : 'Regular'})`);
    lines.push(`- Status: ${statusText[ui.callout]}`);

    const start = fmt(ui.eff.activeStart);
    const end = fmt(ui.eff.activeEnd);
    const startTime = fmtWibTime(ui.eff.activeStart);
    if (start && end) {
        lines.push(`- Jadwal tayang: ${start} (mulai ${startTime} WIB) sampai ${end}`);
    } else if (start) {
        lines.push(`- Jadwal tayang mulai: ${start} (${startTime} WIB)`);
    } else {
        lines.push(`- Jadwal tayang: belum ditentukan`);
    }
    if (ui.later.length > 0) {
        lines.push(`- Order ini punya ${ui.later.length + 1} jadwal iklan; yang disebut di atas adalah jadwal yang sedang berlaku`);
    }

    if (ui.callout === 'payment' && ui.paymentDeadline) {
        // Akibatnya beda, jadi jangan satu kalimat: batas 14.00 WIB TIDAK
        // melepas slot, ia hanya membuat tanggalnya tidak terkejar.
        const akibat = ui.paymentDeadlineCause === 'slot'
            ? 'slot dilepas jika lewat'
            : 'lewat dari itu tanggal tayangnya harus diganti';
        lines.push(
            `- Pembayaran: menunggu, batas waktu ${ui.paymentDeadline.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB hari ini (${akibat})`
        );
    } else if (ui.callout === 'payment') {
        lines.push(`- Pembayaran: menunggu (link pembayaran tersedia di halaman Order Saya)`);
    } else if (ui.isPaid) {
        lines.push(`- Pembayaran: lunas`);
    }

    if (submission.created_at) {
        lines.push(`- Diajukan: ${fmt(submission.created_at)}`);
    }

    return lines.join('\n');
}
