import { supabase } from './supabase';

/**
 * Admin-only: resolve auth researcher names from public.profiles via the
 * SECURITY DEFINER RPC `get_profile_names`. Returns Map<auth_user_id, name>
 * containing only non-empty names. Non-admin callers get an empty map.
 */
export async function fetchProfileNames(
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.rpc('get_profile_names', { p_ids: unique });
  if (error) {
    console.error('fetchProfileNames error:', error);
    return new Map();
  }
  const map = new Map<string, string>();
  (data || []).forEach((row: { id: string; full_name: string | null }) => {
    const nm = (row.full_name || '').trim();
    if (nm) map.set(row.id, nm);
  });
  return map;
}
