import { describe, it, expect } from 'vitest';
import {
    EMPTY_FORM, FIELD_ORDER, adminDateLabel, columnsFromForm, diffColumns, formFromEvent, isEmptyDoc,
    isoToWibParts, normalizeDoc, normalizeSpeakers, parseWholeNumber, priceBreakdown, publishConsequence,
    salesChoiceOf, slugifyTitle, sortAdminEvents, stableStringify, wibPartsToIso, zoomWarning,
    type AdminWebinarEvent, type WebinarForm,
} from './webinarAdmin';
// @ts-expect-error — gerbang server ditulis JS polos (Pages Functions), sengaja tanpa tipe.
import * as gate from '../../functions/api/admin/webinarGate.js';

const DAY = 86_400_000;
const doc = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

function row(over: Partial<AdminWebinarEvent> = {}): AdminWebinarEvent {
    return {
        id: 'e1', slug: 'olah-data', title: 'Olah Data', summary: 'Ringkas', poster_url: 'https://cdn.test/p.webp',
        description_blocks: doc('Isi'), speakers: [{ name: 'Sari', title: 'Dosen' }],
        starts_at: '2026-11-21T12:00:00+00:00', duration_minutes: 90, sales_mode: 'open',
        sales_open_at: '2026-11-15T03:00:00+00:00', sales_close_at: null, price: 50000, quota: 100,
        status: 'draft', offer_kind: 'live', is_listed: true, is_test: false, meeting_url: 'https://zoom.us/j/1',
        preview_token: 'f'.repeat(32), published_at: null, created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z',
        webinar_offer_state: { state: 'draft', sold: 0, held: 0 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        view: {} as any, has_meeting_url: true,
        ...over,
    };
}

const columnsOf = (form: WebinarForm) => {
    const r = columnsFromForm(form);
    if ('error' in r) throw new Error(r.error);
    return r.columns;
};

describe('paritas klien/server (simpan otomatis tidak boleh berputar)', () => {
    it.each(['Olah Data SPSS: Café & Riset!', '!!!', 'a'.repeat(100), '  Ünïcödé — Webinar 2026  ', 'Gabung'])(
        'slugifyTitle(%j) sama di klien dan server',
        (title) => expect(slugifyTitle(title)).toBe(gate.slugifyTitle(title)),
    );

    const docs = [
        null,
        { type: 'doc', content: [{ type: 'paragraph' }] },
        doc('Halo'),
        { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://cdn.test/a.webp' } }] },
        { type: 'doc', content: [{ type: 'image', attrs: { src: 'data:image/png;base64,AA' } }] },
        { type: 'paragraph' },
    ];
    it.each(docs.map((d) => [JSON.stringify(d), d]))('isEmptyDoc/normalizeDoc sama untuk %s', (_label, d) => {
        expect(isEmptyDoc(d)).toBe(gate.isEmptyDoc(d));
        expect(normalizeDoc(d)).toEqual(gate.normalizeDoc(d));
    });

    const speakerLists = [
        null,
        [{ name: ' Sari ', title: ' Dosen ' }, { name: '', title: '' }],
        [{ name: 'A', title: '', photo_url: 'https://x.test/a.png' }],
        [{ name: 'A', photo_url: 'http://x.test/a.png' }],
        'bukan daftar',
    ];
    it.each(speakerLists.map((s) => [JSON.stringify(s), s]))('normalizeSpeakers sama untuk %s', (_label, s) => {
        expect(normalizeSpeakers(s)).toEqual(gate.normalizeSpeakers(s));
    });

    it('FIELD_ORDER sama dengan server', () => {
        expect(FIELD_ORDER).toEqual(gate.FIELD_ORDER);
    });

    it('kolom form ⊂ kolom yang boleh ditulis server, dan lolos normalizePatch tanpa berubah', () => {
        const columns = columnsOf(formFromEvent(row()));
        expect(Object.keys(columns).every((k) => gate.EDITABLE_COLUMNS.includes(k))).toBe(true);
        const server = gate.normalizePatch(columns);
        expect(server.error).toBeUndefined();
        expect(diffColumns(server.patch, columns)).toEqual({});
    });
});

describe('muat lalu diff harus kosong', () => {
    it('acara lengkap dengan format waktu +00:00 dari Postgres', () => {
        const r = row();
        expect(diffColumns(r, columnsOf(formFromEvent(r)))).toEqual({});
    });

    it('draft kosong (deskripsi null, pembicara [], penjualan belum ditentukan)', () => {
        const r = row({
            summary: null, poster_url: null, description_blocks: null, speakers: [], starts_at: null,
            duration_minutes: null, sales_mode: 'coming_soon', sales_open_at: null, price: null, quota: null, meeting_url: null,
        });
        expect(diffColumns(r, columnsOf(formFromEvent(r)))).toEqual({});
    });

    it('jsonb mengurutkan ulang kunci objek: tetap dianggap sama', () => {
        const stored = { content: [{ content: [{ text: 'Isi', type: 'text' }], type: 'paragraph' }], type: 'doc' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row({ description_blocks: stored as any, speakers: [{ title: 'Dosen', name: 'Sari' }] });
        const form = { ...formFromEvent(r), description_blocks: doc('Isi'), speakers: [{ name: 'Sari', title: 'Dosen' }] };
        expect(diffColumns(r, columnsOf(form))).toEqual({});
        expect(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    });

    it('jadwal berdetik (acara dari ops SQL) tidak terbaca berubah', () => {
        const r = row({ starts_at: '2026-11-21T12:00:37.123456+00:00', sales_open_at: '2026-11-15T03:00:59+00:00' });
        expect(diffColumns(r, columnsOf(formFromEvent(r)))).toEqual({});
    });

    it('perubahan satu isian hanya mengirim isian itu', () => {
        const r = row();
        const form = { ...formFromEvent(r), price: '75.000' };
        expect(diffColumns(r, columnsOf(form))).toEqual({ price: 75000 });
    });

    it('tanpa baris (acara baru), semua kolom dikirim', () => {
        const columns = columnsOf({ ...EMPTY_FORM, title: 'Baru' });
        expect(Object.keys(diffColumns(null, columns))).toContain('title');
    });
});

describe('konversi WIB', () => {
    it('jam sebelum 07.00 WIB jatuh di tanggal UTC sebelumnya', () => {
        expect(wibPartsToIso('2026-11-21', '06:30')).toBe('2026-11-20T23:30:00.000Z');
        expect(isoToWibParts('2026-11-20T23:30:00.000Z')).toEqual({ date: '2026-11-21', time: '06:30' });
    });

    it('bolak-balik 19.00 WIB', () => {
        const iso = wibPartsToIso('2026-11-21', '19:00');
        expect(iso).toBe('2026-11-21T12:00:00.000Z');
        expect(isoToWibParts(iso as string)).toEqual({ date: '2026-11-21', time: '19:00' });
    });

    it('kosong → null, tak lengkap → invalid', () => {
        expect(wibPartsToIso('', '')).toBeNull();
        expect(wibPartsToIso('2026-11-21', '')).toBe('invalid');
        expect(wibPartsToIso('2026-11-21', '24:00')).toBe('invalid');
    });
});

describe('pilihan penjualan', () => {
    it('kolom → pilihan', () => {
        expect(salesChoiceOf({ sales_mode: 'open', sales_open_at: null })).toBe('now');
        expect(salesChoiceOf({ sales_mode: 'open', sales_open_at: '2026-11-15T03:00:00Z' })).toBe('date');
        expect(salesChoiceOf({ sales_mode: 'coming_soon', sales_open_at: null })).toBe('undecided');
        expect(salesChoiceOf({ sales_mode: 'closed', sales_open_at: null })).toBe('closed');
    });

    it('pilihan → kolom', () => {
        const base = { ...EMPTY_FORM, title: 'A' };
        expect(columnsOf({ ...base, salesChoice: 'now' })).toMatchObject({ sales_mode: 'open', sales_open_at: null });
        expect(columnsOf({ ...base, salesChoice: 'date', openDate: '2026-11-15', openTime: '10:00' }))
            .toMatchObject({ sales_mode: 'open', sales_open_at: '2026-11-15T03:00:00.000Z' });
        expect(columnsOf({ ...base, salesChoice: 'undecided' })).toMatchObject({ sales_mode: 'coming_soon', sales_open_at: null });
        expect(columnsOf({ ...base, salesChoice: 'closed' })).toMatchObject({ sales_mode: 'closed' });
    });

    it('"Pada tanggal" tanpa tanggal adalah galat, tidak diam-diam menjadi "Sekarang"', () => {
        expect(columnsFromForm({ ...EMPTY_FORM, title: 'A', salesChoice: 'date' })).toEqual({
            error: 'Isi tanggal dan jam buka', field: 'sales_open_at',
        });
    });

    it('tutup kustom wajib bertanggal; default = saat acara mulai (null)', () => {
        expect(columnsOf({ ...EMPTY_FORM, title: 'A' }).sales_close_at).toBeNull();
        expect(columnsFromForm({ ...EMPTY_FORM, title: 'A', closeAtStart: false })).toMatchObject({ field: 'sales_close_at' });
    });

    it('label Terbitkan menjelaskan akibatnya', () => {
        const now = Date.parse('2026-11-05T00:00:00Z');
        expect(publishConsequence({ ...EMPTY_FORM, salesChoice: 'now' }, now)).toBe('Terbitkan: langsung dijual');
        expect(publishConsequence({ ...EMPTY_FORM, salesChoice: 'undecided' }, now)).toBe('Terbitkan: Segera hadir');
        expect(publishConsequence({ ...EMPTY_FORM, salesChoice: 'date', openDate: '2026-11-25', openTime: '10:00' }, now))
            .toBe('Terbitkan: Segera hadir s/d 25 Nov, 10.00 WIB');
        expect(publishConsequence({ ...EMPTY_FORM, salesChoice: 'date', openDate: '2026-11-01', openTime: '10:00' }, now))
            .toBe('Terbitkan: langsung dijual');
    });
});

describe('angka', () => {
    it('harga boleh bertitik ribuan atau berawalan Rp', () => {
        expect(parseWholeNumber('50.000')).toBe(50000);
        expect(parseWholeNumber('Rp 1.110')).toBe(1110);
        expect(parseWholeNumber('')).toBeNull();
        expect(parseWholeNumber('12,5')).toBeNaN();
    });

    it('rincian PPN 11% sama dengan webinar_orders', () => {
        expect(priceBreakdown(50000)).toEqual({ subtotal: 45045, ppn: 4955 });
        expect(priceBreakdown(1110)).toEqual({ subtotal: 1000, ppn: 110 });
        expect(priceBreakdown(999)).toBeNull();
    });
});

describe('daftar admin', () => {
    const now = Date.parse('2026-11-05T00:00:00Z');

    it('peringatan Zoom: terbit, tiket, tanpa link, mulai ≤ 3 hari', () => {
        const base = { status: 'published' as const, offer_kind: 'live' as const, has_meeting_url: false };
        expect(zoomWarning({ ...base, starts_at: new Date(now + 3 * DAY).toISOString() }, now)).toBe(true);
        expect(zoomWarning({ ...base, starts_at: new Date(now + 3 * DAY + 1000).toISOString() }, now)).toBe(false);
        expect(zoomWarning({ ...base, starts_at: new Date(now - 1000).toISOString() }, now)).toBe(false);
        expect(zoomWarning({ ...base, has_meeting_url: true, starts_at: new Date(now + DAY).toISOString() }, now)).toBe(false);
        expect(zoomWarning({ ...base, status: 'draft', starts_at: new Date(now + DAY).toISOString() }, now)).toBe(false);
    });

    it('urutan: terbit mendatang (terdekat), draft (terbaru), lewat/batal', () => {
        const at = (ms: number) => new Date(now + ms).toISOString();
        const list = [
            { id: 'batal', status: 'cancelled' as const, starts_at: at(DAY), updated_at: at(-DAY) },
            { id: 'draft-lama', status: 'draft' as const, starts_at: null, updated_at: at(-2 * DAY) },
            { id: 'jauh', status: 'published' as const, starts_at: at(10 * DAY), updated_at: at(-DAY) },
            { id: 'lewat', status: 'published' as const, starts_at: at(-DAY), updated_at: at(-DAY) },
            { id: 'dekat', status: 'published' as const, starts_at: at(2 * DAY), updated_at: at(-DAY) },
            { id: 'draft-baru', status: 'draft' as const, starts_at: null, updated_at: at(-1000) },
        ];
        expect(sortAdminEvents(list, now).map((e) => e.id)).toEqual(['dekat', 'jauh', 'draft-baru', 'draft-lama', 'batal', 'lewat']);
    });

    it('label tanggal memakai WIB', () => {
        expect(adminDateLabel('2026-11-21T12:00:00Z')).toBe('21 Nov 2026 · 19.00 WIB');
    });
});
