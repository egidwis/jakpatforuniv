import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/storage-cleanup
 *
 * Automatically cleans up files from expired surveys to free storage space.
 * Called internally by the SurveyPage when an upload fails (likely storage full).
 *
 * Deletes ONLY from surveys whose publish_end_date is older than 7 days.
 * Surveys that are still live are NEVER touched.
 *
 * Deletes in this order:
 *   1. Proof files from page_respondents
 *   2. Banner files from survey_pages
 *   3. Inline content images inside survey_pages.blocks
 *
 * Only nullifies DB references (proof_url, banner_url, image src in blocks)
 * for files that were ACTUALLY deleted from Supabase Storage successfully.
 *
 * Uses service_role key if available to bypass RLS. Falls back to anon key.
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
    const serviceRoleKey = context.env.SUPABASE_SERVICE_ROLE_KEY || context.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Server configuration error',
        }), { status: 500, headers: corsHeaders });
    }

    // Prefer service role key to bypass RLS policies on storage/bucket
    const keyToUse = serviceRoleKey || supabaseAnonKey;
    const supabase = createClient(supabaseUrl, keyToUse);

    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // ── 1. Find expired surveys ──────────────────────────────────────
        const { data: expiredPages, error: pagesError } = await supabase
            .from('survey_pages')
            .select('id, title, submission_id, publish_end_date, banner_url, blocks')
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

        // ── Guard: never clean a page whose submission still has a confirmed (paid) extend
        // that is upcoming or only recently ended. With gapped extends, publish_end_date can
        // sit at the original period while a future extend still needs the banner/blocks
        // (the cron only moves publish_* once the extend goes live — see sql/20_extend_rpcs.sql).
        const candidateSubmissionIds = [...new Set(expiredPages.map(p => p.submission_id).filter(Boolean))];
        let protectedSubmissionIds = new Set();
        if (candidateSubmissionIds.length > 0) {
            const { data: activeExtends } = await supabase
                .from('form_submissions_extend')
                .select('submission_id, end_date, payment_status')
                .in('submission_id', candidateSubmissionIds)
                .eq('payment_status', 'paid')
                .gte('end_date', sevenDaysAgo.toISOString());
            protectedSubmissionIds = new Set((activeExtends || []).map(e => e.submission_id));
        }

        const cleanablePages = expiredPages.filter(p => !protectedSubmissionIds.has(p.submission_id));
        if (cleanablePages.length === 0) {
            return new Response(JSON.stringify({
                status: 'success',
                message: 'No expired surveys to clean up (all protected by active extends).',
                deleted_files: 0,
            }), { headers: corsHeaders });
        }

        const expiredPageIds = cleanablePages.map(p => p.id);
        let totalDeleted = 0;
        let totalProofsNullified = 0;
        let totalBannersNullified = 0;
        let totalContentImagesDeleted = 0;
        const errors = [];

        // ── 2. Cleanup: Proof files ──────────────────────────────────────
        const { data: respondentsWithProof, error: respError } = await supabase
            .from('page_respondents')
            .select('id, proof_url')
            .in('page_id', expiredPageIds)
            .not('proof_url', 'is', null);

        if (!respError && respondentsWithProof && respondentsWithProof.length > 0) {
            const urlToIds = new Map(); // path -> [respondent ids]
            const allPaths = [];

            for (const r of respondentsWithProof) {
                if (!r.proof_url) continue;
                const match = r.proof_url.match(/\/page-uploads\/(.+)/);
                if (!match) continue;
                const path = match[1];
                allPaths.push(path);
                if (!urlToIds.has(path)) urlToIds.set(path, []);
                urlToIds.get(path).push(r.id);
            }

            const successfullyDeletedPaths = new Set();
            const BATCH = 100;
            for (let i = 0; i < allPaths.length; i += BATCH) {
                const batch = allPaths.slice(i, i + BATCH);
                const { error: storageError } = await supabase.storage
                    .from('page-uploads')
                    .remove(batch);

                if (storageError) {
                    console.warn('[Cleanup] Proof batch failed:', storageError);
                    errors.push(`proof-batch-${i}: ${storageError.message}`);
                } else {
                    batch.forEach(p => successfullyDeletedPaths.add(p));
                    totalDeleted += batch.length;
                }
            }

            // Nullify ONLY the respondents whose file was actually deleted
            const idsToNullify = [];
            for (const [path, ids] of urlToIds.entries()) {
                if (successfullyDeletedPaths.has(path)) {
                    idsToNullify.push(...ids);
                }
            }

            if (idsToNullify.length > 0) {
                for (let i = 0; i < idsToNullify.length; i += 200) {
                    const batch = idsToNullify.slice(i, i + 200);
                    await supabase
                        .from('page_respondents')
                        .update({ proof_url: null })
                        .in('id', batch);
                }
                totalProofsNullified = idsToNullify.length;
            }
        }

        // ── 3. Cleanup: Banner files ─────────────────────────────────────
        const bannerDeletions = [];
        const pageIdsWithBanners = [];
        for (const page of cleanablePages) {
            if (page.banner_url) {
                const match = page.banner_url.match(/\/page-uploads\/(.+)/);
                if (match) {
                    bannerDeletions.push({ pageId: page.id, path: match[1] });
                }
            }
        }

        if (bannerDeletions.length > 0) {
            const paths = bannerDeletions.map(b => b.path);
            const successfullyDeletedBannerPages = new Set();
            const BATCH = 100;
            for (let i = 0; i < paths.length; i += BATCH) {
                const batchPaths = paths.slice(i, i + BATCH);
                const batchItems = bannerDeletions.slice(i, i + BATCH);
                const { error: storageError } = await supabase.storage
                    .from('page-uploads')
                    .remove(batchPaths);

                if (storageError) {
                    console.warn('[Cleanup] Banner batch failed:', storageError);
                    errors.push(`banner-batch-${i}: ${storageError.message}`);
                } else {
                    batchItems.forEach(b => successfullyDeletedBannerPages.add(b.pageId));
                    totalDeleted += batchPaths.length;
                }
            }

            // Nullify banner_url only for pages whose banner was actually deleted
            const pagesToUpdate = bannerDeletions
                .filter(b => successfullyDeletedBannerPages.has(b.pageId))
                .map(b => b.pageId);

            if (pagesToUpdate.length > 0) {
                for (let i = 0; i < pagesToUpdate.length; i += 100) {
                    const batch = pagesToUpdate.slice(i, i + 100);
                    await supabase
                        .from('survey_pages')
                        .update({ banner_url: null })
                        .in('id', batch);
                }
                totalBannersNullified = pagesToUpdate.length;
            }
        }

        // ── 4. Cleanup: Content images inside blocks ─────────────────────
        for (const page of cleanablePages) {
            if (!page.blocks || !page.blocks.content) continue;

            const blocksToUpdate = JSON.parse(JSON.stringify(page.blocks)); // deep clone
            let modified = false;
            const deletedImagePaths = [];

            for (const block of blocksToUpdate.content) {
                // Images as top-level blocks
                if (block.type === 'image' && block.attrs?.src) {
                    const match = block.attrs.src.match(/\/page-uploads\/(.+)/);
                    if (match) {
                        deletedImagePaths.push(match[1]);
                        block.attrs.src = ''; // clear reference
                        modified = true;
                    }
                }

                // Images inside paragraphs
                if (block.content && Array.isArray(block.content)) {
                    for (const child of block.content) {
                        if (child.type === 'image' && child.attrs?.src) {
                            const match = child.attrs.src.match(/\/page-uploads\/(.+)/);
                            if (match) {
                                deletedImagePaths.push(match[1]);
                                child.attrs.src = '';
                                modified = true;
                            }
                        }
                    }
                }
            }

            if (deletedImagePaths.length > 0) {
                const BATCH = 100;
                for (let i = 0; i < deletedImagePaths.length; i += BATCH) {
                    const batch = deletedImagePaths.slice(i, i + BATCH);
                    const { error: storageError } = await supabase.storage
                        .from('page-uploads')
                        .remove(batch);

                    if (storageError) {
                        console.warn('[Cleanup] Content image batch failed:', storageError);
                        errors.push(`content-batch-${page.id}-${i}: ${storageError.message}`);
                    } else {
                        totalDeleted += batch.length;
                        totalContentImagesDeleted += batch.length;
                    }
                }

                if (modified) {
                    await supabase
                        .from('survey_pages')
                        .update({ blocks: blocksToUpdate })
                        .eq('id', page.id);
                }
            }
        }

        // ── 5. Response ──────────────────────────────────────────────────
        return new Response(JSON.stringify({
            status: 'success',
            message: `Cleaned up ${totalDeleted} file(s) from ${cleanablePages.length} expired survey(s).`,
            deleted_files: totalDeleted,
            proofs_nullified: totalProofsNullified,
            banners_nullified: totalBannersNullified,
            content_images_deleted: totalContentImagesDeleted,
            surveys_cleaned: cleanablePages.map(p => p.title),
            warnings: errors.length ? errors : undefined,
            using_service_role: !!serviceRoleKey,
        }), { headers: corsHeaders });

    } catch (err) {
        console.error('[Cleanup] Fatal error:', err);
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
