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
 */

export async function onRequestGet(context) {
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'X-API-Key, Content-Type',
    };

    // 0. Authenticate — Require JFU_RESPONDENT_API_KEY
    const apiKey = context.env.JFU_RESPONDENT_API_KEY;
    const url = new URL(context.request.url);

    const providedKey =
        context.request.headers.get('X-API-Key') ||
        url.searchParams.get('api_key');

    if (!apiKey || providedKey !== apiKey) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Unauthorized. Valid API key required.',
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
    const format = url.searchParams.get('format'); // 'batched' for batch-based response

    try {
        // ─────────────────────────────────────────────
        // MODE 1: List surveys (no page_id or slug)
        // ─────────────────────────────────────────────
        if (!pageId && !slug) {
            // Fetch all published survey pages with form_submissions metadata
            const { data: pages, error: pagesError } = await supabase
                .from('survey_pages')
                .select('id, slug, title, publish_start_date, publish_end_date, created_at, form_submissions!submission_id(prize_per_winner, winner_count, criteria_responden)')
                .eq('is_published', true)
                .order('created_at', { ascending: false });

            if (pagesError) throw pagesError;

            // Fetch respondent counts per page
            const pageIds = (pages || []).map(p => p.id);
            let countMap = {};

            if (pageIds.length > 0) {
                const allCountData = await fetchAllRows(() =>
                    supabase
                        .from('page_respondents')
                        .select('page_id')
                        .in('page_id', pageIds)
                );

                // Count per page_id
                allCountData.forEach(r => {
                    countMap[r.page_id] = (countMap[r.page_id] || 0) + 1;
                });
            }

            const surveys = (pages || []).map(p => {
                const sub = Array.isArray(p.form_submissions) ? p.form_submissions[0] : p.form_submissions;
                return {
                    page_id: p.id,
                    title: p.title,
                    slug: p.slug || p.id,
                    total_respondents: countMap[p.id] || 0,
                    reward_per_winner: sub?.prize_per_winner || 0,
                    winner_count: sub?.winner_count || 0,
                    criteria: sub?.criteria_responden || null,
                    period: {
                        start: p.publish_start_date || null,
                        end: p.publish_end_date || null,
                    },
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

        // Resolve page by page_id or slug
        let pageQuery = supabase
            .from('survey_pages')
            .select('id, slug, title, publish_start_date, publish_end_date, submission_id, form_submissions!submission_id(prize_per_winner, winner_count, criteria_responden)')
            .eq('is_published', true);

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

        // Fetch all respondents for this page (include loi_seconds)
        const allRespondents = await fetchAllRows(() =>
            supabase
                .from('page_respondents')
                .select('jakpat_id, ewallet_provider, e_wallet_number, proof_url, loi_seconds, created_at')
                .eq('page_id', pageData.id)
                .order('created_at', { ascending: true })
        );

        const sub = Array.isArray(pageData.form_submissions)
            ? pageData.form_submissions[0]
            : pageData.form_submissions;

        const mappedRespondents = allRespondents.map(r => ({
            jakpat_id: r.jakpat_id,
            ewallet_provider: r.ewallet_provider || null,
            e_wallet_number: r.e_wallet_number || null,
            proof_url: r.proof_url || null,
            has_proof: !!r.proof_url,
            loi_seconds: r.loi_seconds || null,
            submitted_at: r.created_at,
        }));

        // ── BATCHED FORMAT ──
        if (format === 'batched' && pageData.submission_id) {
            // Fetch batch rewards via RPC
            let batches = [];
            try {
                const { data: batchData, error: batchError } = await supabase
                    .rpc('get_batch_rewards', { p_submission_id: pageData.submission_id });
                if (!batchError && batchData) {
                    batches = batchData.map(b => ({
                        period_batch: b.period_batch,
                        prize_per_winner: b.final_prize_per_winner,
                        winner_count: b.winner_count,
                        batch_status: b.batch_status,
                        can_select_winners: b.can_select_winners,
                    }));
                }
            } catch (rpcErr) {
                console.error('get_batch_rewards RPC error:', rpcErr);
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
        }

        // ── DEFAULT FLAT FORMAT (backward compatible) ──
        const responseData = {
            status: 'success',
            survey: {
                page_id: pageData.id,
                title: pageData.title,
                slug: pageData.slug || pageData.id,
                total_respondents: allRespondents.length,
                reward_per_winner: sub?.prize_per_winner || 0,
                winner_count: sub?.winner_count || 0,
                criteria: sub?.criteria_responden || null,
                period: {
                    start: pageData.publish_start_date || null,
                    end: pageData.publish_end_date || null,
                },
            },
            respondents: mappedRespondents,
        };

        return new Response(JSON.stringify(responseData), {
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

// Handle CORS preflight for X-API-Key header
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'X-API-Key, Content-Type',
            'Access-Control-Max-Age': '86400',
        },
    });
}
