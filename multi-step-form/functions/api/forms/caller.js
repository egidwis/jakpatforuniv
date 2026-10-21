export async function callerUser(env, token) {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey || !token) return null;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (typeof user?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) return null;
  return { id: user.id, email: (user.email || '').toLowerCase() };
}

export function serviceEnv(env) {
  return {
    url: env.VITE_SUPABASE_URL || env.SUPABASE_URL,
    key: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
