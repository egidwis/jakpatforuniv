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
