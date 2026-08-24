/**
 * Pengambilan data untuk tab Campaign — dan HANYA tab Campaign.
 *
 * ## Sisi voucher tidak punya query sama sekali
 *
 * Angka voucher dihitung dari `RevenueDataset` yang SUDAH diambil tab Revenue:
 * `voucher_code` sejak awal ikut di `SUB_COLUMNS`, dan `submissionsById` sudah
 * dijamin menutupi setiap transaksi (termasuk order yang dibuat di luar rentang
 * tapi dibayar di dalamnya). Menariknya ulang di sini berarti dua sumber untuk
 * satu angka — dan dua sumber selalu berakhir dengan dua jawaban.
 *
 * Karena itu tab Campaign **ikut memicu `fetchRevenueData`**. Terdengar boros;
 * tidak: dua tabel kecil (±990 submission, ±410 transaksi lunas) yang sudah
 * di-cache begitu user pernah membuka tab Revenue.
 *
 * ## Satu query voucher yang tetap perlu
 *
 * `RevenueDataset` membawa transaksi periode sebelumnya, tapi TIDAK membawa
 * submission-nya — tab Revenue tidak pernah butuh. KPI "Order pakai voucher"
 * menghitung order yang DIBUAT di rentang (lunas maupun belum), jadi deltanya
 * butuh submission periode sebelumnya. Satu SELECT dua kolom di atas tabel di
 * bawah seribu baris; alternatifnya adalah KPI tanpa pembanding.
 *
 * ## Klik: log, bukan penghitung
 *
 * `campaign_links.click_count` kumulatif seumur hidup dan tidak bisa dipotong per
 * rentang — itu sebab `sql/68` melahirkan `campaign_link_clicks`. Penghitungnya
 * TETAP dibaca: tabel manajemen memajang total seumur hidup, dan hanya kolom itu
 * yang tahu 44 klik yang terjadi sebelum log ada.
 */

import { supabase } from '../supabase';
import { previousRange } from './fetchRevenueData';
import type { DateRange } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = Record<string, any>;

export interface CampaignDataset {
    /** Baris `campaign_link_clicks` di rentang ini. */
    clicks: AnyRow[];
    previousClicks: AnyRow[];
    /** Seluruh `campaign_links` — kecil, dan tabel manajemen butuh semuanya. */
    links: AnyRow[];
    /** `voucher_code` submission periode sebelumnya — hanya untuk delta. */
    previousSubmissions: AnyRow[];
}

export async function fetchCampaignData(range: DateRange): Promise<CampaignDataset> {
    const prev = previousRange(range);

    const clickQuery = (from: Date, to: Date) =>
        supabase
            .from('campaign_link_clicks')
            .select('source_name, clicked_at')
            .gte('clicked_at', from.toISOString())
            .lt('clicked_at', to.toISOString());

    const [clicks, previousClicks, links, previousSubmissions] = await Promise.all([
        clickQuery(range.from, range.to),
        clickQuery(prev.from, prev.to),
        supabase
            .from('campaign_links')
            .select('id, source_name, description, click_count, last_clicked_at')
            .order('click_count', { ascending: false }),
        supabase
            .from('form_submissions')
            .select('id, voucher_code')
            .gte('created_at', prev.from.toISOString())
            .lt('created_at', prev.to.toISOString()),
    ]);

    for (const res of [clicks, previousClicks, links, previousSubmissions]) {
        if (res.error) throw res.error;
    }

    return {
        clicks: clicks.data ?? [],
        previousClicks: previousClicks.data ?? [],
        links: links.data ?? [],
        previousSubmissions: previousSubmissions.data ?? [],
    };
}
