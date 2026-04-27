export async function onRequestPost({ request, env }) {
  try {
    const body = await request.text();

    if (!body) {
      return new Response(JSON.stringify({ message: 'Empty body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = JSON.parse(body);
    // Hapus apiKey & webhookToken dari payload — ambil dari server env
    const { endpoint, apiKey: _ignoredKey, webhookToken: _ignoredToken, ...payload } = data;

    // Baca key dari Cloudflare environment variable (tidak pernah ke browser)
    const apiKey = env.MAYAR_API_KEY;

    if (!endpoint || !apiKey) {
      return new Response(JSON.stringify({ message: 'Missing endpoint or server API key config' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Forward request to Mayar
    const mayarResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const responseText = await mayarResponse.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { data: responseText };
    }

    return new Response(JSON.stringify(responseData), {
      status: mayarResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
  });
}
