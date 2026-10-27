import { describe, it, expect } from 'vitest';
import { getSubmissionActionDot } from './lifecycle';
import type { LifecycleInfo } from './lifecycle';

/*
  P5 — titik notifikasi baris Submissions berhenti menagih sumbu HALAMAN.

  Dua janji yang dijaga di sini:

    1. Pekerjaan halaman tidak lagi melahirkan titik. Admin yang melayani
       reservasi bukan orang yang membuat halaman; alarmnya pindah ke papan
       Jadwal.
    2. Cabang ABU "slot kedaluwarsa" akhirnya terjangkau. Cabang halaman dulu
       duduk DI ANTARA dua cabang `isScheduleActive`, jadi order kedaluwarsa
       yang bannernya masih bawaan mendapat titik MERAH halaman — menutupi abu
       yang seharusnya muncul.
*/

const lifecycleOf = (over: Partial<LifecycleInfo> = {}): LifecycleInfo => ({
    stage: 'reserved',
    displayStatus: 'approved',
    isPaid: false,
    isRejectedEvent: false,
    isLegacyActive: false,
    isActuallyExpired: false,
    hasValidSchedule: true,
    isPending: false,
    canReserveSlot: true,
    canPay: true,
    canBuildPage: false,
    pageStatus: 'none',
    slotExpiresAt: null,
    needsScheduleFollowUp: false,
    ...over,
});

/*
  26 Okt 2026 — titik MERAH = order yang dihitung badge tab Iklan/Kilat
  (`fetchAdminQueue`), tidak lebih. `queueReason` adalah satu-satunya
  pemicunya; di luar antrean titik paling banter ABU (bolanya di peneliti).
*/
describe('getSubmissionActionDot — merah hanya dari antrean admin', () => {
    it.each([
        ['review', 'Perlu tindakan di tab Review'],
        ['schedule', 'Perlu tindakan: Tetapkan jadwal'],
        ['invoice', 'Perlu tindakan: Reservasi tanpa tagihan hidup'],
        ['broadcast', 'Perlu tindakan: Matikan siaran Kilat (live > 24 jam)'],
    ] as const)('alasan %s → MERAH berlabel', (reason, label) => {
        expect(getSubmissionActionDot(lifecycleOf({ stage: 'paid', isPaid: true }), reason)).toEqual({ type: 'red', label });
    });

    it('tanpa alasan antrean, tidak ada keadaan yang memberi MERAH', () => {
        const states: Partial<LifecycleInfo>[] = [
            { displayStatus: 'in_review' },
            { displayStatus: 'rejected' },
            {},
            { isActuallyExpired: true },
            { stage: 'reserved_expired' },
            { stage: 'paid', isPaid: true, needsScheduleFollowUp: true },
        ];
        for (const over of states) {
            expect(getSubmissionActionDot(lifecycleOf(over))?.type).not.toBe('red');
        }
    });

    it('order DITOLAK → ABU "Menunggu perbaikan peneliti"', () => {
        expect(getSubmissionActionDot(lifecycleOf({ displayStatus: 'rejected' })))
            .toEqual({ type: 'gray', label: 'Menunggu perbaikan peneliti' });
    });

    it('in_review di luar antrean (artefak bertanggal pra-review) → tanpa titik', () => {
        expect(getSubmissionActionDot(lifecycleOf({ displayStatus: 'in_review' }))).toBeNull();
    });

    it('order yang menunggu pembayaran peneliti memberi ABU', () => {
        const dot = getSubmissionActionDot(lifecycleOf({ stage: 'awaiting_payment', isPending: true, isActuallyExpired: false }));
        expect(dot).toEqual({ type: 'gray', label: 'Menunggu pembayaran peneliti' });
    });

    it('slot kedaluwarsa di luar antrean → ABU', () => {
        expect(getSubmissionActionDot(lifecycleOf({ isActuallyExpired: true })))
            .toEqual({ type: 'gray', label: 'Slot kedaluwarsa' });
    });

    it('order lunas — halaman draft atau banner bawaan — TIDAK memberi titik (P5)', () => {
        expect(getSubmissionActionDot(lifecycleOf({
            stage: 'paid', isPaid: true, canBuildPage: true, pageStatus: 'drafted',
        }))).toBeNull();
        expect(getSubmissionActionDot(lifecycleOf({
            stage: 'live', isPaid: true, canBuildPage: true, pageStatus: 'live',
        }))).toBeNull();
    });

    it('order spam / dibatalkan tetap senyap', () => {
        expect(getSubmissionActionDot(lifecycleOf({ displayStatus: 'spam' }))).toBeNull();
        expect(getSubmissionActionDot(lifecycleOf({ stage: 'cancelled' }))).toBeNull();
    });
});
