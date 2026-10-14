import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, submissionIdsForBookingId } from '@/utils/supabase';
import { codeLookupOf, searchTokens, type CodeMatches } from './catalogSearch';

// ─────────────────────────────────────────────────────────────
// Dua lookup kecil ke server yang dibutuhkan katalog di browser. Sisanya —
// cari, saring, paginasi — berjalan atas indeks yang sudah dimuat.
// ─────────────────────────────────────────────────────────────

const EMPTY_MATCHES: CodeMatches = new Map();

/**
 * Token berbentuk kode (UUID, 8 hex, Booking ID) → submission_id yang cocok,
 * lewat `submissionIdsForBookingId` — helper yang sama dengan Submissions,
 * jadi `booking_id` baru DAN kode lama jadwal ke-2+ (`source_id`) sama-sama
 * terjangkau.
 *
 * Hasil di-cache per token selama komponen hidup; peta dikunci per token, jadi
 * respons yang terlambat tidak pernah bisa salah tempel ke kueri lain. Helper
 * tidak melempar (gagal → daftar kosong), jadi pencarian lewat haystack tetap
 * jalan walau lookup ini gagal.
 */
export function useBookingCodeMatches(query: string): { matches: CodeMatches; pending: boolean } {
    const lookups = useMemo(() => {
        const seen = new Set<string>();
        return searchTokens(query).flatMap(token => {
            const lookup = codeLookupOf(token);
            if (!lookup || seen.has(token)) return [];
            seen.add(token);
            return [{ token, ...lookup }];
        });
    }, [query]);

    const cacheRef = useRef(new Map<string, ReadonlySet<string>>());
    const [matches, setMatches] = useState<CodeMatches>(EMPTY_MATCHES);
    const [pendingKey, setPendingKey] = useState('');

    const key = lookups.map(l => l.token).join(' ');

    useEffect(() => {
        const missing = lookups.filter(l => !cacheRef.current.has(l.token));
        if (missing.length === 0) {
            setMatches(new Map(cacheRef.current));
            setPendingKey('');
            return;
        }
        let cancelled = false;
        setPendingKey(key);
        const t = window.setTimeout(async () => {
            const found = await Promise.all(missing.map(async l =>
                [l.token, new Set(await submissionIdsForBookingId(l.clean, l.isFullUuid, l.isShortId))] as const
            ));
            for (const [token, ids] of found) cacheRef.current.set(token, ids);
            if (cancelled) return;
            setMatches(new Map(cacheRef.current));
            setPendingKey('');
        }, 300);
        return () => { cancelled = true; window.clearTimeout(t); };
        // `lookups` turunan dari `key`; cukup bergantung pada key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return { matches, pending: pendingKey !== '' && pendingKey === key };
}

const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map();

/**
 * Jumlah responden HANYA untuk baris yang sedang tampil (≤ satu halaman).
 *
 * Hitungannya mahal (±9 ms per halaman di produksi, ±4,5 detik untuk seluruh
 * katalog), jadi sengaja tidak ikut di indeks. Cache direset setiap `version`
 * berubah — yaitu setiap indeks dimuat ulang — supaya angka tidak basi sesudah
 * muat ulang. Id yang belum diketahui tidak ada di peta: tampilkan "…", bukan 0.
 */
export function useRespondentCounts(ids: string[], version: number): ReadonlyMap<string, number> {
    const [state, setState] = useState<{ version: number; counts: ReadonlyMap<string, number> }>(
        { version, counts: EMPTY_COUNTS },
    );
    const counts = state.version === version ? state.counts : EMPTY_COUNTS;
    const key = ids.join(',');

    useEffect(() => {
        const missing = ids.filter(id => !counts.has(id));
        if (missing.length === 0) return;
        let cancelled = false;
        const t = window.setTimeout(async () => {
            const { data, error } = await supabase
                .from('survey_pages')
                .select('id, page_respondents(count)')
                .in('id', missing);
            if (cancelled) return;
            if (error) {
                console.warn('Gagal memuat jumlah responden katalog:', error);
                return;
            }
            setState(prev => {
                const next = new Map(prev.version === version ? prev.counts : EMPTY_COUNTS);
                for (const r of (data || []) as { id: string; page_respondents?: { count: number }[] }[]) {
                    next.set(r.id, r.page_respondents?.[0]?.count ?? 0);
                }
                return { version, counts: next };
            });
        }, 250);
        return () => { cancelled = true; window.clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, version, counts]);

    return counts;
}
