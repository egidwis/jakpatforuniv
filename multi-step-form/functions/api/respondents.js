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

    try {
        // ─────────────────────────────────────────────
        // MODE 1: List all surveys (no page_id or slug)
        // ─────────────────────────────────────────────
        if (!pageId && !slug) {
            const { data: pages, error: pagesError } = await supabase
                .from('survey_pages')
                .select('id, slug, title, publish_start_date, publish_end_date, created_at, submission_id, form_submissions!submission_id(prize_per_winner, winner_count, criteria_responden, start_date, end_date, submission_status), page_respondents(count)')
                .eq('is_published', true)
                .order('created_at', { ascending: false });

            if (pagesError) throw pagesError;

            // Bulk-fetch all paid extends for batch info
            const submissionIds = (pages || []).map(p => p.submission_id).filter(Boolean);
            const extendsMap = {};

            if (submissionIds.length > 0) {
                const { data: extData, error: extError } = await supabase
                    .from('form_submissions_extend')
                    .select('submission_id, period_batch, prize_per_winner, additional_prize_per_winner, winner_count, submission_status, start_date, end_date')
                    .in('submission_id', submissionIds)
                    .eq('payment_status', 'paid');

                if (!extError && extData) {
                    extData.forEach(e => {
                        if (!extendsMap[e.submission_id]) extendsMap[e.submission_id] = [];
                        extendsMap[e.submission_id].push(e);
                    });
                }
            }

            // Helper: build batches array from parent submission + extends
            function buildBatches(sub, extends_list, defaultStartDate, defaultEndDate) {
                if (!sub) return [];
                const periods = {};
                const activeStatuses = ['live', 'scheduled', 'paid', 'waiting_payment'];

                // Parent period
                const parentStart = sub.start_date || defaultStartDate;
                const parentEnd = sub.end_date || defaultEndDate;
                const pp = parentEnd ? parentEnd.substring(0, 7) : null;
                if (pp) {
                    periods[pp] = {
                        base_p: sub.prize_per_winner || 0,
                        add_p: 0,
                        wc: sub.winner_count || 0,
                        statuses: [sub.submission_status || 'live'],
                        start_date: parentStart || null,
                        end_date: parentEnd || null
                    };
                }

                // Extends
                (extends_list || []).forEach(e => {
                    const pb = e.period_batch;
                    if (!pb) return;
                    if (!periods[pb]) {
                        periods[pb] = {
                            base_p: 0,
                            add_p: 0,
                            wc: 0,
                            statuses: [],
                            start_date: e.start_date || null,
                            end_date: e.end_date || null
                        };
                    }
                    periods[pb].base_p = Math.max(periods[pb].base_p, e.prize_per_winner || 0);
                    periods[pb].add_p += e.additional_prize_per_winner || 0;
                    periods[pb].wc = Math.max(periods[pb].wc, e.winner_count || 0);
                    periods[pb].statuses.push(e.submission_status);
                    if (e.start_date && (!periods[pb].start_date || e.start_date < periods[pb].start_date)) {
                        periods[pb].start_date = e.start_date;
                    }
                    if (e.end_date && (!periods[pb].end_date || e.end_date > periods[pb].end_date)) {
                        periods[pb].end_date = e.end_date;
                    }
                });

                return Object.entries(periods).map(([pb, p]) => {
                    const hasActive = p.statuses.some(s => activeStatuses.includes(s));
                    return {
                        period_batch: pb,
                        prize_per_winner: p.base_p + p.add_p,
                        winner_count: p.wc,
                        batch_status: hasActive ? 'active' : 'closed',
                        can_select_winners: !hasActive,
                        period: {
                            start: p.start_date,
                            end: p.end_date
                        }
                    };
                }).sort((a, b) => a.period_batch.localeCompare(b.period_batch));
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
                    batches: buildBatches(sub, extendsMap[p.submission_id] || [], p.publish_start_date, p.publish_end_date),
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
