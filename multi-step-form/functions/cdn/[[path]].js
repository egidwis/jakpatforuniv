/**
 * Cloudflare Pages Function - CDN Proxy for Supabase Storage
 * 
 * Proxies requests to Supabase Storage and caches them on Cloudflare's edge.
 * This eliminates Supabase cached egress costs since Cloudflare serves from its own cache.
 * 
 * URL pattern: /cdn/{bucket}/{path}
 * Example: /cdn/page-uploads/banners/my-banner.webp
 *   → proxies to: https://xxx.supabase.co/storage/v1/object/public/page-uploads/banners/my-banner.webp
 */

const SUPABASE_URL = 'https://zewuzezbmrmpttysjvpg.supabase.co';
const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days in seconds

export async function onRequest(context) {
    const { params } = context;

    // Reconstruct the storage path from the catch-all param
    const storagePath = Array.isArray(params.path) ? params.path.join('/') : params.path;

    if (!storagePath) {
        return new Response('Not found', { status: 404 });
    }

    // Build the upstream Supabase Storage URL
    const upstreamUrl = `${SUPABASE_URL}/storage/v1/object/public/${storagePath}`;

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    };

    // Handle preflight
    if (context.request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // Only allow GET/HEAD
    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
        // Fetch from Supabase Storage
        const response = await fetch(upstreamUrl, {
            headers: {
                'Accept': context.request.headers.get('Accept') || '*/*',
            },
            cf: {
                // Cloudflare cache settings
                cacheTtl: CACHE_TTL,
                cacheEverything: true,
            },
        });

        if (!response.ok) {
            return new Response('File not found', { 
                status: response.status, 
                headers: corsHeaders 
            });
        }

        // Get content type from upstream
        const contentType = response.headers.get('Content-Type') || 'application/octet-stream';

        // Return with aggressive caching headers
        const cachedResponse = new Response(response.body, {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': contentType,
                'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}, immutable`,
                'CDN-Cache-Control': `public, max-age=${CACHE_TTL}`,
                'X-Cache-Source': 'cloudflare-cdn-proxy',
            },
        });

        return cachedResponse;
    } catch (error) {
        return new Response('Proxy error', { 
            status: 502, 
            headers: corsHeaders 
        });
    }
}
