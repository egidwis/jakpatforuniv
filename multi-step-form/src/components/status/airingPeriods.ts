import type { AdScheduleEntry } from '@/utils/supabase';
import type { TranslationKey } from '@/i18n/translations';
import {
    orderStepOf,
    scheduleEnd,
    scheduleStart,
    type SchedulePaymentMap,
} from './scheduleAxes';
import { airingDaysOf } from '@/pages/dashboard/schedule/scheduleModel';
import type { OrderUiState } from './deriveOrderUiState';

type TFn = (key: TranslationKey) => string;

export type BookingState =
    /** Order sudah masuk (Booking ID terbit) tapi masih menunggu review admin —
     * belum ada jadwal, belum ada tagihan. Kartu tampil netral abu-abu. */
    | 'in_review'
    | 'choose_schedule'
    | 'awaiting_invoice'
    | 'waiting_payment'
    | 'expired'
    /** Jadwalnya hari ini tapi batas bayar 14.00 WIB sudah lewat. Sengaja
     * dipisah dari `expired` — sebabnya beda (slot tidak dilepas, yang habis
     * adalah waktu admin menyiapkan halaman iklan), jadi copy-nya beda. */
    | 'too_late_today'
    | 'paid'
    | 'cancelled';

export type PublicationState = 'none' | 'scheduled' | 'live' | 'completed';

export interface IncentiveInfo {
    mode: 'plain' | 'new_pool' | 'accumulated' | 'none_same_period';
    winnerCount?: number;
    prizePerWinner?: number;
    additionalPrize?: number;
}

/**
 * Satu jadwal iklan (jendela tayang) — jadwal asli maupun perpanjangan —
 * sebagai unit setara membawa tiga blok data sendiri: Info (administrasi),
 * Booking & Pembayaran, dan Penayangan. Menggantikan model stepper: tidak
 * ada lagi konsep "langkah" abstrak, tiap fakta membawa rumahnya sendiri.
 */
export interface ScheduleCard {
    key: string; // 'original' untuk jadwal pertama, `sourceId` untuk sisanya
    kind: 'original' | 'extend';
    label: string;
    /** 1, 2, 3, ... — dipakai di trigger accordion sebagai "#1" dkk, supaya
     * tidak mengulang kata "Jadwal Iklan" yang sudah jadi judul fase. */
    ordinal: number;
    dateRange: string;
    startDate: Date | null;
    endDate: Date | null;
    info: {
        /** Kode yang dilihat & disalin peneliti, dan yang dicari admin — kolom
         * `ad_schedules.booking_id` (sql/51). Sengaja MENGGANTIKAN `id` yang dulu
         * di sini: field itu berisi `sourceId`, yang untuk jadwal ke-2 dst. bukan
         * kode yang sama dengan yang ditampilkan admin. */
        bookingId: string;
        createdAt: string | null;
        /** Kolom `duration` APA ADANYA. Dipakai untuk UANG saja (harga memang
         * dihitung dari durasi yang dipesan). JANGAN dipakai menjawab "berapa hari
         * iklan ini tayang" — pakai `airingDays`. */
        duration: number;
        /** Panjang tayang SEBENARNYA, diturunkan dari start→end (akhir-eksklusif,
         * lewat `airingDaysOf`).
         *
         * Kolom `duration` tidak dijamin sepakat dengan jendelanya: terukur 18 dari
         * 992 baris `ad_schedules` di produksi (2026-08-09) meleset, satu di antaranya
         * tayang 18 hari tetapi kolomnya berbunyi 1. Merender kolom itu di sebelah
         * rentang tanggal memajang dua angka yang saling menyangkal — dan yang salah
         * adalah kolomnya, karena kuota harian & papan kapasitas semuanya menghitung
         * dari jendela. */
        airingDays: number;
        periodBatch: string | null;
        incentive: IncentiveInfo | null;
        voucherCode: string | null;
    };
    booking: {
        state: BookingState;
        /** Nominal yang DITAGIH (sudah termasuk PPN utk order pasca-21 Jul 2026) */
        amount: number;
        /** DPP sebelum PPN. `null` untuk order pra-PPN — di situ `amount` memang
         * sudah harga bersih tanpa pajak, jadi tidak ada yang perlu dipisah. */
        subtotal: number | null;
        payUrl: string | null;
        isExternalLink: boolean;
        /** Deadline bayar efektif (lihat `deriveOrderUiState`) */
        deadline: Date | null;
        /** Konsekuensi kalau deadline lewat — menentukan kalimat bannernya */
        deadlineCause: 'slot' | 'cutoff' | null;
        invoicePaymentId: string | null;
        isPaidForLabel: boolean; // menentukan label "Invoice" vs "Kwitansi"
    };
    publication: {
        state: PublicationState;
        start: Date | null;
        end: Date | null;
    };
}

const fmtShort = (d: Date | null) =>
    d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—';

function buildIncentive(s: AdScheduleEntry): IncentiveInfo | null {
    if (s.ordinal > 1) {
        if (s.isNewPeriod && s.prizePerWinner > 0) {
            return { mode: 'new_pool', winnerCount: s.winnerCount, prizePerWinner: s.prizePerWinner };
        }
        if (s.additionalPrizePerWinner > 0) {
            return { mode: 'accumulated', additionalPrize: s.additionalPrizePerWinner };
        }
        return { mode: 'none_same_period' };
    }
    if (s.winnerCount && s.prizePerWinner) {
        return { mode: 'plain', winnerCount: s.winnerCount, prizePerWinner: s.prizePerWinner };
    }
    return null;
}

/** DPP hanya punya arti kalau PPN memang pernah dihitung untuk jadwal ini —
 *  order pra-`sql/34` menyimpan harga bersih di `totalCost` tanpa pajak. */
const subtotalOf = (s: AdScheduleEntry) => (s.ppnAmount != null ? s.subtotal ?? null : null);

/**
 * Susun daftar jadwal iklan sebagai unit setara, langsung dari baris
 * `ad_schedules` — baris yang sama persis dengan yang dilihat admin di papan
 * Schedule. Sebelum Task 9B kartu ini dirakit dari dua tabel dengan tipe waktu
 * dan kosakata status berbeda, jadi "Jadwal Iklan 2" di layar peneliti dan di
 * layar admin adalah dua hitungan yang kebetulan bertemu.
 *
 * Jadwal pertama terbit sejak order masuk (step >= 0), termasuk selagi menunggu
 * review: Booking ID, tanggal submit, hadiah, dan seluruh angka biaya sudah
 * final sejak checkout, jadi tidak ada alasan menahannya. Yang belum ada di
 * step 0 cuma jadwal tayang & tagihan. Hanya order yang ditolak (step -1) yang
 * tidak punya kartu sama sekali.
 */
export function buildScheduleCards(
    ui: OrderUiState,
    payments: SchedulePaymentMap,
    invoiceId: string | null,
    t: TFn
): ScheduleCard[] {
    const now = new Date();
    const cards: ScheduleCard[] = [];
    const first = ui.first;
    const later = ui.later;
    const rawStep = orderStepOf(first, now);
    const totalPeriods = 1 + later.length;

    if (rawStep >= 0 || ui.isExpired) {
        const step = ui.isExpired ? 1 : rawStep;
        const oStart = scheduleStart(first);
        const oEnd = scheduleEnd(first);

        let bookingState: BookingState;
        if (ui.isExpired) bookingState = 'expired';
        else if (step === 0) bookingState = 'in_review';
        else if (step === 1) bookingState = 'choose_schedule';
        else if (step === 2) {
            // Lewat batas 14.00 WIB menang atas waiting_payment/awaiting_invoice:
            // jadwal ini sudah tidak bisa dikejar, jadi jangan tawarkan bayar.
            bookingState = ui.isTooLateToday
                ? 'too_late_today'
                : ui.finalPaymentLink ? 'waiting_payment' : 'awaiting_invoice';
        } else bookingState = 'paid'; // step 3 atau 4

        let pubState: PublicationState = 'none';
        if (bookingState === 'paid') {
            if (step === 4) pubState = 'completed';
            else {
                const isLive =
                    (first.status || '').toLowerCase() === 'live' ||
                    !!(oStart && oEnd && oStart <= now && oEnd >= now);
                pubState = isLive ? 'live' : 'scheduled';
            }
        }

        cards.push({
            key: 'original',
            kind: 'original',
            label: totalPeriods > 1 ? `${t('airingPeriodLabel')} 1` : t('airingPeriodLabel'),
            ordinal: 1,
            dateRange: oStart || oEnd ? `${fmtShort(oStart)}–${fmtShort(oEnd)}` : '—',
            startDate: oStart,
            endDate: oEnd,
            info: {
                bookingId: first.bookingId,
                createdAt: first.createdAt,
                duration: first.duration ?? 0,
                airingDays: airingDaysOf(first).length,
                periodBatch: first.periodBatch,
                incentive: buildIncentive(first),
                voucherCode: first.voucherCode,
            },
            booking: {
                state: bookingState,
                amount: first.totalCost,
                subtotal: subtotalOf(first),
                payUrl: bookingState === 'waiting_payment' ? ui.finalPaymentLink : null,
                isExternalLink: !!ui.finalPaymentLink && !ui.finalPaymentLink.startsWith('/dashboard'),
                deadline: ui.paymentDeadline,
                deadlineCause: ui.paymentDeadlineCause,
                // Belum lolos review = belum ada tagihan; jangan tampilkan baris
                // Invoice walau ada baris nyasar di tabel transactions.
                invoicePaymentId: bookingState === 'in_review' ? null : invoiceId,
                isPaidForLabel: bookingState === 'paid' || ui.isPaid,
            },
            publication: {
                state: pubState,
                start: oStart,
                end: oEnd,
            },
        });
    }

    // Nomor urutnya datang dari `ordinal` cermin, bukan dari posisi di array:
    // `resync_ad_schedule_ordinals()` sudah menomori ulang tiap kali sebuah
    // jadwal disisipkan dengan tanggal lebih awal, jadi inilah nomor yang sama
    // dengan yang dilihat admin di papan Schedule.
    later.forEach((s) => {
        const pay = payments[s.sourceId] || null;
        const status = (s.status || 'waiting_payment').toLowerCase();
        const start = scheduleStart(s);
        const end = scheduleEnd(s);

        let bookingState: BookingState;
        if (status === 'cancelled') bookingState = 'cancelled';
        else if (status === 'waiting_payment') {
            if (pay?.status === 'expired') bookingState = 'expired';
            else if (pay?.status === 'pending' && pay.paymentUrl) bookingState = 'waiting_payment';
            else bookingState = 'awaiting_invoice'; // admin belum menerbitkan tagihannya
        } else {
            bookingState = 'paid';
        }

        let pubState: PublicationState = 'none';
        if (bookingState === 'paid') {
            if (status === 'completed') pubState = 'completed';
            else if (status === 'live') pubState = 'live';
            else if (end && end < now) pubState = 'completed';
            else if (start && end && start <= now && end >= now) pubState = 'live';
            else pubState = 'scheduled';
        }

        cards.push({
            key: s.sourceId,
            kind: 'extend',
            label: `${t('airingPeriodLabel')} ${s.ordinal}`,
            ordinal: s.ordinal,
            dateRange: start || end ? `${fmtShort(start)}–${fmtShort(end)}` : '—',
            startDate: start,
            endDate: end,
            info: {
                bookingId: s.bookingId,
                createdAt: s.createdAt,
                duration: s.duration ?? 0,
                airingDays: airingDaysOf(s).length,
                periodBatch: s.periodBatch,
                incentive: buildIncentive(s),
                voucherCode: s.voucherCode,
            },
            booking: {
                state: bookingState,
                amount: pay?.amount || s.totalCost,
                subtotal: subtotalOf(s),
                payUrl: bookingState === 'waiting_payment' ? pay?.paymentUrl || null : null,
                isExternalLink: true,
                deadline: null,
                deadlineCause: null,
                invoicePaymentId: pay?.paymentId || null,
                isPaidForLabel: bookingState === 'paid',
            },
            publication: {
                state: pubState,
                start,
                end,
            },
        });
    });

    return cards;
}

/**
 * Kartu yang terbuka default di Fase ② (Jadwal Iklan): yang paling butuh
 * perhatian user dari sisi booking/pembayaran. Prioritas publikasi (tayang/
 * terjadwal/selesai) bukan urusan fase ini lagi — itu milik `pickPublicationHighlight`
 * di Fase ③.
 * Prioritas: butuh bayar > kartu pertama yang belum dibatalkan.
 */
export function pickDefaultExpandedKey(cards: ScheduleCard[]): string {
    const needsPay = cards.find(
        (c) =>
            c.booking.state === 'waiting_payment' ||
            c.booking.state === 'expired' ||
            c.booking.state === 'too_late_today'
    );
    if (needsPay) return needsPay.key;

    return cards.find((c) => c.booking.state !== 'cancelled')?.key || cards[0]?.key || 'original';
}

/**
 * Kartu yang paling relevan untuk chip heading Fase ③ (Penayangan).
 * Prioritas: sedang tayang > terjadwal terdekat > selesai terakhir.
 */
export function pickPublicationHighlight(cards: ScheduleCard[]): { state: PublicationState; card: ScheduleCard } | null {
    const live = cards.find((c) => c.publication.state === 'live');
    if (live) return { state: 'live', card: live };

    const now = Date.now();
    const upcoming = cards
        .filter((c) => c.publication.state === 'scheduled' && c.startDate && c.startDate.getTime() > now)
        .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime())[0];
    if (upcoming) return { state: 'scheduled', card: upcoming };

    const lastCompleted = cards
        .filter((c) => c.publication.state === 'completed' && c.endDate)
        .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime())[0];
    if (lastCompleted) return { state: 'completed', card: lastCompleted };

    return null;
}
