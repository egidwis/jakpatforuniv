import { describe, it, expect } from 'vitest';
import {
    alarmLabel, filterParticipants, groupCounts, participantCsv, participantGroup, failedEmails, noticeStatus,
    participantStats, summaryTiles, sourceTicketNote, purchaseEmailLabel, purchaseEmailSummary, reminderStatus, ticketEmailState, unpaidLabel, emailHistoryFor,
    type AdminWebinarOrder,
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
        reminder_sent_for: null, schedule_email_sent_at: null, cancel_email_sent_at: null, recording_email_sent_at: null, email_error: null,
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
        expect(participantStats(ALL, { state: 'on_sale', sold: 2, held: 1 }))
            .toEqual({ paid: 2, live: 2, replay: 0, held: 1, consent: 1, revenue: 88200 });
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

describe('email otomatis (kolom penanda per order, Iterasi 4)', () => {
    const START = '2026-11-17T01:30:00Z'; // Sel 17 Nov 08.30 WIB
    const start = Date.parse(START);
    const event = {
        status: 'published' as const, offer_kind: 'live' as const, starts_at: START, duration_minutes: 90,
        schedule_changed_at: null as string | null, recording_published_at: null as string | null,
    };
    const iso = (ms: number) => new Date(ms).toISOString();
    const paid = (id: string, over: Partial<AdminWebinarOrder> = {}) => order({ id, paid_at: '2026-11-05T05:47:00Z', ...over });

    it('pengingat belum waktunya: dijadwalkan 24 jam sebelum mulai (WIB)', () => {
        expect(reminderStatus(event, [paid('a')], NOW)).toEqual({ text: 'Dijadwalkan Sen, 16 Nov · 08.30 WIB', tone: 'muted' });
    });

    it('di jendela: dikirim, menyusul, gagal (dari email_error berawalan Pengingat H-1)', () => {
        const at = start - 20 * HOUR;
        const orders = [
            paid('a', { reminder_sent_for: START }),
            paid('b', { reminder_sent_for: START, email_error: 'Pengingat H-1 · 16 Nov 08.31 · resend HTTP 429' }),
            paid('c'),
            paid('d', { paid_at: iso(at - 2 * HOUR) }), // lunas < 6 jam: bukan penerima
            order({ id: 'e', status: 'refunded' }),
        ];
        expect(reminderStatus(event, orders, at)).toEqual({ text: '2/3 dikirim · 1 menyusul · 1 gagal', tone: 'warn' });
        expect(reminderStatus(event, orders.slice(0, 1), at)).toEqual({ text: '1/1 dikirim', tone: 'ok' });
    });

    it('penanda untuk jadwal lama tidak dihitung; lewat batas 3 jam = terlewat', () => {
        const old = [paid('a', { reminder_sent_for: '2026-11-12T01:30:00Z' })];
        expect(reminderStatus(event, old, start - 20 * HOUR).text).toBe('0/1 dikirim · 1 menyusul');
        expect(reminderStatus(event, old, start - 3 * HOUR + 1)).toEqual({ text: '0/1 dikirim · 1 terlewat', tone: 'warn' });
    });

    it('dilewati karena email jadwal baru < 12 jam; tanpa penerima; acara lewat atau batal', () => {
        const skipped = [paid('a', { reminder_sent_for: START, schedule_email_sent_at: iso(start - 30 * HOUR) })];
        expect(reminderStatus(event, skipped, start - 10 * HOUR).text).toBe('Dilewati: email jadwal baru dikirim kurang dari 12 jam sebelumnya');
        expect(reminderStatus(event, [], start - 10 * HOUR).text).toBe('Tidak ada penerima');
        expect(reminderStatus(event, [paid('a')], start + 2 * HOUR).text).toBe('—');
        expect(reminderStatus({ ...event, status: 'cancelled' }, [paid('a')], NOW).text).toBe('—');
    });

    it('jadwal berubah: hanya pembeli sebelum perubahan; dikirim bila penanda ≥ waktu perubahan', () => {
        const changed = '2026-11-10T02:12:00Z';
        const ev = { ...event, schedule_changed_at: changed };
        const orders = [
            paid('a', { schedule_email_sent_at: '2026-11-10T02:13:00Z' }),
            paid('b', { schedule_email_sent_at: '2026-11-08T00:00:00Z' }), // perubahan sebelumnya
            paid('c', { paid_at: '2026-11-10T02:30:00Z' }),                 // beli sesudahnya
        ];
        expect(noticeStatus('schedule_change', ev, orders, NOW)).toEqual({ text: '10 Nov 09.12 · 1/2 dikirim · 1 menyusul', tone: 'muted' });
        expect(noticeStatus('schedule_change', event, orders, NOW)).toBeNull();
        expect(noticeStatus('schedule_change', ev, orders.slice(0, 1), NOW)).toEqual({ text: '10 Nov 09.12 · 1/1 dikirim', tone: 'ok' });
        // Acara sudah mulai: yang belum tidak akan dikirim lagi.
        expect(noticeStatus('schedule_change', ev, orders, start + HOUR)?.tone).toBe('warn');
        // Acara lalu dibatalkan sebelum email jadwal berangkat: baris disembunyikan (pembatalan menggantikan).
        expect(noticeStatus('schedule_change', { ...ev, status: 'cancelled' }, orders.slice(1), NOW)).toBeNull();
    });

    it('pembatalan & rekaman: hanya bila relevan, gagal dari email_error', () => {
        const cancelled = { ...event, status: 'cancelled' as const };
        const orders = [paid('a', { cancel_email_sent_at: '2026-11-10T03:01:00Z' }), paid('b', { cancel_email_sent_at: '2026-11-10T03:01:00Z', email_error: 'Pembatalan · 10 Nov 10.01 · x' })];
        expect(noticeStatus('cancellation', event, orders, NOW)).toBeNull();
        expect(noticeStatus('cancellation', cancelled, orders, NOW)).toEqual({ text: '2/2 dikirim · 1 gagal', tone: 'warn' });
        const rec = { ...event, recording_published_at: '2026-11-18T02:30:00Z' };
        expect(noticeStatus('recording_ready', event, orders, NOW)).toBeNull();
        expect(noticeStatus('recording_ready', rec, [paid('a', { recording_email_sent_at: '2026-11-18T02:31:00Z' })], Date.parse('2026-11-18T03:00:00Z')))
            .toEqual({ text: '18 Nov 09.30 · 1/1 dikirim', tone: 'ok' });
    });

    it('daftar email gagal hanya tiket lunas', () => {
        const list = failedEmails([paid('a', { email_error: 'x' }), paid('b'), order({ id: 'c', status: 'refunded', email_error: 'x' })]);
        expect(list.map((o) => o.id)).toEqual(['a']);
    });

    it('riwayat email satu peserta dari kolom', () => {
        const o = paid('a', {
            schedule_email_sent_at: '2026-11-10T02:13:00Z',
            reminder_sent_for: START,
            recording_email_sent_at: '2026-11-18T02:31:00Z',
        });
        expect(emailHistoryFor(o)).toEqual([
            { label: 'E-tiket', status: 'sent', at: '2026-11-05T05:48:00Z', note: null, error: null },
            { label: 'Jadwal berubah', status: 'sent', at: '2026-11-10T02:13:00Z', note: null, error: null },
            { label: 'Pengingat H-1', status: 'sent', at: null, note: 'jadwal 17 Nov 08.30', error: null },
            { label: 'Rekaman tersedia', status: 'sent', at: '2026-11-18T02:31:00Z', note: null, error: null },
        ]);
        const skipped = paid('b', { reminder_sent_for: START, schedule_email_sent_at: iso(start - 30 * HOUR) });
        expect(emailHistoryFor(skipped)[2]).toMatchObject({ label: 'Pengingat H-1', status: 'skipped' });
        // Penanda terisi walau gagal (diisi saat dipanggil): email_error berawalan jenisnya = gagal.
        const failed = paid('c', { schedule_email_sent_at: '2026-11-10T02:13:00Z', email_error: 'Jadwal berubah · 10 Nov 09.13 · x' });
        expect(emailHistoryFor(failed)[1]).toMatchObject({ label: 'Jadwal berubah', status: 'failed' });
    });
});

describe('CSV', () => {
    it('kolom tetap, waktu WIB, izin Ya/Tidak, status order berbahasa Indonesia', () => {
        const { headers, rows } = participantCsv([PAID, PAID_NO_CONSENT, REFUNDED]);
        expect(headers).toEqual([
            'Nama', 'Email e-tiket', 'WhatsApp', 'Kampus', 'Jurusan', 'Status', 'Referral', 'Izin kontak', 'Waktu izin (WIB)',
            'Kode tiket', 'Invoice', 'Status order', 'Harga', 'Diskon', 'Voucher', 'Dibayar (WIB)', 'Kanal', 'E-tiket terkirim (WIB)', 'Catatan refund',
            'Jenis',
        ]);
        expect(rows[0]).toEqual([
            'Putra Kurniawan', 'tegar@jakpat.net', '0812', 'UIU', 'Teknik', 'Mahasiswa', '', 'Ya', '2026-11-05 12:40',
            '7F3A91B2C4', 'WBN-E1642A9A-1793856539227', 'Lunas', 49000, 0, '', '2026-11-05 12:47', 'QRIS', '2026-11-05 12:48', '',
            'Tiket live',
        ]);
        expect(rows[1][7]).toBe('Tidak');
        expect(rows[1].slice(12, 15)).toEqual([39200, 9800, 'JFU20']);
        expect(rows[2][11]).toBe('Refund');
        expect(rows[2][18]).toBe('Bentrok "jadwal"');
    });
});

describe('Video kelas di halaman Peserta (Fase 5B: satu daftar + label)', () => {
    const VIDEO = order({ id: 'v-1', kind: 'replay', buyer_name: 'Rina Putri', join_url: null, amount: 49000, marketing_consent: false });
    const VIDEO_FAILED = order({
        id: 'v-2', kind: 'replay', buyer_name: 'Dimas', join_url: null, amount: 49000, marketing_consent: true,
        ticket_email_sent_at: null, ticket_email_error: 'resend HTTP 422',
    });
    const MIXED = [PAID, PAID_NO_CONSENT, VIDEO, VIDEO_FAILED, PENDING, REFUNDED];

    it('statistik memisahkan tiket live dan Video kelas; pendapatan & izin kontak dari semua yang lunas', () => {
        expect(participantStats(MIXED, { state: 'sales_ended', sold: 2, held: 0 }))
            .toEqual({ paid: 4, live: 2, replay: 2, held: 0, consent: 2, revenue: 186200 });
        // Satu daftar: chip tetap per status pembayaran.
        expect(groupCounts(MIXED)).toEqual({ paid: 4, unpaid: 1, refunded: 1 });
    });

    it('email pembelian per jenis: E-tiket untuk tiket live, "Bukti beli video" hanya bila ada pembeli video', () => {
        expect(purchaseEmailSummary(MIXED, 'live', NOW)).toEqual({ text: '2/2 terkirim', tone: 'ok' });
        expect(purchaseEmailSummary(MIXED, 'replay', NOW)).toEqual({ text: '1/2 terkirim · 1 gagal (lihat peserta)', tone: 'warn' });
        expect(purchaseEmailSummary([PAID], 'replay', NOW)).toBeNull();
        expect(purchaseEmailSummary([VIDEO], 'live', NOW)).toBeNull();
        expect(purchaseEmailLabel(PAID)).toBe('E-tiket');
        expect(purchaseEmailLabel(VIDEO)).toBe('Bukti beli');
    });

    it('email otomatis (pengingat, jadwal, rekaman) mengabaikan pembeli video', () => {
        const event = {
            status: 'published' as const, offer_kind: 'live' as const, starts_at: new Date(NOW + 20 * HOUR).toISOString(), duration_minutes: 90,
        };
        expect(reminderStatus(event, [PAID, VIDEO], NOW)).toEqual(reminderStatus(event, [PAID], NOW));
        expect(failedEmails([VIDEO_FAILED])).toEqual([]);
    });

    it('riwayat email pembeli video diawali "Bukti beli"', () => {
        expect(emailHistoryFor(VIDEO)[0]).toMatchObject({ label: 'Bukti beli', status: 'sent' });
        expect(emailHistoryFor(VIDEO_FAILED)[0]).toMatchObject({ label: 'Bukti beli', status: 'failed', error: 'resend HTTP 422' });
    });

    it('ringkasan per jenis produk (Iterasi 7): webinar seperti sebelum 5B, Video kelas tanpa kuota & kursi ditahan', () => {
        const stats = participantStats([PAID, PAID_NO_CONSENT], { state: 'on_sale', sold: 2, held: 1 });
        expect(summaryTiles('live', 25, stats)).toEqual([
            { label: 'Lunas', value: '2 / 25' }, { label: 'Ditahan', value: '1' }, { label: 'Izin kontak', value: '1' },
        ]);
        expect(summaryTiles('live', null, stats)[0]).toEqual({ label: 'Lunas', value: '2' });
        const videoStats = participantStats([VIDEO, VIDEO_FAILED], null);
        expect(summaryTiles('replay', null, videoStats)).toEqual([
            { label: 'Terjual', value: '2' }, { label: 'Izin kontak', value: '1' },
        ]);
    });

    it('penjaga 5: pembeli Video kelas yang juga memegang tiket webinar asal ditandai', () => {
        expect(sourceTicketNote({ ...VIDEO, holds_source_ticket: true })).toBe('Sudah punya lewat tiket webinar — pertimbangkan refund');
        expect(sourceTicketNote({ ...VIDEO, holds_source_ticket: true, status: 'refunded' })).toBeNull();
        expect(sourceTicketNote(VIDEO)).toBeNull();
    });

    it('CSV: kolom Jenis', () => {
        const { rows } = participantCsv([PAID, VIDEO]);
        expect(rows.map((r) => r[19])).toEqual(['Tiket live', 'Video kelas']);
    });
});
