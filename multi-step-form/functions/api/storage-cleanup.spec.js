import { describe, it, expect } from 'vitest';

describe('Storage Cleanup Retention Logic (60 Hari / 2 Bulan)', () => {
    const RETENTION_DAYS = 60;

    function getCutoff(now = new Date()) {
        const d = new Date(now);
        d.setDate(d.getDate() - RETENTION_DAYS);
        return d;
    }

    function isExpiredForCleanup(publishEndDateIso, now = new Date()) {
        const cutoff = getCutoff(now);
        return new Date(publishEndDateIso) < cutoff;
    }

    function isProtectedByExtend(extendEndDateIso, now = new Date()) {
        const cutoff = getCutoff(now);
        return new Date(extendEndDateIso) >= cutoff;
    }

    it('menghitung batas cutoff tepat 60 hari ke belakang', () => {
        const now = new Date('2026-09-23T12:00:00Z');
        const cutoff = getCutoff(now);
        const diffMs = now.getTime() - cutoff.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        expect(diffDays).toBe(60);
    });

    it('TIDAK menghapus survei yang baru selesai 7 hari lalu (aturan lama 7 hari vs aturan baru 60 hari)', () => {
        const now = new Date('2026-09-23T12:00:00Z');
        const ended7DaysAgo = '2026-09-16T12:00:00Z';
        // Dengan aturan 60 hari, survei 7 hari lalu TIDAK boleh terhapus
        expect(isExpiredForCleanup(ended7DaysAgo, now)).toBe(false);
    });

    it('TIDAK menghapus survei yang baru selesai 30 hari atau 50 hari lalu', () => {
        const now = new Date('2026-09-23T12:00:00Z');
        const ended30DaysAgo = '2026-08-24T12:00:00Z';
        const ended50DaysAgo = '2026-08-04T12:00:00Z';
        expect(isExpiredForCleanup(ended30DaysAgo, now)).toBe(false);
        expect(isExpiredForCleanup(ended50DaysAgo, now)).toBe(false);
    });

    it('HANYA menandai survei yang sudah lewat 60 hari untuk dibersihkan', () => {
        const now = new Date('2026-09-23T12:00:00Z');
        const ended61DaysAgo = '2026-07-24T11:00:00Z';
        const ended90DaysAgo = '2026-06-25T12:00:00Z';
        expect(isExpiredForCleanup(ended61DaysAgo, now)).toBe(true);
        expect(isExpiredForCleanup(ended90DaysAgo, now)).toBe(true);
    });

    it('melindungi survei jika ada extend aktif yang berakhir dalam jendela 60 hari', () => {
        const now = new Date('2026-09-23T12:00:00Z');
        // Survei asli selesai 70 hari lalu, tapi ada extend yang selesai 10 hari lalu
        const extendEnded10DaysAgo = '2026-09-13T12:00:00Z';
        expect(isProtectedByExtend(extendEnded10DaysAgo, now)).toBe(true);
    });

    it('tidak melindungi jika perpanjangan (extend) pun sudah berakhir > 60 hari lalu', () => {
        const now = new Date('2026-09-23T12:00:00Z');
        const extendEnded65DaysAgo = '2026-07-20T12:00:00Z';
        expect(isProtectedByExtend(extendEnded65DaysAgo, now)).toBe(false);
    });
});
