// Server-side proxy untuk Google Forms - bypass CORS policy
export async function onRequest(context) {
  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const url = new URL(context.request.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response(JSON.stringify({ 
        error: 'Missing url parameter' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Validate that it's a Google Forms URL
    if (!targetUrl.includes('docs.google.com/forms')) {
      return new Response(JSON.stringify({ 
        error: 'Only Google Forms URLs are allowed' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    console.log('Proxying Google Forms URL:', targetUrl);
    
    // Fetch dari server-side (no CORS issues)
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = await response.text();
    
    return new Response(html, {
      status: response.status,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });

  } catch (error) {
    console.error('Proxy error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Proxy request failed: ' + error.message 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}