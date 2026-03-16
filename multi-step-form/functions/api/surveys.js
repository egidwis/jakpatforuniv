import { createClient } from '@supabase/supabase-js';

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
            .select('*')
            .eq('is_published', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Filter by date manually if RLS/Query is complex, or rely on query
        // Optimally, we filter in code to handle nulls easier
        const validSurveys = surveys.filter(s => {
            const start = s.publish_start_date ? new Date(s.publish_start_date) : null;
            const end = s.publish_end_date ? new Date(s.publish_end_date) : null;
            const nowTime = new Date();

            if (start && nowTime < start) return false;
            if (end && nowTime > end) return false;
            return true;
        });

        // 3. Transform Data for Mobile App
        const baseUrl = new URL(context.request.url).origin;

        const cleanData = validSurveys.map(s => {
            return {
                id: s.id,
                slug: s.slug || s.id,
                title: s.title,
                is_new: (new Date() - new Date(s.created_at)) < (7 * 24 * 60 * 60 * 1000),
                banner_url: s.banner_url || null,
                reward: {
                    amount: parseInt(s.rewards_amount || 0),
                    quota: parseInt(s.rewards_count || 0),
                    currency: 'IDR'
                },
                publish_date: new Date(s.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
                _sort_date: s.created_at,
                viewed: s.views_count || 0,
                url: `${baseUrl}/pages/${s.slug || s.id}`,
            };
        });

        // Sort by date descending (newest first)
        cleanData.sort((a, b) => new Date(b._sort_date) - new Date(a._sort_date));
        // Remove internal sort key
        cleanData.forEach(d => delete d._sort_date);

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
