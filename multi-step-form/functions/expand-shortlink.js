/**
 * Cloudflare Pages Function to expand shortlinks
 * This runs on the server-side, avoiding CORS issues
 */
export async function onRequestPost(context) {
  try {
    // Get the request body
    const body = await context.request.json();
    const { url } = body;

    if (!url) {
      return new Response(JSON.stringify({
        success: false,
        error: 'URL parameter is required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    console.log('[Expand Shortlink] Processing URL:', url);

    // Normalize URL - add https if missing
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // Server-side fetch with redirect follow - no CORS issues!
    const response = await fetch(normalizedUrl, {
      method: 'HEAD', // Use HEAD to avoid downloading content
      redirect: 'follow',
      cf: {
        // Cloudflare-specific caching
        cacheTtl: 300, // Cache for 5 minutes
      }
    });

    console.log('[Expand Shortlink] Fetch response status:', response.status);
    console.log('[Expand Shortlink] Final URL:', response.url);

    // Determine if URL was actually expanded
    const wasExpanded = response.url !== normalizedUrl;

    // Detect platform from final URL
    let platform = 'Unknown';
    if (response.url.includes('docs.google.com/forms') || response.url.includes('forms.google.com')) {
      platform = 'Google Forms';
    }

    const result = {
      success: true,
      originalUrl: normalizedUrl,
      expandedUrl: response.url,
      wasExpanded: wasExpanded,
      platform: platform,
      status: response.status
    };

    console.log('[Expand Shortlink] Result:', result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    console.error('[Expand Shortlink] Error:', error);

    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to expand URL: ' + error.message,
      originalUrl: body?.url || null
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
}

// Handle CORS preflight requests
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}