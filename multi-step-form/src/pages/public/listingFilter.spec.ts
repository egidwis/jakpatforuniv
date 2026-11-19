import { describe, it, expect } from 'vitest';
import { initialListingFilter } from './listingFilter';

/*
 * /pages dibuka di tab "Survei Aktif" (keputusan 19 Nov 2026): responden datang
 * untuk survei; pengumuman tetap satu ketukan. Tanpa survei aktif → pindah ke
 * Pengumuman dengan catatan kecil, bukan layar "kategori kosong".
 */
const c = (survey: number, announcement: number) => ({ all: survey + announcement, survey, announcement });

describe('initialListingFilter', () => {
    it.each([
        ['bawaan → survey', c(4, 13), '', { filter: 'survey', noSurveyNotice: false }],
        ['?tab=pengumuman', c(4, 13), '?tab=pengumuman', { filter: 'announcement', noSurveyNotice: false }],
        ['?tab=announcement', c(4, 13), '?tab=announcement', { filter: 'announcement', noSurveyNotice: false }],
        ['?tab=semua', c(4, 13), '?tab=semua', { filter: 'all', noSurveyNotice: false }],
        ['?tab=all', c(4, 13), '?tab=all', { filter: 'all', noSurveyNotice: false }],
        ['?tab=SURVEI (huruf besar)', c(4, 13), '?tab=SURVEI', { filter: 'survey', noSurveyNotice: false }],
        ['?tab=ngawur → bawaan', c(4, 13), '?tab=ngawur', { filter: 'survey', noSurveyNotice: false }],
        ['nol survei → Pengumuman + catatan', c(0, 13), '', { filter: 'announcement', noSurveyNotice: true }],
        ['nol survei, ?tab=survei → tetap pindah', c(0, 13), '?tab=survei', { filter: 'announcement', noSurveyNotice: true }],
        ['nol survei, ?tab=semua dihormati', c(0, 13), '?tab=semua', { filter: 'all', noSurveyNotice: false }],
        ['kosong total → all (empty state biasa)', c(0, 0), '', { filter: 'all', noSurveyNotice: false }],
        ['search rusak tidak melempar', c(4, 1), '%%%', { filter: 'survey', noSurveyNotice: false }],
    ] as const)('%s', (_label, counts, search, expected) => {
        expect(initialListingFilter(counts, search)).toEqual(expected);
    });
});
