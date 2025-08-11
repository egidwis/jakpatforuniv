export function onRequest(context) {
  // Hardcoded values that we know work
  const hardcodedUrl = 'https://zewuzezbmrmpttysjvpg.supabase.co';
  const hardcodedKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpld3V6ZXpibXJtcHR0eXNqdnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NDg0MzMsImV4cCI6MjA2MzMyNDQzM30.IsFpW4TMm1mrLse-dZNvZpB-srOIFb9f2XBgNpaOwpI';

  // Get environment variables (if they exist)
  let supabaseUrl = '';
  let supabaseAnonKey = '';

  try {
    supabaseUrl = context.env.VITE_SUPABASE_URL || '';
    supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY || '';
  } catch (e) {
    console.error('Error accessing environment variables:', e);
  }

  // Validate URL format
  let isValidUrl = false;
  if (supabaseUrl) {
    try {
      new URL(supabaseUrl);
      isValidUrl = true;
    } catch (e) {
      console.error('Invalid URL format in environment variable:', e);
      isValidUrl = false;
    }
  }

  // Check if variables exist and are valid
  const hasUrl = supabaseUrl !== '' && isValidUrl;
  const hasKey = supabaseAnonKey !== '' && supabaseAnonKey.length > 20;

  // Use environment variables if available and valid, otherwise use hardcoded values
  const finalUrl = hasUrl ? supabaseUrl : hardcodedUrl;
  const finalKey = hasKey ? supabaseAnonKey : hardcodedKey;

  // Create response with debugging info
  // IMPORTANT: Always return the hardcoded URL for now to fix the connection issue
  const response = {
    VITE_SUPABASE_URL: hardcodedUrl,
    VITE_SUPABASE_ANON_KEY: hardcodedKey,
    debug: {
      hasUrl: hasUrl,
      hasKey: hasKey,
      usingHardcoded: true, // Force using hardcoded values
      envKeys: Object.keys(context.env || {}),
      urlLength: hardcodedUrl.length,
      keyLength: hardcodedKey.length,
      originalUrl: finalUrl
    }
  };

  // Return response
  return new Response(JSON.stringify(response, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
}
