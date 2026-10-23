import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type { FormSubmission } from './supabase';
import {
  adminAwayOf,
  adminAwayWrites,
  createAdminAwayStore,
  type AdminAway,
  type AwayAction,
  type AwayRow,
  type HolidayWrite,
} from './operationalHolidays';
import { isAutoReviewed } from '../components/status/deriveOrderUiState';

/**
 * Tutup reservasi mandiri (sql/125, keputusan 22 Okt 2026). Kembaran mode
 * libur: satu baris "JFU_self_booking_closures" = satu masa tutup,
 * `closed_on` = tanggal WIB saat saklar di Submissions dinyalakan,
 * `is_active` = saklar. Bentuk barisnya sama dengan tabel libur, jadi aturan
 * murni mode libur (`adminAwayOf`, `adminAwayWrites`) dipakai ulang apa adanya.
 *
 * Efek ditutup: peneliti jalur review otomatis tidak memilih tanggal dan tidak
 * menerbitkan tagihan sendiri. Order baru tetap diterima (lolos review
 * otomatis) dan dicap server — tim yang menjadwalkan, PERMANEN.
 *
 * Baca: anon + authenticated, HANYA empat kolom yang dihibahkan — meminta
 * kolom lain membuat SELURUH kueri ditolak. Tulis: HANYA lewat
 * `/api/admin/self-booking`. Penjaga terakhir ada di server (lock.js +
 * trigger `trg_01_self_booking`); store ini hanya untuk tampilan.
 */
export const SELF_BOOKING_TABLE = 'JFU_self_booking_closures';
export const SELF_BOOKING_CLOSED = 'self_booking_closed';

/** Keadaan "reservasi mandiri ditutup": `since` = tanggal WIB nyala. */
export type SelfBookingClosure = AdminAway;

const COLUMNS = 'closed_on, label, label_en, is_active';

function rowOf(r: any): AwayRow {
  return {
    date: String(r.closed_on).slice(0, 10),
    label: r.label ?? '',
    labelEn: r.label_en ?? '',
    isActive: r.is_active === true,
  };
}

export const closureOf = adminAwayOf;
export const closureWrites: (action: AwayAction, active: readonly AwayRow[], now?: Date) => HolidayWrite[] = adminAwayWrites;

export async function fetchActiveClosureRows(): Promise<AwayRow[]> {
  const { data, error } = await supabase
    .from(SELF_BOOKING_TABLE)
    .select(COLUMNS)
    .eq('is_active', true)
    .order('closed_on', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowOf);
}

/** Galat DILEMPAR — pemanggil yang memutuskan fail-open atau tidak. */
export async function fetchSelfBookingClosure(): Promise<SelfBookingClosure | null> {
  return closureOf(await fetchActiveClosureRows());
}

export async function postSelfBooking(body: HolidayWrite): Promise<AwayRow> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sesi admin tidak ada. Masuk lagi lalu ulangi.');
  const res = await fetch('/api/admin/self-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed: any = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* badan bukan JSON */ }
  if (!res.ok) throw new Error(parsed?.error || `Gagal menyimpan saklar reservasi (HTTP ${res.status})`);
  return rowOf(parsed?.data ?? {});
}

/* SATU poller (60 detik + saat tab terlihat) untuk berapa pun pemakai.
 * Gagal baca = keadaan terakhir dipertahankan (sebelum pernah terbaca: buka). */
const store = createAdminAwayStore(fetchSelfBookingClosure, 'reservasi mandiri');

/** Keadaan saklar saat ini (sinkron) — untuk keputusan di dalam handler klik. */
export const getSelfBookingClosure = store.get;
export const refreshSelfBookingClosure = store.refresh;

export function useSelfBookingClosure(): SelfBookingClosure | null {
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}

type CapRow = Pick<FormSubmission, 'self_booking_closed_at'> | null | undefined;

/** Peneliti tidak boleh memilih tanggal / menerbitkan tagihan sendiri sekarang. */
export function selfBookingBlocked(submission: CapRow, closure: SelfBookingClosure | null): boolean {
  return !!closure || !!submission?.self_booking_closed_at;
}

/**
 * SATU predikat "peneliti boleh menjadwalkan sendiri": jalur review otomatis,
 * tanpa cap, saklar terbuka. Order jalur manual tanggalnya milik admin
 * (keputusan produk 2026-08-25), order bercap milik tim selamanya.
 */
export function canSelfSchedule(submission: FormSubmission, closure: SelfBookingClosure | null): boolean {
  return isAutoReviewed(submission) && !selfBookingBlocked(submission, closure);
}

/** Penolakan lock.js (409 + `code`) atau trigger sql/125 (HINT). */
export function isSelfBookingClosedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; hint?: unknown };
  return e.code === SELF_BOOKING_CLOSED || e.hint === SELF_BOOKING_CLOSED;
}
