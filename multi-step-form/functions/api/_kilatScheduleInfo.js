// Jenis distribusi sebuah jadwal untuk email notifikasi (Phase 5 §5.8).
//
// Payload cron (sql/95 notify_primary_ads_live / notify_ads_completed) tidak
// membawa distribution_type, tetapi membawa schedule_id. Daripada mengubah
// fungsi cron (SQL baru), jenisnya dibaca di sini dengan service role.
//
// ⚠️ GAGAL = BUKAN KILAT. Email tetap terkirim dengan copy Iklan; notifikasi
// yang hilang lebih buruk daripada kata yang kurang tepat.

/** @returns {Promise<{ isKilat: boolean, hour: number | null }>} */
export async function scheduleKindOf(env, scheduleId) {
  const none = { isKilat: false, hour: null };
  const url = env?.VITE_SUPABASE_URL || env?.SUPABASE_URL;
  // Nama yang dipakai Pages Function lain = SUPABASE_SERVICE_ROLE_KEY; versi
  // VITE_ hanya cadangan. Dulu cuma VITE_ — kalau tak ada, email Kilat diam-diam
  // jatuh ke copy Iklan (lihat ⚠️ di atas).
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!scheduleId || !url || !key) return none;
  try {
    const res = await fetch(
      `${url}/rest/v1/ad_schedules?id=eq.${encodeURIComponent(scheduleId)}&select=distribution_type,kilat_slot_hour`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return none;
    const [row] = await res.json();
    if (row?.distribution_type !== 'kilat') return none;
    return { isKilat: true, hour: row.kilat_slot_hour == null ? null : Number(row.kilat_slot_hour) };
  } catch (e) {
    console.warn('[scheduleKindOf] gagal membaca jenis jadwal:', e?.message || e);
    return none;
  }
}

export const waveLabel = (hour) =>
  hour == null ? 'Kilat Survei' : `Gelombang ${String(hour).padStart(2, '0')}.00 WIB`;
