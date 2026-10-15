import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { addDaysToYmd, nextWorkingDay, toWibYmd } from './airing-window';

/**
 * Kalender libur operasional tim admin (Phase 5 §5.4b, tabel sql/117).
 *
 * Baca: anon + authenticated, langsung dari tabel (hanya tanggal, label,
 * saklar). Tulis: HANYA lewat `/api/admin/holidays` — tabelnya tanpa policy
 * tulis, jadi klien supabase dari browser selalu ditolak.
 *
 * Efek tanggal aktif: Kilat tutup (trigger sql/117 + picker), Iklan otomatis
 * tetap tayang, dan peneliti diberi banner bahwa admin libur.
 */
export interface OperationalHoliday {
  date: string;
  label: string;
  isActive: boolean;
}

export async function fetchHolidays(fromYmd: string, toYmd: string): Promise<OperationalHoliday[]> {
  const { data, error } = await supabase
    .from('operational_holidays')
    .select('holiday_date, label, is_active')
    .gte('holiday_date', fromYmd)
    .lte('holiday_date', toYmd)
    .order('holiday_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    date: r.holiday_date,
    label: r.label ?? '',
    isActive: r.is_active === true,
  }));
}

export async function saveHoliday(input: OperationalHoliday): Promise<OperationalHoliday> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sesi admin tidak ada. Masuk lagi lalu ulangi.');
  const res = await fetch('/api/admin/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ date: input.date, label: input.label, isActive: input.isActive }),
  });
  const raw = await res.text();
  let body: any = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* badan bukan JSON */ }
  if (!res.ok) throw new Error(body?.error || `Gagal menyimpan hari libur (HTTP ${res.status})`);
  const row = body?.data;
  return { date: row.holiday_date, label: row.label ?? '', isActive: row.is_active === true };
}

export function activeHolidaySet(rows: readonly OperationalHoliday[]): Set<string> {
  return new Set(rows.filter((h) => h.isActive).map((h) => h.date));
}

export interface AdminHolidayToday {
  label: string;
  /** Hari kerja berikutnya (YMD) — kapan review & komplain dilayani lagi. */
  resumesOn: string;
}

/** Keadaan banner "admin libur" untuk hari WIB `todayYmd`; null = hari biasa. */
export function adminHolidayOn(todayYmd: string, rows: readonly OperationalHoliday[]): AdminHolidayToday | null {
  const today = rows.find((h) => h.date === todayYmd && h.isActive);
  if (!today) return null;
  return { label: today.label, resumesOn: nextWorkingDay(todayYmd, activeHolidaySet(rows)) };
}

/**
 * Satu permintaan per muat halaman, dibagi semua banner yang terpasang.
 * Jendela 45 hari cukup untuk menemukan hari kerja berikutnya walau liburnya
 * beruntun (Natal–Tahun Baru).
 */
let todayCache: { ymd: string; promise: Promise<AdminHolidayToday | null> } | null = null;

export function loadAdminHolidayToday(now: Date = new Date()): Promise<AdminHolidayToday | null> {
  const ymd = toWibYmd(now);
  if (todayCache?.ymd === ymd) return todayCache.promise;
  const promise = fetchHolidays(ymd, addDaysToYmd(ymd, 45))
    .then((rows) => adminHolidayOn(ymd, rows))
    // Banner informatif: gagal baca = tidak tampil, jangan pernah memecahkan halaman.
    .catch(() => null);
  todayCache = { ymd, promise };
  return promise;
}

export function useAdminHolidayToday(): AdminHolidayToday | null {
  const [state, setState] = useState<AdminHolidayToday | null>(null);
  useEffect(() => {
    let alive = true;
    loadAdminHolidayToday().then((h) => { if (alive) setState(h); });
    return () => { alive = false; };
  }, []);
  return state;
}
