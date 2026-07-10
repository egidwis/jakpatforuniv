import { createClient } from '@supabase/supabase-js';

/**
 * Normalize a schedule date string for accurate time comparison.
 * Date-only strings (e.g. "2026-04-13") are parsed as midnight UTC,
 * which equals 07:00 WIB — before the intended 15:00 WIB go-live time.
 * This detects date-only values and sets the time to 08:00 UTC (= 15:00 WIB).
 */
function normalizeScheduleDate(dateStr) {
    const d = new Date(dateStr);
    if (!dateStr.includes('T')) {
        d.setUTCHours(8, 0, 0, 0);
    }
    return d;
}

/**
 * Listing order. MUST stay in sync with src/utils/adOrdering.ts
 * (adTypePriority / orderBand / compareDisplayOrder).
 *
 * 3-band sort:
 *   band 0 (TOP)    — unplaced (display_order NULL) regular or announcement
 *   band 1 (MIDDLE) — placed (display_order set), ordered by display_order ASC
 *   band 2 (BOTTOM) — unplaced (display_order NULL) extra ad
 * In-band tiebreak: type priority (regular -> extra -> announcement), then
 * created_at DESC. So a new regular/announcement surfaces at top, a new extra
 * defaults to bottom, and a saved display_order always wins (manual -> MIDDLE).
 */
function adTypePriority(p) {
    if (p.submission_id && !p.is_extra_ad) return 0;
    if (p.submission_id && p.is_extra_ad) return 1;
    return 2;
}
function orderBand(p) {
    const placed = p.display_order !== null && p.display_order !== undefined;
    if (placed) return 1;
    return adTypePriority(p) === 1 ? 2 : 0; // unplaced extra -> bottom, else top
}
function compareDisplayOrder(a, b) {
    const ba = orderBand(a);
    const bb = orderBand(b);
    if (ba !== bb) return ba - bb;
    const ao = a.display_order;
    const bo = b.display_order;
    if (ao !== null && ao !== undefined && bo !== null && bo !== undefined && ao !== bo) {
        return ao - bo;
    }
    const ap = adTypePriority(a);
    const bp = adTypePriority(b);
    if (ap !== bp) return ap - bp;
    return new Date(b.created_at) - new Date(a.created_at);
}

export async function onRequestGet(context) {
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'X-API-Key, Content-Type',
    };

    // 0. Authenticate - Require API Key
    const apiKey = context.env.JFU_API_KEY;
    const url = new URL(context.request.url);

    // Accept key from header or query param
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

    if (!supabaseUrl || !supabaseAnonKey) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Server configuration error'
        }), {
            status: 500,
            headers: corsHeaders,
        });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
        // 2. Query Database
        const now = new Date().toISOString();

        // Select pages that are:
        // - Published (is_published = true)
        // - Within valid date range (start <= now <= end) OR dates are null
        const { data: surveys, error } = await supabase
            .from('survey_pages')
            .select('*, form_submissions!submission_id(prize_per_winner, winner_count)')
            .eq('is_published', true)
            .or('is_hidden.eq.false,is_hidden.is.null')
            // Base order; final ordering is applied in JS via compareDisplayOrder
            // (manual display_order, then type priority, then recency).
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Filter by date manually if RLS/Query is complex, or rely on query
        // Optimally, we filter in code to handle nulls easier
        const validSurveys = surveys.filter(s => {
            const start = s.publish_start_date ? normalizeScheduleDate(s.publish_start_date) : null;
            const end = s.publish_end_date ? normalizeScheduleDate(s.publish_end_date) : null;
            const nowTime = new Date();

            if (start && nowTime < start) return false;
            if (end && nowTime > end) return false;
            return true;
        });

        // Apply listing order: manual display_order, then type priority, then recency.
        validSurveys.sort(compareDisplayOrder);

        // 3. Transform Data for Mobile App
        const baseUrl = new URL(context.request.url).origin;

        const cleanData = validSurveys.map(s => {
            const internalUrl = `${baseUrl}/pages/${s.slug || s.id}`;
            return {
                id: s.id,
                slug: s.slug || s.id,
                title: s.title,
                is_new: (new Date() - new Date(s.created_at)) < (7 * 24 * 60 * 60 * 1000),
                banner_url: s.banner_url ? `${baseUrl}/cdn/${s.banner_url.split('/storage/v1/object/public/')[1] || ''}` : null,
                reward: {
                    amount: (() => {
                        const sub = Array.isArray(s.form_submissions) ? s.form_submissions[0] : s.form_submissions;
                        return (sub?.prize_per_winner || 0) * (sub?.winner_count || 0);
                    })(),
                    quota: (() => {
                        const sub = Array.isArray(s.form_submissions) ? s.form_submissions[0] : s.form_submissions;
                        return sub?.winner_count || 0;
                    })(),
                    currency: 'IDR'
                },
                publish_date: new Date(s.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
                viewed: s.views_count || 0,
                url: s.redirect_url || internalUrl,
                use_external_browser: !!s.redirect_url,
            };
        });

        // Order was applied to validSurveys above (compareDisplayOrder); the transform
        // preserves array order.

        // 4. Apply limit (default 20)
        const LIMIT = 20;
        const totalCount = cleanData.length;
        const hasMore = totalCount > LIMIT;
        const paginatedData = cleanData.slice(0, LIMIT);

        // 5. Return JSON
        return new Response(JSON.stringify({
            status: 'success',
            count: totalCount,
            showing: paginatedData.length,
            has_more: hasMore,
            ...(hasMore && { more_url: `${baseUrl}/pages` }),
            data: paginatedData
        }), {
            headers: {
                ...corsHeaders,
                'Cache-Control': 'public, max-age=60'
            }
        });

    } catch (err) {
        return new Response(JSON.stringify({
            status: 'error',
            message: err.message
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
        }
    });
}
