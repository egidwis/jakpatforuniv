import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pageReachability } from './pageReachability';
import type { ExistingPage } from './types';

const now = new Date('2026-08-26T05:00:00.000Z');
const pageOf = (over: Partial<ExistingPage> = {}): ExistingPage => ({
    id: 'page-1',
    slug: 'kuesioner-uji',
    is_published: true,
    publish_start_date: '2026-08-25T08:00:00.000Z',
    publish_end_date: '2026-08-27T08:00:00.000Z',
    ...over,
});

describe('pageReachability', () => {
    it('tanpa baris halaman = none', () => {
        expect(pageReachability(undefined, now)).toEqual({ state: 'none' });
    });

    it('draft yang jendelanya BELUM dibuka: terlambat = null', () => {
        const r = pageReachability(pageOf({ is_published: false, publish_start_date: '2026-09-03T08:00:00.000Z' }), now);
        expect(r).toEqual({ state: 'draft', overdueSince: null });
    });

    it('draft yang jendelanya SUDAH dibuka menyebut sejak kapan terlambat', () => {
        // 4 baris di produksi. Inilah satu-satunya pekerjaan halaman yang tidak
        // punya pil di papan Jadwal sebelum P5.
        const r = pageReachability(pageOf({ is_published: false }), now);
        expect(r).toEqual({ state: 'draft', overdueSince: new Date('2026-08-25T08:00:00.000Z') });
    });

    it('draft menang atas redirect — gerbangnya `.eq(is_published, true)`', () => {
        const r = pageReachability(pageOf({ is_published: false, redirect_url: 'https://forms.gle/x' }), now);
        expect(r.state).toBe('draft');
    });

    it('redirect_url terisi = isi halaman tidak pernah dilihat', () => {
        const r = pageReachability(pageOf({ redirect_url: '  https://forms.gle/x  ' }), now);
        expect(r).toEqual({ state: 'redirect', target: 'https://forms.gle/x' });
    });

    it('redirect_url kosong/spasi TIDAK dihitung mengalihkan', () => {
        expect(pageReachability(pageOf({ redirect_url: '   ' }), now).state).toBe('live');
    });

    it('jendela berjalan = terjangkau publik', () => {
        expect(pageReachability(pageOf(), now).state).toBe('live');
    });

    it('jendela belum dibuka', () => {
        const r = pageReachability(pageOf({
            publish_start_date: '2026-09-03T08:00:00.000Z',
            publish_end_date: '2026-09-04T08:00:00.000Z',
        }), now);
        expect(r).toEqual({ state: 'scheduled', opensAt: new Date('2026-09-03T08:00:00.000Z') });
    });

    it('jendela sudah lewat', () => {
        const r = pageReachability(pageOf({
            publish_start_date: '2026-08-11T08:00:00.000Z',
            publish_end_date: '2026-08-12T08:00:00.000Z',
        }), now);
        expect(r).toEqual({ state: 'ended', closedAt: new Date('2026-08-12T08:00:00.000Z') });
    });

    it('terbit tanpa jendela sama sekali = terjangkau (start NULL tidak menahan siapa pun)', () => {
        // 16 baris produksi tanpa publish_*; gerbang SurveyPage meloloskannya.
        expect(pageReachability(pageOf({ publish_start_date: null, publish_end_date: null }), now).state).toBe('live');
    });

    /**
     * ⚠️ Pengunci gerbang. Predikat ini mencerminkan `SurveyPage`; kalau
     * gerbang di sana diubah tanpa berkas ini ikut diubah, admin akan yakin
     * halaman bisa dibuka padahal responden menemui layar kosong.
     */
    it('masih mencerminkan gerbang SurveyPage', () => {
        const gate = readFileSync(path.resolve(__dirname, '../../pages/public/SurveyPage.tsx'), 'utf8');
        expect(gate).toContain(".eq('is_published', true)");
        expect(gate).toContain('publish_start_date');
        expect(gate).toContain('publish_end_date');
        expect(gate).toContain('data.redirect_url');
    });
});
