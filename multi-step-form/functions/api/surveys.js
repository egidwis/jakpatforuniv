import { createClient } from '@supabase/supabase-js';

export async function onRequestGet(context) {
    // 1. Initialize Supabase
    const supabaseUrl = context.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Server configuration error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
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
        const baseUrl = new URL(context.request.url).origin; // or hardcode 'https://submit.jakpatforuniv.com'

        const cleanData = validSurveys.map(s => {
            // Parse banner if it's stored weirdly, otherwise use directly
            // Parse description blocks if needed, but mobile app might just want a summary
            // For now, let's keep it simple

            return {
                id: s.id,
                slug: s.slug || s.id,
                title: s.title,
                // Calculate status/tag based on date
                is_new: (new Date() - new Date(s.created_at)) < (7 * 24 * 60 * 60 * 1000), // < 7 days

                // Display info
                banner_url: s.banner_url || null,
                reward: {
                    amount: parseInt(s.rewards_amount || 0),
                    quota: parseInt(s.rewards_count || 0),
                    currency: 'IDR'
                },

                // Meta
                published_at: s.created_at,
                views: s.views_count || 0,

                // Action URL
                url: `${baseUrl}/pages/${s.slug || s.id}`,

                // Native apps might want raw intro text without JSON blocks
                // We can strip HTML or just send the title for the list view
            };
        });

        // 4. Return JSON
        return new Response(JSON.stringify({
            status: 'success',
            count: cleanData.length,
            data: cleanData
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Allow mobile app to hit this
                'Access-Control-Allow-Methods': 'GET',
                'Cache-Control': 'public, max-age=60' // Cache for 1 minute
            }
        });

    } catch (err) {
        return new Response(JSON.stringify({
            status: 'error',
            message: err.message
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
