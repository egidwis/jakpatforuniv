import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

const { activeTickets, checkoutErrorText, fetchMyWebinarOrders, fetchWebinarListing, ownedFor, WebinarApiError } = await import('./webinarApi');

describe('respons bukan JSON', () => {
    it('index.html berstatus 200 dianggap galat, bukan daftar kosong', async () => {
        const html = new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
        vi.stubGlobal('fetch', vi.fn(async () => html.clone()));
        await expect(fetchWebinarListing()).rejects.toBeInstanceOf(WebinarApiError);
        await expect(fetchMyWebinarOrders()).rejects.toBeInstanceOf(WebinarApiError);
        vi.unstubAllGlobals();
    });
    it('JSON valid tetap diteruskan', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ email: 'a@b.c', orders: [] }), { status: 200 })));
        await expect(fetchMyWebinarOrders()).resolves.toEqual({ email: 'a@b.c', orders: [] });
        vi.unstubAllGlobals();
    });
});

const order = (over = {}) => ({ status: 'paid', kind: 'live', event_is_past: false, event_cancelled: false, ...over }) as never;

describe('activeTickets', () => {
    it('hanya tiket live lunas untuk acara yang belum lewat dan tidak batal', () => {
        const orders = [
            order({ id: 'ok' }),
            order({ id: 'lewat', event_is_past: true }),
            order({ id: 'batal', event_cancelled: true }),
            order({ id: 'pending', status: 'pending' }),
            order({ id: 'refund', status: 'refunded' }),
            order({ id: 'video', kind: 'replay' }),
        ];
        expect(activeTickets(orders).map((o: { id?: string }) => o.id)).toEqual(['ok']);
    });
});

describe('checkoutErrorText', () => {
    it.each([
        ['seats_held', 'ditahan'],
        ['sold_out', 'habis'],
        ['coming_soon', 'belum dibuka'],
        ['closed', 'ditutup'],
    ])('%s', (state, text) => {
        expect(checkoutErrorText(new WebinarApiError('x', 409, { code: 'not_for_sale', state }))).toContain(text);
    });
    it('kursi habis tidak menjanjikan rekaman dijual (Iterasi 7)', () => {
        expect(checkoutErrorText(new WebinarApiError('x', 409, { code: 'not_for_sale', state: 'sold_out' }))).toBe('Kursi live habis.');
    });
    it('galat tak dikenal punya kalimat aman', () => {
        expect(checkoutErrorText(new Error('rahasia'))).not.toContain('rahasia');
    });
});

describe('webinarContactError (cermin server)', () => {
    it('menerima kontak yang sah dan menolak yang tidak', async () => {
        const { webinarContactError } = await import('./webinarApi');
        expect(webinarContactError({ name: 'Sinta', email: 'sinta@kampus.ac.id', phone: '+62 812-3456-7890' })).toBeNull();
        expect(webinarContactError({ name: ' ', email: 'a@b.co', phone: '08123456789' })).toContain('Nama');
        expect(webinarContactError({ name: 'A', email: 'bukan', phone: '08123456789' })).toContain('Email');
        expect(webinarContactError({ name: 'A', email: 'a@b.co', phone: '0812' })).toContain('telepon');
    });
});

describe('jendela gabung', () => {
    it('hitungan server dipindah ke jam perangkat saat respons tiba', async () => {
        const join = { phase: 'before', opens_in_seconds: 90, closes_in_seconds: 7200, opens_label: '08.06 WIB', meeting_ready: true };
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ email: 'a@b.c', orders: [{ id: 'x', join }, { id: 'y', join: null }] }), { status: 200 })));
        const t0 = Date.now();
        const { orders } = await fetchMyWebinarOrders();
        vi.unstubAllGlobals();
        const { joinPhaseAt } = await import('./webinarApi');
        const j = orders[0].join!;
        expect(j.opens_at_ms - t0).toBeGreaterThanOrEqual(90_000);
        expect(j.opens_at_ms - t0).toBeLessThan(91_000);
        expect(joinPhaseAt(j, j.opens_at_ms - 1)).toBe('before');
        expect(joinPhaseAt(j, j.opens_at_ms)).toBe('open');
        expect(joinPhaseAt(j, j.closes_at_ms)).toBe('after');
        expect(orders[1].join).toBeNull();
    });

    it('hitung mundur dan kalimat ringkas', async () => {
        const { formatJoinCountdown, joinOpensHint } = await import('./webinarApi');
        expect(formatJoinCountdown((13 * 86400 + 15 * 3600 + 30 * 60 + 33) * 1000)).toBe('13 hari 15:30:33');
        expect(formatJoinCountdown(65_000)).toBe('00:01:05');
        expect(formatJoinCountdown(-5)).toBe('00:00:00');
        expect(joinOpensHint(13.5 * 86_400_000)).toBe('Ruang dibuka dalam 13 hari');
        expect(joinOpensHint(5 * 3_600_000 + 1)).toBe('Ruang dibuka dalam 5 jam');
        expect(joinOpensHint(12 * 60_000)).toBe('Ruang dibuka dalam 12 menit');
    });
});

describe('ownedFor: sudah punya (Iterasi 7, penjaga 1–2)', () => {
    const SRC = { id: 'src', slug: 'olah-data' };
    const VID = { id: 'vid', slug: 'olah-data-video', source_event_id: 'src' };
    const mineOf = (over = {}) => order({ id: 't1', event: SRC, ...over });

    it('pembelian acara itu sendiri (lunas) dihitung punya', () => {
        const own = order({ id: 'v1', kind: 'replay', event: VID });
        expect(ownedFor(VID as never, [own])).toEqual({ order: own, viaSource: false });
        expect(ownedFor(VID as never, [order({ id: 'v2', kind: 'replay', status: 'refunded', event: VID })])).toBeNull();
    });

    it('tiket live lunas webinar asal dihitung punya Video kelasnya', () => {
        const ticket = mineOf();
        expect(ownedFor(VID as never, [ticket])).toEqual({ order: ticket, viaSource: true });
    });

    it.each([
        ['tiket di-refund', { status: 'refunded' }],
        ['tiket belum dibayar', { status: 'pending' }],
        ['webinar asal batal', { event_cancelled: true }],
    ])('%s → belum punya', (_n, over) => {
        expect(ownedFor(VID as never, [mineOf(over)])).toBeNull();
    });

    it('Video kelas tanpa webinar asal tidak terhubung ke tiket mana pun', () => {
        expect(ownedFor({ ...VID, source_event_id: null } as never, [mineOf()])).toBeNull();
    });
});
