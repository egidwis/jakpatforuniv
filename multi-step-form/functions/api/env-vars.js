export function onRequest(context) {
  // Fungsi untuk menyamarkan nilai sensitif
  function maskValue(value) {
    if (!value) return '';
    if (value.length <= 10) return '********';
    return `${value.substring(0, 5)}...${value.substring(value.length - 5)}`;
  }

  // Return environment variables needed for application
  return new Response(JSON.stringify({
    // Supabase credentials
    VITE_SUPABASE_URL: context.env.VITE_SUPABASE_URL || '',
    VITE_SUPABASE_ANON_KEY: maskValue(context.env.VITE_SUPABASE_ANON_KEY),

    // DOKU credentials (payment gateway)
    VITE_DOKU_CLIENT_ID: maskValue(context.env.VITE_DOKU_CLIENT_ID || context.env.DOKU_CLIENT_ID),
    DOKU_SECRET_KEY: maskValue(context.env.DOKU_SECRET_KEY),

    // Configuration status
    config: {
      DOKU_CLIENT_ID_CONFIGURED: !!(context.env.VITE_DOKU_CLIENT_ID || context.env.DOKU_CLIENT_ID),
      DOKU_SECRET_KEY_CONFIGURED: !!context.env.DOKU_SECRET_KEY,
      SUPABASE_URL_CONFIGURED: !!context.env.VITE_SUPABASE_URL,
      SUPABASE_ANON_KEY_CONFIGURED: context.env.VITE_SUPABASE_ANON_KEY && context.env.VITE_SUPABASE_ANON_KEY.length > 20
    },

    // Debug info
    debug: {
      envKeys: Object.keys(context.env || {}).filter(key => !key.startsWith('_')),
      hasDokuClientId: !!(context.env.VITE_DOKU_CLIENT_ID || context.env.DOKU_CLIENT_ID),
      hasDokuSecretKey: !!context.env.DOKU_SECRET_KEY,
      hasSupabaseUrl: !!context.env.VITE_SUPABASE_URL,
      hasSupabaseAnonKey: !!context.env.VITE_SUPABASE_ANON_KEY
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
}
