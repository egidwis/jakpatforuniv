import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { toWibYmd } from './airing-window';

/**
 * Mode libur tim admin (sql/122, keputusan 21 Okt 2026). Menggantikan
 * kalender per tanggal R3 yang tidak pernah dirilis.
 *
 * Satu baris "JFU_operational_holidays" = satu masa libur: `holiday_date` =
 * tanggal WIB saat toggle di halaman Submissions dinyalakan, `is_active` =
 * toggle. Menyala ⇔ ada baris aktif. Tidak ada tanggal kembali yang dibaca
 * mesin — pesan admin ("Kami kembali Senin, 29 Des.") hanya teks.
 *
 * Baca: anon + authenticated, HANYA empat kolom yang dihibahkan
 * (`holiday_date, label, label_en, is_active`) — meminta kolom lain membuat
 * SELURUH kueri ditolak. Tulis: HANYA lewat `/api/admin/holidays`.
 *
 * Efek menyala: Kilat tutup untuk peneliti di semua gelombang sejak tanggal
 * nyala (trigger sql/122), banner + modal di sisi peneliti, Iklan otomatis
 * tetap tayang.
 */
export const HOLIDAYS_TABLE = 'JFU_operational_holidays';
export const ADMIN_AWAY_MESSAGE_MAX = 80;

export interface AwayRow {
  date: string;
  label: string;
  labelEn: string;
  isActive: boolean;
}

/** Keadaan "tim admin libur" yang dibaca seluruh aplikasi. */
export interface AdminAway {
  /** YMD WIB saat toggle dinyalakan. */
  since: string;
  /** Pesan admin (≤80), boleh kosong. */
  message: string;
  /** Terjemahan otomatis; '' = belum/gagal → pakai `message`. */
  messageEn: string;
}

const COLUMNS = 'holiday_date, label, label_en, is_active';

function rowOf(r: any): AwayRow {
  return {
    date: String(r.holiday_date).slice(0, 10),
    label: r.label ?? '',
    labelEn: r.label_en ?? '',
    isActive: r.is_active === true,
  };
}

/** Baris aktif terbaru = masa libur yang sedang berjalan. */
export function adminAwayOf(rows: readonly AwayRow[]): AdminAway | null {
  const active = rows.filter((r) => r.isActive).sort((a, b) => b.date.localeCompare(a.date));
  if (active.length === 0) return null;
  return { since: active[0].date, message: active[0].label, messageEn: active[0].labelEn };
}

/** Pesan menurut bahasa; EN tanpa terjemahan jatuh ke teks Indonesia. */
export function awayMessageFor(away: AdminAway, language: string): string {
  return language === 'en' && away.messageEn ? away.messageEn : away.message;
}

export async function fetchActiveAwayRows(): Promise<AwayRow[]> {
  const { data, error } = await supabase
    .from(HOLIDAYS_TABLE)
    .select(COLUMNS)
    .eq('is_active', true)
    .order('holiday_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowOf);
}

/** Galat DILEMPAR — pemanggil yang memutuskan fail-open atau tidak. */
export async function fetchAdminAway(): Promise<AdminAway | null> {
  return adminAwayOf(await fetchActiveAwayRows());
}

export interface HolidayWrite {
  date: string;
  isActive: boolean;
  label?: string;
}

export async function postHoliday(body: HolidayWrite): Promise<AwayRow> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sesi admin tidak ada. Masuk lagi lalu ulangi.');
  const res = await fetch('/api/admin/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed: any = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* badan bukan JSON */ }
  if (!res.ok) throw new Error(parsed?.error || `Gagal menyimpan mode libur (HTTP ${res.status})`);
  return rowOf(parsed?.data ?? {});
}

export type AwayAction =
  | { kind: 'on'; message: string }
  | { kind: 'edit'; message: string }
  | { kind: 'off' };

/**
 * Tulisan untuk satu aksi toggle. Fungsi murni supaya aturan tanggalnya bisa
 * diuji:
 *   - nyalakan = tanggal WIB HARI INI (bukan tanggal device);
 *   - ubah pesan = tanggal baris aktif, bukan hari ini — kalau tidak, sunting
 *     di hari kedua libur melahirkan masa libur kedua;
 *   - matikan = SETIAP baris aktif, tanpa label (pesannya tidak dikosongkan).
 */
export function adminAwayWrites(action: AwayAction, active: readonly AwayRow[], now: Date = new Date()): HolidayWrite[] {
  if (action.kind === 'off') {
    return active.filter((r) => r.isActive).map((r) => ({ date: r.date, isActive: false }));
  }
  const message = action.message.trim();
  if (action.kind === 'edit') {
    const current = adminAwayOf(active);
    return [{ date: current ? current.since : toWibYmd(now), isActive: true, label: message }];
  }
  return [{ date: toWibYmd(now), isActive: true, label: message }];
}

/* ─── Store bersama ─────────────────────────────────────────────────────────
 * SATU poller untuk berapa pun pemakai (banner, kartu, modal, chat): baca
 * saat pemakai pertama muncul, saat tab kembali terlihat, dan tiap 60 detik.
 * Gagal baca = keadaan terakhir dipertahankan (sebelum pernah terbaca: tidak
 * libur). Server tetap penjaga terakhir untuk Kilat (trigger sql/122).
 */
export const ADMIN_AWAY_POLL_MS = 60_000;

const sameAway = (a: AdminAway | null, b: AdminAway | null) =>
  a === b || (!!a && !!b && a.since === b.since && a.message === b.message && a.messageEn === b.messageEn);

export function createAdminAwayStore(fetcher: () => Promise<AdminAway | null>) {
  let current: AdminAway | null = null;
  let users = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inflight: Promise<AdminAway | null> | null = null;
  const listeners = new Set<() => void>();

  const refresh = (): Promise<AdminAway | null> => {
    if (inflight) return inflight;
    inflight = fetcher()
      .then((next) => {
        if (!sameAway(current, next)) {
          current = next;
          listeners.forEach((l) => l());
        }
        return current;
      })
      .catch((err) => {
        console.warn('[mode libur] gagal membaca status:', err);
        return current;
      })
      .finally(() => { inflight = null; });
    return inflight;
  };

  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') void refresh();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    users += 1;
    if (users === 1) {
      void refresh();
      timer = setInterval(() => void refresh(), ADMIN_AWAY_POLL_MS);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      listeners.delete(listener);
      users -= 1;
      if (users === 0) {
        if (timer) clearInterval(timer);
        timer = null;
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      }
    };
  };

  return { subscribe, get: () => current, refresh };
}

const store = createAdminAwayStore(fetchAdminAway);

/** Keadaan libur saat ini (sinkron) — untuk keputusan di dalam handler klik. */
export const getAdminAway = store.get;
export const refreshAdminAway = store.refresh;

export function useAdminAway(): AdminAway | null {
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}

/* ─── Ack modal per masa libur ──────────────────────────────────────────────
 * "Lanjutkan" dicatat per `since` di sessionStorage supaya modal tidak muncul
 * dua kali dalam satu alur; × TIDAK dicatat. Masa libur baru = since baru =
 * modal muncul lagi.
 */
const ACK_KEY = 'jfu.adminAwayAck';

export function isAwayAcked(since: string, storage: Pick<Storage, 'getItem'> | null = safeSession()): boolean {
  try { return storage?.getItem(ACK_KEY) === since; } catch { return false; }
}

export function ackAway(since: string, storage: Pick<Storage, 'setItem'> | null = safeSession()): void {
  try { storage?.setItem(ACK_KEY, since); } catch { /* storage diblokir: modal muncul lagi, tidak apa-apa */ }
}

function safeSession(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}
