import type { TranslationKey } from '@/i18n/translations';
import { extendStatusLabelKey } from '@/utils/extend-ui';
import { pickDefaultExpandedKey, type ScheduleCard } from './airingPeriods';
import type { OrderCalloutState } from './deriveOrderUiState';
import { primaryActionOf, type PrimaryAction } from './orderAction';

/**
 * Ringkasan satu order untuk KARTU RINGKAS ponsel: "sekarang di mana, dan apa langkahku".
 *
 * Murni dan tanpa teks jadi — hanya kunci terjemahan + data — supaya aturannya bisa diuji tanpa
 * merender apa pun. Judulnya SENGAJA memakai kunci yang sama dengan banner di dalam kartu
 * (`bannerTitle*`, `reviewTitle*`): kartu ringkas dan kartu terbuka tidak boleh berbicara dua
 * bahasa tentang keadaan yang sama. Tombolnya datang dari `primaryActionOf`, bukan aturan baru.
 */
export type SummaryTone = 'amber' | 'slate' | 'emerald' | 'blue';

export type SummaryDetail =
    /** Rentang tanggal tayang, sudah diformat `ScheduleCard.dateRange`. */
    | { kind: 'dateRange'; text: string }
    /** Tenggat bayar — hanya bila benar-benar ada (aturan emas yang sama dengan banner). */
    | { kind: 'payBefore'; deadline: Date; cause: 'slot' | 'cutoff' | 'bill' };

export interface OrderSummary {
    tone: SummaryTone;
    titleKey: TranslationKey;
    detail: SummaryDetail | null;
    /** Tombol utama, atau `open_detail` (perbaiki kuesioner: tempatnya ada di dalam kartu), atau tak ada. */
    action: PrimaryAction | { kind: 'open_detail' } | null;
    /** Jadwal LAIN di order ini yang juga punya tombol — supaya yang tersembunyi tidak dilupakan. */
    moreNeedAction: number;
}

export function orderSummaryOf(
    callout: OrderCalloutState,
    cards: ScheduleCard[],
    ctx: { canSelfReschedule: boolean },
): OrderSummary | null {
    // Order mati ada di Fase ① — kartu jadwal tak relevan (atau tak ada).
    if (callout === 'cancelled') {
        return { tone: 'slate', titleKey: 'reviewTitleCancelled', detail: null, action: null, moreNeedAction: 0 };
    }
    if (callout === 'revision') {
        return { tone: 'amber', titleKey: 'reviewTitleRejected', detail: null, action: { kind: 'open_detail' }, moreNeedAction: 0 };
    }
    if (cards.length === 0) return null;

    const key = pickDefaultExpandedKey(cards);
    const card = cards.find((c) => c.key === key) ?? cards[0];
    const b = card.booking;
    const isPartial = b.paid > 0 && b.outstanding > 0;
    const action = primaryActionOf(card, ctx);

    let tone: SummaryTone = 'slate';
    let titleKey: TranslationKey;

    switch (b.state) {
        case 'in_review':
            titleKey = 'bannerTitleInReview'; break;
        case 'choose_schedule':
            tone = 'amber'; titleKey = 'bannerTitleChooseSchedule'; break;
        case 'awaiting_admin_schedule':
            titleKey = 'bannerTitleAwaitingAdminSchedule'; break;
        case 'awaiting_invoice':
            // Tagihan basi (jadwal dipindah sesudah tagihan terbit) menyalakan amber, sama seperti banner.
            if (b.staleBilledFor && card.startDate) { tone = 'amber'; titleKey = 'bannerTitleStaleInvoice'; }
            else titleKey = 'bannerTitleAwaitingInvoice';
            break;
        case 'waiting_payment':
            if (b.group && !b.group.isLead) titleKey = 'groupBillFollowerTitle';
            else { tone = 'amber'; titleKey = isPartial ? 'bannerTitleWaitingPaymentPartial' : 'bannerTitleWaitingPayment'; }
            break;
        case 'airing_on_credit':
            tone = 'amber';
            titleKey = b.creditPhase === 'stopped' ? 'bannerTitleCreditStopped'
                : b.creditPhase === 'ended' ? 'bannerTitleCreditEnded'
                : 'bannerTitleAiringOnCredit';
            break;
        case 'slot_cancelled':
            titleKey = 'bannerTitleSlotCancelled'; break;
        case 'expired':
            tone = 'amber'; titleKey = 'bannerTitleExpired'; break;
        case 'too_late_today':
            tone = 'amber';
            titleKey = card.startDate && card.startDate.getTime() < Date.now() ? 'bannerTitleScheduleMissed' : 'bannerTitleTooLateToday';
            break;
        case 'cancelled':
            titleKey = 'bannerTitleCancelledSchedule'; break;
        case 'paid':
        default: {
            // Lunas: yang diceritakan adalah PENAYANGANNYA (terjadwal / tayang / selesai).
            const pub = card.publication.state;
            tone = pub === 'scheduled' ? 'blue' : pub === 'completed' ? 'slate' : 'emerald';
            titleKey = extendStatusLabelKey(pub === 'none' ? 'paid' : pub);
        }
    }

    let detail: SummaryDetail | null = null;
    if (b.state === 'waiting_payment' && b.deadline && b.deadlineCause && !(b.group && !b.group.isLead)) {
        detail = { kind: 'payBefore', deadline: b.deadline, cause: b.deadlineCause };
    } else if (card.startDate && card.dateRange) {
        detail = { kind: 'dateRange', text: card.dateRange };
    }

    const moreNeedAction = cards.filter((c) => c.key !== card.key && primaryActionOf(c, ctx) !== null).length;

    return { tone, titleKey, detail, action, moreNeedAction };
}
