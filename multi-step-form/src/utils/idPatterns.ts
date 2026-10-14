// Bentuk kode yang dikutip admin & peneliti. Murni (tanpa klien Supabase) supaya
// pencarian di browser dan pencarian server membaca aturan yang sama.

export const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const SHORT_ID_RE = /^[0-9a-fA-F]{8}$/;
/** Bentuk `booking_id` (sql/51): 8 karakter, alfabet tanpa `0 O 1 I L U`. */
export const BOOKING_ID_RE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
