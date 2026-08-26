import { describe, it, expect } from 'vitest';
import { shouldSend, schedulePaid } from './notify-schedule-change.js';

/*
  Yang dijaga di sini SATU hal, dan ia bernilai 136 email:

  `ad_schedules.status = 'cancelled'` KELEBIHAN MUATAN. Diukur di produksi
  2026-08-26 — 110 baris sebenarnya spam, 15 ditolak, 9 order dibatalkan, dan
  hanya 1 yang benar-benar "tim membatalkan tanggal tayang". Ketiga yang pertama
  sudah punya emailnya sendiri lewat `notify-review-result`.

  Gerbang yang benar butuh DUA sumbu: tayang `cancelled` DAN review `approved`
  (kontrak sql/62 — membatalkan slot tidak mencabut kelulusan review). Aturan
  itu terlihat seperti sesuatu yang bisa dipersingkat jadi satu perbandingan,
  dan itulah kenapa ia diuji.
*/

const sched = (over = {}) => ({
    status: 'cancelled',
    review_status: 'approved',
    payment_status: 'expired',
    start_date: '2026-09-03T08:00:00.000Z',
    slot_booked_by: null,
    ...over,
});

describe('shouldSend — pembatalan jadwal', () => {
    it('mengirim untuk slot_cancelled: tayang cancelled + review approved', () => {
        expect(shouldSend(sched(), 'cancelled')).toEqual({ send: true });
    });

    it.each([
        ['spam', 'spam'],
        ['ditolak', 'rejected'],
        ['order dibatalkan', 'cancelled'],
    ])('MENOLAK order %s — itu sudah punya emailnya sendiri', (_label, reviewStatus) => {
        const res = shouldSend(sched({ review_status: reviewStatus }), 'cancelled');
        expect(res.send).toBe(false);
        expect(res.reason).toBe('not_slot_cancelled');
    });

    it('menolak jadwal yang sumbu tayangnya belum cancelled sama sekali', () => {
        const res = shouldSend(sched({ status: 'waiting_payment' }), 'cancelled');
        expect(res.send).toBe(false);
        expect(res.reason).toBe('not_slot_cancelled');
    });
});

describe('shouldSend — tanggal digeser', () => {
    const moved = (over = {}) => sched({ status: 'waiting_payment', ...over });

    it('mengirim untuk jadwal yang dipindah admin', () => {
        expect(shouldSend(moved({ slot_booked_by: 'admin' }), 'moved')).toEqual({ send: true });
    });

    it('MENOLAK saat penelitinya menjadwalkan ulang sendiri', () => {
        const res = shouldSend(moved({ slot_booked_by: 'user' }), 'moved');
        expect(res.send).toBe(false);
        expect(res.reason).toBe('self_rescheduled');
    });

    it('tetap mengirim untuk jadwal LUNAS meski slot_booked_by masih "user"', () => {
        // `prepareForReschedule` menolak order lunas, jadi yang memindahkannya
        // pasti admin — kolom itu cuma sisa reservasi awal si peneliti.
        const res = shouldSend(moved({ slot_booked_by: 'user', payment_status: 'paid' }), 'moved');
        expect(res).toEqual({ send: true });
    });

    it('menolak jadwal yang sudah dibatalkan — ia tidak "pindah"', () => {
        const res = shouldSend(sched(), 'moved');
        expect(res.send).toBe(false);
        expect(res.reason).toBe('no_live_date');
    });

    it('menolak jadwal tanpa tanggal — tidak ada yang bisa dikabarkan', () => {
        const res = shouldSend(moved({ start_date: null }), 'moved');
        expect(res.send).toBe(false);
        expect(res.reason).toBe('no_live_date');
    });
});

describe('schedulePaid — cerminan isSchedulePaid di klien', () => {
    it.each(['paid', 'scheduled', 'live', 'completed'])('sumbu tayang %s dihitung lunas', (status) => {
        expect(schedulePaid({ status, payment_status: 'pending' })).toBe(true);
    });

    it('payment_status paid cukup walau sumbu tayangnya tertinggal', () => {
        expect(schedulePaid({ status: 'waiting_payment', payment_status: 'paid' })).toBe(true);
    });

    it('menunggu bayar bukan lunas', () => {
        expect(schedulePaid({ status: 'waiting_payment', payment_status: 'pending' })).toBe(false);
    });
});
