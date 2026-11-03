import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

const { activeTickets, checkoutErrorText, fetchMyWebinarOrders, fetchWebinarListing, WebinarApiError } = await import('./webinarApi');

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
    it('galat tak dikenal punya kalimat aman', () => {
        expect(checkoutErrorText(new Error('rahasia'))).not.toContain('rahasia');
    });
});
