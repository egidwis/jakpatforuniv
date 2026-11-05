import { describe, it, expect } from 'vitest';
import {
    alarmLabel, broadcastSummary, filterParticipants, groupCounts, participantCsv, participantGroup,
    participantStats, reminderStatus, ticketEmailState, unpaidLabel, emailHistoryFor,
    type AdminBroadcast, type AdminDelivery, type AdminWebinarOrder,
} from './webinarParticipants';

const NOW = Date.parse('2026-11-10T03:00:00Z'); // Sel 10 Nov 10.00 WIB
const MIN = 60_000;
const HOUR = 60 * MIN;

function order(over: Partial<AdminWebinarOrder> = {}): AdminWebinarOrder {
    return {
        id: 'o-1', event_id: 'ev', kind: 'live', status: 'paid', auth_user_id: 'u',
        buyer_name: 'Putra Kurniawan', buyer_email: 'tegar@jakpat.net', buyer_phone: '0812', buyer_university: 'UIU',
        buyer_major: 'Teknik', buyer_status: 'Mahasiswa', buyer_referral: null, marketing_consent: true,
        consent_at: '2026-11-05T05:40:00Z', invoice_number: 'WBN-E1642A9A-1793856539227', amount: 49000,
        discount_amount: 0, voucher_code: null, paid_at: '2026-11-05T05:47:00Z', paid_via: 'webhook',
        payment_channel: 'QRIS', payment_expires_at: '2026-11-05T06:17:00Z', hold_until: null,
        created_at: '2026-11-05T05:45:00Z', ticket_code: '7F3A91B2C4', join_url: 'https://x/webinar/gabung/a',
        alarm_outcome: null, ticket_email_sent_at: '2026-11-05T05:48:00Z', ticket_email_error: null,
        ticket_email_claimed_at: null, refunded_at: null, refunded_by: null, refund_note: null, last_status_check_at: null,
        ...over,
    };
}

const PAID = order();
const PAID_NO_CONSENT = order({ id: 'o-2', buyer_name: 'Sari Wulandari', buyer_email: 'sari@gmial.com', marketing_consent: false, consent_at: null, amount: 39200, discount_amount: 9800, voucher_code: 'JFU20', ticket_code: '91B2C47F3A', invoice_number: 'WBN-0B0B0B0B-1793856539227' });
const PENDING = order({ id: 'o-3', status: 'pending', buyer_name: 'Dewi', paid_at: null, ticket_code: null, join_url: null, payment_expires_at: new Date(NOW + 12 * MIN).toISOString() });
const REFUNDED = order({ id: 'o-4', status: 'refunded', buyer_name: 'Rina', refunded_at: '2026-11-07T03:02:00Z', refund_note: 'Bentrok "jadwal"', join_url: null });
const ALL = [PAID, PAID_NO_CONSENT, PENDING, REFUNDED];

describe('kelompok & statistik', () => {
    it('chip: lunas / belum bayar / refund', () => {
        expect(ALL.map(participantGroup)).toEqual(['paid', 'paid', 'unpaid', 'refunded']);
        expect(participantGroup(order({ status: 'expired' }))).toBe('unpaid');
        expect(participantGroup(order({ status: 'cancelled' }))).toBe('unpaid');
        expect(groupCounts(ALL)).toEqual({ paid: 2, unpaid: 1, refunded: 1 });
    });

    it('statistik: lunas, ditahan dari keadaan penjualan, izin kontak & pendapatan hanya tiket lunas', () => {
        expect(participantStats(ALL, { state: 'on_sale', sold: 2, held: 1 })).toEqual({ paid: 2, held: 1, consent: 1, revenue: 88200 });
    });

    it('cari nama, email, kode tiket, invoice, atau WhatsApp, tanpa peduli huruf besar', () => {
        expect(filterParticipants(ALL, 'paid', 'SARI').map((o) => o.id)).toEqual(['o-2']);
        expect(filterParticipants(ALL, 'paid', '7f3a91').map((o) => o.id)).toEqual(['o-1']);
        expect(filterParticipants(ALL, 'unpaid', '').map((o) => o.id)).toEqual(['o-3']);
        expect(filterParticipants(ALL, 'paid', 'e1642a9a').map((o) => o.id)).toEqual(['o-1']);
        expect(filterParticipants(ALL, 'refunded', 'rina').map((o) => o.id)).toEqual(['o-4']);
    });
});

describe('label', () => {
    it('e-tiket: terkirim / gagal / sedang dikirim / belum', () => {
        expect(ticketEmailState(PAID, NOW)).toBe('sent');
        expect(ticketEmailState(order({ ticket_email_sent_at: null, ticket_email_error: 'bounce' }), NOW)).toBe('failed');
        expect(ticketEmailState(order({ ticket_email_sent_at: null, ticket_email_claimed_at: new Date(NOW - 2 * MIN).toISOString() }), NOW)).toBe('sending');
        expect(ticketEmailState(order({ ticket_email_sent_at: null, ticket_email_claimed_at: new Date(NOW - 11 * MIN).toISOString() }), NOW)).toBe('pending');
        expect(ticketEmailState(PENDING, NOW)).toBeNull();
    });

    it('alarm pembayaran', () => {
        expect(alarmLabel('webinar_duplicate_paid')).toBe('Bayar dobel');
        expect(alarmLabel('webinar_over_quota')).toBe('Lewat kuota');
        expect(alarmLabel('webinar_paid_on_cancelled')).toBe('Bayar sesudah batal');
        expect(alarmLabel(null)).toBeNull();
    });

    it('belum bayar: sisa menit, kedaluwarsa (link mati walau status masih pending), dibatalkan', () => {
        expect(unpaidLabel(PENDING, NOW)).toBe('Menunggu bayar · sisa 12 mnt');
        expect(unpaidLabel(order({ status: 'pending', payment_expires_at: '2026-11-05T07:10:00Z' }), NOW)).toBe('Kedaluwarsa 5 Nov 14.10');
        expect(unpaidLabel(order({ status: 'expired', payment_expires_at: '2026-11-05T07:10:00Z' }), NOW)).toBe('Kedaluwarsa 5 Nov 14.10');
        expect(unpaidLabel(order({ status: 'cancelled' }), NOW)).toBe('Dibatalkan');
    });
});

describe('email otomatis', () => {
    const event = { status: 'published' as const, offer_kind: 'live' as const, starts_at: '2026-11-17T01:30:00Z', duration_minutes: 90 };
    const counts = (over: Partial<AdminBroadcast['counts']> = {}) => ({ queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, ...over });
    const reminder = (over: Partial<AdminBroadcast> = {}): AdminBroadcast => ({
        id: 'b-1', kind: 'reminder_day', event_starts_at: event.starts_at, recipient_total: 12, skipped_reason: null,
        created_by: null, created_at: '2026-11-16T01:30:00Z', counts: counts({ sent: 12 }), ...over,
    });

    it('pengingat belum waktunya: dijadwalkan 24 jam sebelum mulai (WIB)', () => {
        expect(reminderStatus(event, [], NOW)).toEqual({ text: 'Dijadwalkan Sen, 16 Nov · 08.30 WIB', tone: 'muted' });
    });

    it('pengingat terkirim / sedang dikirim / ada gagal', () => {
        expect(reminderStatus(event, [reminder()], NOW).text).toBe('12/12 terkirim · 16 Nov 08.30');
        expect(reminderStatus(event, [reminder({ counts: counts({ sent: 7, queued: 5 }) })], NOW).text).toBe('Sedang dikirim 7/12');
        expect(reminderStatus(event, [reminder({ counts: counts({ sent: 11, failed: 1 }) })], NOW)).toMatchObject({ text: '11/12 terkirim · 1 gagal', tone: 'warn' });
    });

    it('pengingat untuk jadwal lama tidak dihitung; dilewati & tanpa penerima punya teks sendiri', () => {
        expect(reminderStatus(event, [reminder({ event_starts_at: '2026-11-12T01:30:00Z' })], NOW).text).toMatch(/^Dijadwalkan/);
        expect(reminderStatus(event, [reminder({ skipped_reason: 'Email jadwal/pengingat sudah terkirim kurang dari 12 jam sebelumnya', recipient_total: 0, counts: counts() })], NOW).text)
            .toBe('Dilewati: email jadwal/pengingat sudah terkirim kurang dari 12 jam sebelumnya');
        expect(reminderStatus(event, [reminder({ recipient_total: 0, counts: counts() })], NOW).text).toBe('Tidak ada penerima');
    });

    it('batas 3 jam: lewat tanpa pengingat = terlewat; acara lewat atau batal = tanda pisah', () => {
        const start = Date.parse(event.starts_at);
        expect(reminderStatus(event, [], start - 3 * HOUR + 1).text).toBe('Terlewat');
        expect(reminderStatus(event, [], start - 3 * HOUR - 1).text).toBe('Segera dikirim');
        expect(reminderStatus(event, [], start - 24 * HOUR - 1).text).toBe('Dijadwalkan Sen, 16 Nov · 08.30 WIB');
        expect(reminderStatus(event, [], start + 2 * HOUR).text).toBe('—');
        expect(reminderStatus({ ...event, status: 'cancelled' }, [], NOW).text).toBe('—');
    });

    it('ringkasan baris jadwal berubah / pembatalan', () => {
        const b = reminder({ kind: 'schedule_change', created_at: '2026-11-10T02:12:00Z', counts: counts({ sent: 11, failed: 1 }) });
        expect(broadcastSummary(b)).toEqual({ text: '10 Nov 09.12 · 11/12 terkirim · 1 gagal', tone: 'warn', retryable: true });
        expect(broadcastSummary({ ...b, counts: counts({ sent: 12 }) })).toEqual({ text: '10 Nov 09.12 · 12/12 terkirim', tone: 'ok', retryable: false });
    });

    it('riwayat email satu peserta', () => {
        const deliveries: AdminDelivery[] = [{ broadcast_id: 'b-1', order_id: 'o-1', status: 'sent', attempts: 1, sent_at: '2026-11-16T01:31:00Z', error: null, retry_after: null }];
        expect(emailHistoryFor(PAID, [reminder()], deliveries)).toEqual([
            { label: 'E-tiket', status: 'sent', at: '2026-11-05T05:48:00Z', error: null },
            { label: 'Pengingat H-1', status: 'sent', at: '2026-11-16T01:31:00Z', error: null },
        ]);
    });
});

describe('CSV', () => {
    it('kolom tetap, waktu WIB, izin Ya/Tidak, status order berbahasa Indonesia', () => {
        const { headers, rows } = participantCsv([PAID, PAID_NO_CONSENT, REFUNDED]);
        expect(headers).toEqual([
            'Nama', 'Email e-tiket', 'WhatsApp', 'Kampus', 'Jurusan', 'Status', 'Referral', 'Izin kontak', 'Waktu izin (WIB)',
            'Kode tiket', 'Invoice', 'Status order', 'Harga', 'Diskon', 'Voucher', 'Dibayar (WIB)', 'Kanal', 'E-tiket terkirim (WIB)', 'Catatan refund',
        ]);
        expect(rows[0]).toEqual([
            'Putra Kurniawan', 'tegar@jakpat.net', '0812', 'UIU', 'Teknik', 'Mahasiswa', '', 'Ya', '2026-11-05 12:40',
            '7F3A91B2C4', 'WBN-E1642A9A-1793856539227', 'Lunas', 49000, 0, '', '2026-11-05 12:47', 'QRIS', '2026-11-05 12:48', '',
        ]);
        expect(rows[1][7]).toBe('Tidak');
        expect(rows[1].slice(12, 15)).toEqual([39200, 9800, 'JFU20']);
        expect(rows[2][11]).toBe('Refund');
        expect(rows[2][18]).toBe('Bentrok "jadwal"');
    });
});
