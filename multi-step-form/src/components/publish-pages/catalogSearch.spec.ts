import { describe, it, expect } from 'vitest';
import {
    applyCatalogView, codeLookupOf, DEFAULT_CATALOG_VIEW, indexCatalog, matchesSearch,
    pageHaystack, pageStatusKey, paginate, searchTokens, type CatalogView,
} from './catalogSearch';
import type { PageData } from './types';

/*
  Kotak cari "Semua Page" dulu hanya mencocokkan judul & slug lewat `ilike` di
  server, atas 100 baris terbaru. ID page, ID order, Booking ID, nama peneliti —
  semuanya "tidak ada yang cocok", tanpa error. Yang dikunci di sini: setiap
  bentuk yang dipegang admin MENEMUKAN halamannya, dan saringan/jumlah tetap
  sepakat satu sama lain.
*/

const NOW = Date.parse('2026-10-14T08:00:00Z');

function page(over: Partial<PageData> & { id: string }): PageData {
    return {
        slug: 'slug-' + over.id.slice(0, 4),
        title: 'Halaman',
        is_published: true,
        is_hidden: false,
        is_extra_ad: false,
        views_count: 0,
        publish_start_date: '2026-03-13T08:00:00Z',
        publish_end_date: '2026-03-20T08:00:00Z',
        submission_id: '4592e80f-1111-2222-3333-444444444444',
        created_at: '2026-03-13T01:00:00Z',
        form_submissions: { title: 'Order', full_name: 'Biodata', distribution_type: 'regular' },
        ...over,
    } as PageData;
}

const IKN = page({
    id: '2b1c4df0-aaaa-bbbb-cccc-dddddddddddd',
    slug: 'survei-ibukota-nusantara-sustainability',
    title: 'Survei Ibukota Nusantara [SUSTAINABILITY]',
    owner_name: 'Rina Akun',
    owner_email: 'rina.akun@gmail.com',
    form_submissions: {
        title: 'IKN', full_name: 'Rina Biodata', email: 'rina.order@ui.ac.id',
        university: 'Universitas Indonésia', distribution_type: 'regular',
    },
});

const STUDY = page({
    id: '2f63f753-0000-0000-0000-000000000001',
    submission_id: '99999999-0000-0000-0000-000000000001',
    title: '(Study 1c) Persepsi Diri dan Kelompok',
    slug: 'study-1c',
});

const ANNOUNCEMENT = page({
    id: 'aaaaaaaa-0000-0000-0000-000000000002',
    submission_id: null as unknown as string,
    form_submissions: undefined,
    title: 'Pengumuman Pemenang',
    is_published: false,
});

const NO_CODES = new Map<string, Set<string>>();

const finds = (q: string, p: PageData = IKN, codes = NO_CODES) =>
    matchesSearch(pageHaystack(p), searchTokens(q), p.submission_id, codes);

describe('searchTokens', () => {
    it('membuang # dan / di depan, memecah per spasi, huruf kecil', () => {
        expect(searchTokens('  #2F63F753   /Study-1c ')).toEqual(['2f63f753', 'study-1c']);
    });

    it('menyusutkan tautan tempel ke slug-nya', () => {
        expect(searchTokens('https://jakpatforuniv.com/pages/survei-ibukota?utm=x#top'))
            .toEqual(['survei-ibukota']);
        expect(searchTokens('/pages/survei-ibukota/')).toEqual(['survei-ibukota']);
    });

    it('kosong → tanpa token', () => {
        expect(searchTokens('   ')).toEqual([]);
    });
});

describe('matchesSearch — setiap bentuk yang dipegang admin', () => {
    it('ID page: #8 hex huruf besar/kecil dan UUID penuh', () => {
        expect(finds('#2B1C4DF0')).toBe(true);
        expect(finds('2b1c4df0')).toBe(true);
        expect(finds('2b1c4df0-aaaa-bbbb-cccc-dddddddddddd')).toBe(true);
        expect(finds('#2f63f753')).toBe(false);
        expect(finds('#2f63f753', STUDY)).toBe(true);
    });

    it('ID order', () => {
        expect(finds('#4592e80f')).toBe(true);
    });

    it('tautan halaman dan slug', () => {
        expect(finds('https://jakpatforuniv.com/pages/survei-ibukota-nusantara-sustainability?utm=x')).toBe(true);
        expect(finds('/survei-ibukota-nusantara-sustainability')).toBe(true);
    });

    it('kata judul dengan urutan bebas', () => {
        expect(finds('sustainability ibukota')).toBe(true);
        expect(finds('persepsi kelompok', STUDY)).toBe(true);
        expect(finds('persepsi ibukota', STUDY)).toBe(false);
    });

    it('nama akun DAN nama biodata, email keduanya, kampus tanpa diakritik', () => {
        expect(finds('rina akun')).toBe(true);
        expect(finds('rina biodata')).toBe(true);
        expect(finds('rina.akun@gmail')).toBe(true);
        expect(finds('ui.ac.id')).toBe(true);
        expect(finds('universitas indonesia')).toBe(true);
    });

    it('announcement tanpa form_submissions tidak meledak', () => {
        expect(finds('pemenang', ANNOUNCEMENT)).toBe(true);
        expect(finds('#4592e80f', ANNOUNCEMENT)).toBe(false);
    });

    it('Booking ID terpenuhi lewat codeMatches (submission_id cocok)', () => {
        const codes = new Map([['4rrcsamp', new Set([IKN.submission_id])]]);
        expect(finds('4RRCSAMP')).toBe(false);
        expect(finds('4RRCSAMP', IKN, codes)).toBe(true);
        expect(finds('4RRCSAMP', STUDY, codes)).toBe(false);
        // Halaman tanpa order tidak pernah cocok lewat kode.
        expect(finds('4RRCSAMP', ANNOUNCEMENT, codes)).toBe(false);
    });
});

describe('codeLookupOf', () => {
    it('UUID, 8 hex, dan Booking ID → lookup; kata biasa → null', () => {
        expect(codeLookupOf('2b1c4df0-aaaa-bbbb-cccc-dddddddddddd'))
            .toEqual({ clean: '2b1c4df0-aaaa-bbbb-cccc-dddddddddddd', isFullUuid: true, isShortId: false });
        expect(codeLookupOf('4592e80f')).toEqual({ clean: '4592e80f', isFullUuid: false, isShortId: true });
        expect(codeLookupOf('4rrcsamp')).toEqual({ clean: '4rrcsamp', isFullUuid: false, isShortId: false });
        expect(codeLookupOf('ibukota')).toBeNull();
        expect(codeLookupOf('sustainability')).toBeNull();
    });
});

describe('pageStatusKey — mengikuti statusPriority', () => {
    it('draft, scheduled, live, completed', () => {
        expect(pageStatusKey(page({ id: 'a1', is_published: false }), NOW)).toBe('draft');
        expect(pageStatusKey(page({
            id: 'a2', publish_start_date: '2026-10-20T08:00:00Z', publish_end_date: '2026-10-27T08:00:00Z',
        }), NOW)).toBe('scheduled');
        expect(pageStatusKey(page({
            id: 'a3', publish_start_date: '2026-10-10T08:00:00Z', publish_end_date: '2026-10-20T08:00:00Z',
        }), NOW)).toBe('live');
        expect(pageStatusKey(IKN, NOW)).toBe('completed');
    });
});

describe('applyCatalogView', () => {
    const HIDDEN_EXTRA = page({ id: 'bbbbbbbb-0000-0000-0000-000000000003', is_extra_ad: true, is_hidden: true });
    const KILAT = page({
        id: 'cccccccc-0000-0000-0000-000000000004',
        form_submissions: { title: 'K', full_name: 'K', distribution_type: 'kilat' },
    });
    const index = indexCatalog([IKN, STUDY, ANNOUNCEMENT, HIDDEN_EXTRA, KILAT], NOW);
    const view = (v: Partial<CatalogView>) => ({ ...DEFAULT_CATALOG_VIEW, ...v });

    it('tanpa saringan: semua baris, urutan dipertahankan', () => {
        const { rows, counts } = applyCatalogView(index, view({}), NO_CODES);
        expect(rows.map(r => r.id)).toEqual([IKN, STUDY, ANNOUNCEMENT, HIDDEN_EXTRA, KILAT].map(p => p.id));
        expect(counts.type).toEqual({ all: 5, ad: 2, extra: 1, kilat: 1, announcement: 1 });
        expect(counts.status).toEqual({ all: 5, draft: 1, scheduled: 0, live: 0, completed: 4 });
        expect(counts.hidden).toBe(1);
    });

    it('saringan tipe: jumlah tipe tetap menghitung semua tipe, jumlah status ikut menyempit', () => {
        const { rows, counts } = applyCatalogView(index, view({ type: 'announcement' }), NO_CODES);
        expect(rows.map(r => r.id)).toEqual([ANNOUNCEMENT.id]);
        expect(counts.type.all).toBe(5);
        expect(counts.status).toEqual({ all: 1, draft: 1, scheduled: 0, live: 0, completed: 0 });
        expect(counts.hidden).toBe(0);
    });

    it('saringan status dan disembunyikan', () => {
        expect(applyCatalogView(index, view({ status: 'draft' }), NO_CODES).rows).toEqual([ANNOUNCEMENT]);
        const hidden = applyCatalogView(index, view({ hiddenOnly: true }), NO_CODES);
        expect(hidden.rows).toEqual([HIDDEN_EXTRA]);
        expect(hidden.counts.type).toEqual({ all: 1, ad: 0, extra: 1, kilat: 0, announcement: 0 });
        expect(hidden.counts.hidden).toBe(1);
    });

    it('pencarian lebih dulu, saringan sesudahnya', () => {
        const { rows, counts } = applyCatalogView(index, view({ query: 'persepsi' }), NO_CODES);
        expect(rows).toEqual([STUDY]);
        expect(counts.type.all).toBe(1);
    });
});

describe('paginate', () => {
    const rows = Array.from({ length: 490 }, (_, i) => i);

    it('490 baris → 10 halaman berisi 50, terakhir 40', () => {
        const first = paginate(rows, 1);
        expect(first).toMatchObject({ page: 1, totalPages: 10, from: 1, to: 50, total: 490 });
        expect(first.slice).toHaveLength(50);
        const last = paginate(rows, 10);
        expect(last).toMatchObject({ from: 451, to: 490 });
        expect(last.slice[39]).toBe(489);
    });

    it('di-clamp saat hasil menyusut, dan kosong tetap satu halaman', () => {
        expect(paginate(rows.slice(0, 60), 7)).toMatchObject({ page: 2, from: 51, to: 60 });
        expect(paginate(rows, 0).page).toBe(1);
        expect(paginate([], 3)).toMatchObject({ page: 1, totalPages: 1, from: 0, to: 0, total: 0 });
    });
});
