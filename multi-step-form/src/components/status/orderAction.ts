import type { ScheduleCard } from './airingPeriods';

/**
 * SATU-SATUNYA tempat yang memutuskan "tombol apa yang boleh dilihat peneliti untuk jadwal ini".
 *
 * Dulu keputusan ini tersebar di cabang-cabang `ScheduleBanner` (SchedulePhase.tsx). Kartu ringkas
 * ponsel butuh jawaban yang SAMA — dan menulis ulang aturannya di sana berarti dua salinan aturan
 * uang yang bisa menyimpang diam-diam: tombol Bayar muncul untuk anggota grup yang bukan lead,
 * untuk tagihan basi, atau untuk jadwal yang sudah mati. Banner dan kartu ringkas kini sama-sama
 * memanggil fungsi ini; yang berbeda cuma cara menggambarnya.
 */
export type PayLabelVariant = 'full' | 'partial' | 'group';

export type PrimaryAction =
    /** Pilih tanggal untuk jadwal yang belum bertanggal (jalur auto-review). */
    | { kind: 'choose_schedule' }
    /** Ganti tanggal jadwal yang terlewat / kedaluwarsa (jalur auto-review, jadwal pertama). */
    | { kind: 'reschedule' }
    /** Bayar. `groupTotal` hanya terisi untuk tagihan gabungan — angka DI TOMBOL adalah total
     *  grup (yang ditagih DOKU), bukan porsi jadwal ini. */
    | { kind: 'pay'; href: string; external: boolean; label: PayLabelVariant; groupTotal?: number }
    /** Anggota grup yang bukan lead: tak punya tombol bayar, hanya menunjuk ke tagihan gabungan. */
    | { kind: 'view_bill'; to: string };

export function primaryActionOf(
    card: ScheduleCard,
    ctx: { canSelfReschedule: boolean },
): PrimaryAction | null {
    const b = card.booking;
    switch (b.state) {
        // `canSelfReschedule` false di sini = reservasi mandiri ditutup (sql/125):
        // state ini hanya lahir untuk jalur auto-review, jadi satu-satunya alasan
        // peneliti tak boleh memilih adalah saklar admin.
        case 'choose_schedule':
            return ctx.canSelfReschedule ? { kind: 'choose_schedule' } : null;

        // Tombol jadwal-ulang hanya untuk jadwal pertama jalur auto-review. Jadwal ke-2 dst. tidak
        // punya alur pemilihan tanggal mandiri, dan order jalur manual tanggalnya milik admin
        // (keputusan produk 2026-08-25). `slot_cancelled` SENGAJA tak di sini: tombol jadwal-ulang
        // akan menghidupkan kembali jadwal yang baru dibatalkan tim.
        case 'expired':
        case 'too_late_today':
            return card.kind === 'original' && ctx.canSelfReschedule ? { kind: 'reschedule' } : null;

        case 'waiting_payment':
        case 'airing_on_credit': {
            // Anggota grup yang bukan lead TIDAK punya tombol bayar: link DOKU-nya menagih total
            // grup, sementara kartu ini hanya tahu porsinya sendiri.
            if (b.group && !b.group.isLead) {
                return { kind: 'view_bill', to: `/invoices/${b.group.paymentId}` };
            }
            if (!b.payUrl) return null;
            const isPartial = b.paid > 0 && b.outstanding > 0;
            return {
                kind: 'pay',
                href: b.payUrl,
                external: b.isExternalLink,
                label: b.group ? 'group' : isPartial ? 'partial' : 'full',
                groupTotal: b.group?.total,
            };
        }

        default:
            return null;
    }
}
