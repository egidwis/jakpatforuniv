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

    // Mayar credentials (payment gateway)
    VITE_MAYAR_API_KEY: maskValue(context.env.VITE_MAYAR_API_KEY),
    VITE_MAYAR_WEBHOOK_TOKEN: maskValue(context.env.VITE_MAYAR_WEBHOOK_TOKEN),

    // Configuration status
    config: {
      MAYAR_API_KEY_CONFIGURED: context.env.VITE_MAYAR_API_KEY && context.env.VITE_MAYAR_API_KEY.length > 20,
      MAYAR_WEBHOOK_TOKEN_CONFIGURED: context.env.VITE_MAYAR_WEBHOOK_TOKEN && context.env.VITE_MAYAR_WEBHOOK_TOKEN.length > 20,
      SUPABASE_URL_CONFIGURED: !!context.env.VITE_SUPABASE_URL,
      SUPABASE_ANON_KEY_CONFIGURED: context.env.VITE_SUPABASE_ANON_KEY && context.env.VITE_SUPABASE_ANON_KEY.length > 20
    },

    // Debug info
    debug: {
      envKeys: Object.keys(context.env || {}).filter(key => !key.startsWith('_')),
      hasMayarApiKey: !!context.env.VITE_MAYAR_API_KEY,
      hasMayarWebhookToken: !!context.env.VITE_MAYAR_WEBHOOK_TOKEN,
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
