import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/storage-cleanup
 *
 * Automatically cleans up proof files from expired surveys to free storage space.
 * Called internally by the SurveyPage when a proof upload fails due to storage limits.
 * 
 * Deletes proofs from surveys whose publish_end_date is older than 7 days,
 * starting from the oldest. Also nullifies proof_url in the database.
 *
 * No authentication required — this is a maintenance endpoint that only deletes
 * old expired proofs and cannot access or modify any other data.
 */

export async function onRequestPost(context) {
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    const supabaseUrl = context.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Server configuration error',
        }), { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
        // Find expired surveys (publish_end_date > 7 days ago)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: expiredPages, error: pagesError } = await supabase
            .from('survey_pages')
            .select('id, title, publish_end_date')
            .lt('publish_end_date', sevenDaysAgo.toISOString())
            .order('publish_end_date', { ascending: true });

        if (pagesError) throw pagesError;
        if (!expiredPages || expiredPages.length === 0) {
            return new Response(JSON.stringify({
                status: 'success',
                message: 'No expired surveys to clean up.',
                deleted_files: 0,
            }), { headers: corsHeaders });
        }

        const expiredPageIds = expiredPages.map(p => p.id);

        // Find respondents with proof_url from expired surveys
        const { data: respondentsWithProof, error: respError } = await supabase
            .from('page_respondents')
            .select('id, page_id, proof_url')
            .in('page_id', expiredPageIds)
            .not('proof_url', 'is', null);

        if (respError) throw respError;
        if (!respondentsWithProof || respondentsWithProof.length === 0) {
            return new Response(JSON.stringify({
                status: 'success',
                message: 'No proof files to clean up from expired surveys.',
                deleted_files: 0,
            }), { headers: corsHeaders });
        }

        // Extract storage file paths from proof URLs
        const filePaths = respondentsWithProof
            .map(r => {
                if (!r.proof_url) return null;
                const match = r.proof_url.match(/\/page-uploads\/(.+)/);
                return match ? match[1] : null;
            })
            .filter(Boolean);

        // Delete files from storage (batch of 100)
        let deletedCount = 0;
        for (let i = 0; i < filePaths.length; i += 100) {
            const batch = filePaths.slice(i, i + 100);
            const { error: storageError } = await supabase.storage
                .from('page-uploads')
                .remove(batch);
            if (storageError) {
                console.warn('Storage cleanup batch warning:', storageError);
            } else {
                deletedCount += batch.length;
            }
        }

        // Nullify proof_url in database for cleaned respondents
        const cleanedIds = respondentsWithProof.map(r => r.id);
        for (let i = 0; i < cleanedIds.length; i += 200) {
            const batch = cleanedIds.slice(i, i + 200);
            await supabase
                .from('page_respondents')
                .update({ proof_url: null })
                .in('id', batch);
        }

        return new Response(JSON.stringify({
            status: 'success',
            message: `Cleaned up ${deletedCount} proof files from ${expiredPages.length} expired surveys.`,
            deleted_files: deletedCount,
            surveys_cleaned: expiredPages.map(p => p.title),
        }), { headers: corsHeaders });

    } catch (err) {
        return new Response(JSON.stringify({
            status: 'error',
            message: err.message,
        }), { status: 500, headers: corsHeaders });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        },
    });
}
