import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/respondents
 *
 * External API for lottery/prize platforms to retrieve respondent data.
 * Uses a separate API key (JFU_RESPONDENT_API_KEY) from the app-facing /api/surveys.
 *
 * Two modes:
 *   1. No page_id/slug → returns list of published surveys with respondent counts
 *   2. With page_id or slug → returns all respondents for that specific survey
 *
 * ⚠️ ENDPOINT INI MENGIRIM PII: `jakpat_id` + `e_wallet_number` responden.
 * Ia memakai service-role (lihat `keyToUse` di bawah), jadi RLS TIDAK menjadi
 * lapis kedua — gerbang API key adalah satu-satunya penjaga. Perlakukan setiap
 * perubahan di sini seperti perubahan pada pintu brankas.
 */

/**
 * Header CORS.
 *
 * Bawaannya: TIDAK ADA header CORS sama sekali. Endpoint ini mengirim nomor
 * e-wallet, dan data seperti itu tidak punya urusan diambil dari dalam browser.
 * Panggilan server-to-server tidak pernah memeriksa CORS, jadi ketiadaan header
 * ini tidak memutus klien backend mana pun — ia hanya menutup pintu browser.
 *
 * Kalau suatu saat ada dashboard web yang memang perlu memanggilnya langsung,
 * isi env var `RESPONDENT_API_ALLOWED_ORIGIN` dengan origin-nya
 * (mis. `https://undian.example.com`). Sengaja env var, bukan hardcode: origin
 * bisa berubah tanpa deploy, dan tidak ada daftar origin yang tercecer di kode.
 *
 * ⚠️ Jangan kembalikan `'*'`. Dengan `*`, halaman web mana pun yang dibuka
 * korban bisa membaca respons ini begitu ia memegang API key.
 */
function buildCorsHeaders(env) {
    const headers = { 'Content-Type': 'application/json' };
    const allowedOrigin = env.RESPONDENT_API_ALLOWED_ORIGIN;
    if (allowedOrigin && allowedOrigin !== '*') {
        headers['Access-Control-Allow-Origin'] = allowedOrigin;
        headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'X-API-Key, Content-Type';
        headers['Vary'] = 'Origin';
    }
    return headers;
}

export async function onRequestGet(context) {
    const corsHeaders = buildCorsHeaders(context.env);

    // Dideklarasikan DI SINI, sebelum gerbang API key, karena dua tempat
    // memakainya: pesan 401 di bawah dan parsing `page_id`/`slug` di bagian 2.
    // ⚠️ Jangan pindahkan ke dalam blok mana pun — persis itu yang membuat
    // seluruh endpoint melempar ReferenceError pada 2026-09-18 (Cloudflare 1101).
    const url = new URL(context.request.url);

    // 0. Authenticate — Require JFU_RESPONDENT_API_KEY
    //
    // ⚠️ HEADER SAJA. `?api_key=` DICABUT 2026-09-18 — jangan dihidupkan lagi.
    //
    // Key yang lewat query string ikut tertulis ke access log Cloudflare, log
    // server pemanggil, dan header `Referer` bila URL-nya pernah tersentuh
    // browser. Sekali bocor, seluruh basis data e-wallet responden terbuka,
    // karena endpoint ini memakai service-role tanpa RLS sebagai lapis kedua.
    //
    // Header tidak pernah masuk ke log-log itu. Biayanya bagi klien: satu baris
    // berubah, dari `?api_key=…` menjadi header `X-API-Key: …`.
    const apiKey = context.env.JFU_RESPONDENT_API_KEY;

    const providedKey = context.request.headers.get('X-API-Key');

    if (!apiKey || !providedKey || providedKey !== apiKey) {
        // Pesan dibedakan HANYA untuk kasus "key dikirim lewat query string",
        // supaya klien lama tidak menghabiskan waktu menebak kenapa key yang
        // mereka yakini benar tiba-tiba ditolak. Ini tidak membocorkan apa pun:
        // ia cuma memberi tahu CARA mengirim, bukan nilainya.
        const usedQueryParam = url.searchParams.has('api_key');
        return new Response(JSON.stringify({
            status: 'error',
            message: usedQueryParam && !providedKey
                ? 'Unauthorized. API key via ?api_key= is no longer accepted — send it as the X-API-Key request header instead.'
                : 'Unauthorized. Valid API key required in the X-API-Key request header.',
        }), {
            status: 401,
            headers: corsHeaders,
        });
    }

    // 1. Initialize Supabase
    const supabaseUrl = context.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = context.env.SUPABASE_SERVICE_ROLE_KEY || context.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Server configuration error',
        }), {
            status: 500,
            headers: corsHeaders,
        });
    }

    // Prefer service role key to bypass RLS policies on page_respondents
    const keyToUse = serviceRoleKey || supabaseAnonKey;
    const supabase = createClient(supabaseUrl, keyToUse);

    // Helper: fetch all rows with pagination (Supabase default limit is 1000)
    async function fetchAllRows(buildQuery, batchSize = 1000) {
        let allData = [];
        let from = 0;
        while (true) {
            const { data, error } = await buildQuery().range(from, from + batchSize - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            allData = allData.concat(data);
            if (data.length < batchSize) break;
            from += batchSize;
        }
        return allData;
    }

    // 2. Parse query parameters
    const pageId = url.searchParams.get('page_id');
    const slug = url.searchParams.get('slug');

    try {
        // ─────────────────────────────────────────────
        // MODE 1: List all surveys (no page_id or slug)
        // ─────────────────────────────────────────────
        if (!pageId && !slug) {
            // ⚠️ TIDAK ADA FILTER `distribution_type` DI SINI — DISENGAJA.
            //
            // /pages dan /api/surveys MEMBUANG halaman Kilat (Phase 5, sql/95).
            // Endpoint ini justru harus MENYERTAKANNYA. Ketiganya membaca tabel
            // yang sama dengan tujuan yang berlawanan, jadi jangan "diseragamkan":
            //
            //   /pages, /api/surveys  → etalase iklan. Kilat bukan kartu feed.
            //   /api/respondents      → undian hadiah. Kilat punya pemenang.
            //
            // Menambahkan `distribution_type <> 'kilat'` di sini akan memutus
            // rantai survey_pages.id → page_respondents.page_id → jakpat_id,
            // dan pemenang Kilat tidak akan pernah bisa diundi. Kegagalannya
            // SENYAP: tidak ada error, surveinya cuma tidak pernah muncul.
            const { data: pages, error: pagesError } = await supabase
                .from('survey_pages')
                .select('id, slug, title, created_at, submission_id, form_submissions!submission_id(criteria_responden), page_respondents(count)')
                .eq('is_published', true)
                // ⚠️ `is_hidden` DIHORMATI sejak 2026-09-18 — dulu tidak, dan itu bug.
                //
                // Admin yang menyembunyikan sebuah halaman mengira ia sudah menariknya
                // dari peredaran. Sampai hari ini endpoint ini mengabaikannya sepenuhnya,
                // jadi e-wallet respondennya tetap terunduh penuh oleh platform undian.
                // sql/42:244-246 bahkan MENYARANKAN `is_hidden` sebagai remediasi PII —
                // saran yang tidak pernah bekerja di sini.
                //
                // Bentuk `.or()` ini menyamai /api/surveys: `is_hidden` NULL (baris lama,
                // sebelum kolomnya ada) diperlakukan sebagai "tidak disembunyikan".
                .or('is_hidden.eq.false,is_hidden.is.null')
                .order('created_at', { ascending: false });

            if (pagesError) throw pagesError;

            // Batch rewards come from get_batch_rewards_bulk — the SAME implementation
            // Mode 2 uses (sql/44). This used to be a second, hand-rolled aggregation
            // (buildBatches()) fed by a separate extends query, and the two had already
            // drifted apart: the parent's end date was read raw as midnight UTC instead
            // of being lifted to 15:00 WIB, so can_select_winners went true eight hours
            // before the ad stopped collecting respondents, every last day of every
            // running survey. Two implementations of one answer cannot be kept in
            // agreement by discipline — so there is now only one.
            const submissionIds = [...new Set((pages || []).map(p => p.submission_id).filter(Boolean))];
            const batchesBySubmission = {};

            // Chunked so a growing catalogue can never hit PostgREST's default 1000-row
            // ceiling and silently return a survey with no prize.
            const RPC_CHUNK = 200;
            for (let i = 0; i < submissionIds.length; i += RPC_CHUNK) {
                const chunk = submissionIds.slice(i, i + RPC_CHUNK);
                try {
                    const { data: batchData, error: batchError } = await supabase
                        .rpc('get_batch_rewards_bulk', { p_submission_ids: chunk });

                    if (batchError) {
                        // Same posture as Mode 2: log it, leave batches empty, never
                        // fail the whole listing over the reward block.
                        console.error('get_batch_rewards_bulk RPC error:', batchError);
                        continue;
                    }

                    (batchData || []).forEach(b => {
                        if (!batchesBySubmission[b.submission_id]) batchesBySubmission[b.submission_id] = [];
                        batchesBySubmission[b.submission_id].push({
                            period_batch: b.period_batch,
                            prize_per_winner: b.prize_per_winner,
                            winner_count: b.winner_count,
                            batch_status: b.batch_status,
                            can_select_winners: b.can_select_winners,
                            period: {
                                start: b.start_date || null,
                                end: b.end_date || null,
                            },
                        });
                    });
                } catch (rpcErr) {
                    console.error('get_batch_rewards_bulk RPC error:', rpcErr);
                }
            }

            const surveys = (pages || []).map(p => {
                const sub = Array.isArray(p.form_submissions) ? p.form_submissions[0] : p.form_submissions;
                let respondentCount = 0;
                if (p.page_respondents && Array.isArray(p.page_respondents) && p.page_respondents.length > 0) {
                    respondentCount = p.page_respondents[0].count || 0;
                }

                return {
                    page_id: p.id,
                    title: p.title,
                    slug: p.slug || p.id,
                    total_respondents: respondentCount,
                    criteria: sub?.criteria_responden || null,
                    batches: batchesBySubmission[p.submission_id] || [],
                };
            });

            return new Response(JSON.stringify({
                status: 'success',
                count: surveys.length,
                surveys,
            }), { headers: corsHeaders });
        }

        // ─────────────────────────────────────────────
        // MODE 2: Get respondents for a specific survey
        // ─────────────────────────────────────────────
        let pageQuery = supabase
            .from('survey_pages')
            .select('id, slug, title, publish_start_date, publish_end_date, submission_id, form_submissions!submission_id(prize_per_winner, winner_count, criteria_responden)')
            .eq('is_published', true)
            // ⚠️ `is_hidden` dihormati di sini JUGA — lihat alasan lengkap di Mode 1.
            // Menyaringnya hanya di Mode 1 tidak menutup apa pun: Mode 2 adalah yang
            // benar-benar mengirim `e_wallet_number`, dan ia bisa dipanggil langsung
            // dengan page_id/slug tanpa pernah menyentuh daftar Mode 1.
            .or('is_hidden.eq.false,is_hidden.is.null');

        if (pageId) {
            pageQuery = pageQuery.eq('id', pageId);
        } else {
            pageQuery = pageQuery.eq('slug', slug);
        }

        const { data: pageData, error: pageError } = await pageQuery.single();

        if (pageError || !pageData) {
            return new Response(JSON.stringify({
                status: 'error',
                message: `Survey not found for the given ${pageId ? 'page_id' : 'slug'}.`,
            }), {
                status: 400,
                headers: corsHeaders,
            });
        }

        // Fetch all respondents for this page
        const allRespondents = await fetchAllRows(() =>
            supabase
                .from('page_respondents')
                .select('jakpat_id, ewallet_provider, e_wallet_number, proof_url, loi_seconds, created_at')
                .eq('page_id', pageData.id)
                .order('created_at', { ascending: true })
        );

        const mappedRespondents = allRespondents.map(r => ({
            jakpat_id: r.jakpat_id,
            ewallet_provider: r.ewallet_provider || null,
            e_wallet_number: r.e_wallet_number || null,
            proof_url: r.proof_url || null,
            has_proof: !!r.proof_url,
            loi_seconds: r.loi_seconds || null,
            submitted_at: r.created_at,
        }));

        // Fetch batch rewards via RPC
        let batches = [];
        if (pageData.submission_id) {
            try {
                const { data: batchData, error: batchError } = await supabase
                    .rpc('get_batch_rewards', { p_submission_id: pageData.submission_id });
                if (!batchError && batchData) {
                    batches = batchData.map(b => ({
                        period_batch: b.period_batch,
                        prize_per_winner: b.prize_per_winner,
                        winner_count: b.winner_count,
                        batch_status: b.batch_status,
                        can_select_winners: b.can_select_winners,
                        period: {
                            start: b.start_date || null,
                            end: b.end_date || null,
                        },
                    }));
                }
            } catch (rpcErr) {
                console.error('get_batch_rewards RPC error:', rpcErr);
            }
        }

        return new Response(JSON.stringify({
            status: 'success',
            survey: {
                page_id: pageData.id,
                title: pageData.title,
                slug: pageData.slug || pageData.id,
            },
            batches,
            total_respondents: allRespondents.length,
            respondents: mappedRespondents,
        }), {
            headers: corsHeaders,
        });

    } catch (err) {
        return new Response(JSON.stringify({
            status: 'error',
            message: err.message,
        }), {
            status: 500,
            headers: corsHeaders,
        });
    }
}

/**
 * Preflight CORS.
 *
 * ⚠️ Harus memakai sumber kebijakan yang SAMA dengan onRequestGet. Preflight yang
 * murah hati di depan gerbang yang ketat adalah cara klasik menghidupkan kembali
 * lubang yang baru saja ditutup: browser diberi izin di sini, lalu ditolak di sana.
 *
 * Tanpa `RESPONDENT_API_ALLOWED_ORIGIN`, respons ini tidak memuat header CORS sama
 * sekali dan browser membatalkan permintaannya — persis yang diinginkan untuk
 * endpoint yang mengirim nomor e-wallet.
 */
export async function onRequestOptions(context) {
    const headers = buildCorsHeaders(context.env);
    delete headers['Content-Type'];   // preflight tidak punya badan
    if (headers['Access-Control-Allow-Origin']) {
        headers['Access-Control-Max-Age'] = '86400';
    }
    return new Response(null, { headers });
}
