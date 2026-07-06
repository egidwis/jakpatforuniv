import { supabase } from './supabase';
import { emailLocalPart } from '../components/customers/types';

/** Auth account identity resolved from public.profiles. */
export interface AuthProfile {
  /** Display name: profiles.full_name, else the auth email local-part.
   *  NEVER the per-survey biodata (Nama Invoice). */
  name: string;
  /** The auth account email (profiles.email). */
  email: string;
}

/**
 * Admin-only: resolve auth account identity (name + email) from public.profiles
 * via the SECURITY DEFINER RPC `get_profile_names`. Returns
 * Map<auth_user_id, { name, email }>. Non-admin callers get an empty map, and
 * the helper never throws (RPC errors → empty map, callers degrade gracefully).
 */
export async function fetchProfileNames(
  ids: (string | null | undefined)[]
): Promise<Map<string, AuthProfile>> {
  const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.rpc('get_profile_names', { p_ids: unique });
  if (error) {
    // Expected until migration 27 is applied — degrade to caller fallbacks.
    console.warn('fetchProfileNames: profile lookup unavailable, using fallback:', error.message ?? error);
    return new Map();
  }
  const map = new Map<string, AuthProfile>();
  (data || []).forEach((row: { id: string; full_name: string | null; email: string | null }) => {
    const email = (row.email || '').trim();
    const name = (row.full_name || '').trim() || emailLocalPart(email) || '';
    map.set(row.id, { name, email });
  });
  return map;
}
