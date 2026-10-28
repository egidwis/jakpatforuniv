import { KILAT_QUOTA_PER_SLOT } from './constants';
import { addDaysToYmd, isKilatWaveBookable, kilatLastBookableYmd, KILAT_SELF_SERVE_WORKDAYS, nextWibWorkdays, toWibYmd } from './airing-window';
import type { TranslationKey } from '../i18n/translations';
import type { KilatWaveErrorKind } from './dailyQuotaError';

/**
 * Okupansi gelombang JFU Kilat untuk pemilih peneliti (Phase 5 §5.5, R5).
 *
 * Sumbernya SATU: RPC `get_kilat_wave_occupancy` (sql/117) — hitungan per
 * (hari, jam) dari kedua kaki jadwal, tanpa identitas, plus tanda libur dan
 * akhir pekan. Fungsi di sini hanya membentuk barisnya untuk UI; aturan
 * kuota dan batas pesan tetap ditegakkan trigger saat INSERT/UPDATE.
 *
 * ⚠️ `booking_closes_at` dibaca dari server, bukan dihitung ulang di klien:
 * itu nilai yang sama yang dipakai `validate_kilat_wave_claim`, jadi pemilih
 * tidak bisa menawarkan gelombang yang pasti ditolak (selain karena jam
 * device yang meleset — itu urusan pesan galat trigger).
 */
export interface KilatWaveRow {
  date: string;
  hour: number;
  used: number;
  capacity: number;
  bookingClosesAt: string;
  isClosed: boolean;
  closedReason: 'weekend' | 'holiday' | null;
}

export type KilatWaveStatus = 'open' | 'full' | 'cutoff' | 'holiday' | 'weekend';

export interface KilatWaveCell extends KilatWaveRow {
  status: KilatWaveStatus;
  remaining: number;
}

export interface KilatWaveDay {
  ymd: string;
  isHoliday: boolean;
  waves: KilatWaveCell[];
  /** Ada minimal satu gelombang yang masih bisa dipesan. */
  hasOpenWave: boolean;
}

/** Hari kalender yang diminta ke RPC: cukup untuk 3 hari kerja walau melewati akhir pekan. */
export const KILAT_WAVE_WINDOW_DAYS = 7;
/** Berapa hari kerja yang ditawarkan ke peneliti (sql/122 K3). Dulu 10 = dua minggu. */
export const KILAT_WAVE_WORKDAYS = KILAT_SELF_SERVE_WORKDAYS;

/**
 * Hari kerja SESUDAH jendela pesan — dirender terkunci "Belum tersedia" supaya
 * peneliti melihat batas 3 hari kerja, bukan menyangka tanggal sisanya penuh.
 * Murni tampilan: tidak pernah bisa dipilih dan tidak masuk `kilatWaveDays`.
 */
export function kilatPreviewDayYmd(now: Date = new Date()): string {
  return nextWibWorkdays(KILAT_WAVE_WORKDAYS + 1, now)[KILAT_WAVE_WORKDAYS];
}

export function kilatWaveWindow(now: Date = new Date()): { from: string; to: string } {
  const from = toWibYmd(now);
  return { from, to: addDaysToYmd(from, KILAT_WAVE_WINDOW_DAYS) };
}

export function parseKilatOccupancy(data: unknown): KilatWaveRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({
    date: String(r.wave_date).slice(0, 10),
    hour: Number(r.wave_hour),
    used: Number(r.used) || 0,
    capacity: Number(r.capacity) || KILAT_QUOTA_PER_SLOT,
    bookingClosesAt: String(r.booking_closes_at),
    isClosed: r.is_closed === true,
    closedReason: r.closed_reason === 'weekend' || r.closed_reason === 'holiday' ? r.closed_reason : null,
  }));
}

/**
 * Urutan pemeriksaan = urutan trigger: hari tertutup (akhir pekan/libur) →
 * batas pesan → kuota. Tepat di detik batas masih boleh (`now() >` di SQL).
 */
export function kilatWaveStatus(row: KilatWaveRow, now: Date = new Date()): KilatWaveStatus {
  if (row.isClosed) return row.closedReason === 'holiday' ? 'holiday' : 'weekend';
  if (now.getTime() > Date.parse(row.bookingClosesAt)) return 'cutoff';
  if (row.used >= row.capacity) return 'full';
  return 'open';
}

/**
 * Baris RPC → hari kerja yang ditawarkan. Akhir pekan tidak dirender sama
 * sekali (sama dengan papan admin); hari libur DIRENDER tertutup supaya
 * peneliti tahu kenapa tanggal itu hilang dari pilihan.
 */
export function kilatWaveDays(
  rows: readonly KilatWaveRow[],
  now: Date = new Date(),
  count: number = KILAT_WAVE_WORKDAYS,
): KilatWaveDay[] {
  const byDay = new Map<string, KilatWaveCell[]>();
  const last = kilatLastBookableYmd(now);
  for (const row of rows) {
    if (row.closedReason === 'weekend') continue;
    // Di luar jendela 3 hari kerja: tidak dirender (server juga menolaknya).
    if (row.date > last) continue;
    const cell: KilatWaveCell = {
      ...row,
      status: kilatWaveStatus(row, now),
      remaining: Math.max(row.capacity - row.used, 0),
    };
    const list = byDay.get(row.date) ?? [];
    list.push(cell);
    byDay.set(row.date, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, count)
    .map(([ymd, waves]) => {
      const sorted = waves.sort((a, b) => a.hour - b.hour);
      return {
        ymd,
        isHoliday: sorted.some((w) => w.closedReason === 'holiday'),
        waves: sorted,
        hasOpenWave: sorted.some((w) => w.status === 'open'),
      };
    });
}

/**
 * Tidak ada satu pun gelombang yang bisa dipesan di jendela peneliti?
 *
 *   null     → ada yang terbuka, pemilih biasa.
 *   'full'   → setiap gelombang yang tidak libur & belum lewat batas sudah
 *              penuh (dan minimal satu penuh) — kuota yang menutupnya.
 *   'closed' → buntu karena libur / lewat batas saja.
 *
 * Keduanya berujung sama: order dikirim, tim yang menjadwalkan (keputusan
 * 27 Okt 2026, cap sql/125). Bedanya cuma judul kartu. Pemanggil WAJIB
 * memeriksa `isReady && !hasError` lebih dulu — KOSONG BUKAN PENUH.
 */
export function kilatNoBookableWave(days: readonly KilatWaveDay[]): 'full' | 'closed' | null {
  if (days.some((d) => d.hasOpenWave)) return null;
  const waves = days.flatMap((d) => d.waves);
  const contested = waves.filter((w) => w.status !== 'cutoff' && w.status !== 'holiday');
  return contested.length > 0 && contested.every((w) => w.status === 'full') ? 'full' : 'closed';
}

/** Satu gelombang sebagai pilihan: tanggal YMD + jam WIB. */
export interface KilatWavePick {
  ymd: string;
  hour: number;
}

/** Pilihan yang sedang disusun di layar: tanggal dulu, gelombang menyusul. */
export interface KilatWaveDraft {
  ymd: string;
  hour: number | null;
}

/** Pilihan masih sah terhadap okupansi terbaru? `null` = belum terbaca. */
export function kilatPickStatus(
  rows: readonly KilatWaveRow[],
  pick: KilatWavePick,
  now: Date = new Date(),
): KilatWaveStatus | null {
  const row = rows.find((r) => r.date === pick.ymd && r.hour === pick.hour);
  return row ? kilatWaveStatus(row, now) : null;
}

export const formatWaveHour = (hour: number) => `${String(hour).padStart(2, '0')}.00`;

export type KilatLockReason = 'no_date' | 'no_wave' | 'too_far' | 'past_cutoff' | 'holiday' | 'availability_unknown' | 'wave_full';

/** Kunci i18n per sebab — bertipe supaya salah ketik jadi galat kompilasi. */
const KILAT_LOCK_MESSAGE: Record<KilatLockReason, TranslationKey> = {
  no_date: 'slotErrorNoDate',
  no_wave: 'kilatErrorNoWave',
  too_far: 'kilatErrorWaveTooFar',
  past_cutoff: 'kilatErrorWaveClosed',
  holiday: 'kilatErrorWaveHoliday',
  availability_unknown: 'slotErrorAvailabilityUnknown',
  wave_full: 'errorSlotFullKilat',
};

export type KilatLockVerdict =
  | { ok: true; ymd: string; hour: number }
  | {
      ok: false;
      reason: KilatLockReason;
      messageKey: TranslationKey;
      /** Pilihan mati (lewat batas/libur/penuh) wajib dibersihkan. */
      clearSelection: boolean;
      shouldReload: boolean;
    };

/**
 * Boleh mengunci gelombang ini? Cermin `scheduleLockGate` untuk Kilat, dengan
 * urutan yang sama alasannya: tanpa pilihan → lewat batas (jam device, tak
 * perlu menunggu data) → data belum terbaca (KOSONG BUKAN LOWONG) → status
 * gelombang dari okupansi terbaru. Trigger sql/117 tetap penjaga terakhir.
 */
export function kilatLockGate(
  pick: KilatWaveDraft | null,
  availability: { isReady: boolean; rows: readonly KilatWaveRow[] },
  now: Date = new Date(),
): KilatLockVerdict {
  const no = (reason: KilatLockReason, extra: { clearSelection?: boolean; shouldReload?: boolean } = {}): KilatLockVerdict => ({
    ok: false,
    reason,
    messageKey: KILAT_LOCK_MESSAGE[reason],
    clearSelection: extra.clearSelection ?? false,
    shouldReload: extra.shouldReload ?? false,
  });

  if (!pick) return no('no_date');
  if (pick.hour == null) return no('no_wave');
  // Draf/halaman lama bisa membawa gelombang di luar jendela 3 hari kerja.
  if (pick.ymd > kilatLastBookableYmd(now)) return no('too_far', { clearSelection: true });
  if (!isKilatWaveBookable(pick.ymd, pick.hour, now)) return no('past_cutoff', { clearSelection: true });
  if (!availability.isReady) return no('availability_unknown', { shouldReload: true });

  const status = kilatPickStatus(availability.rows, { ymd: pick.ymd, hour: pick.hour }, now);
  if (status === null) return no('availability_unknown', { shouldReload: true });
  if (status === 'full') return no('wave_full', { clearSelection: true, shouldReload: true });
  // Mode libur (sql/122): RPC menandai setiap hari sejak tanggal nyala 'holiday'.
  if (status === 'holiday') return no('holiday', { clearSelection: true });
  if (status !== 'open') return no('past_cutoff', { clearSelection: true });
  return { ok: true, ymd: pick.ymd, hour: pick.hour };
}

/** Teguran untuk penolakan gelombang dari server (HINT trigger sql/117–120). */
export function kilatWaveErrorMessageKey(kind: KilatWaveErrorKind): TranslationKey {
  if (kind === 'full') return 'errorSlotFullKilat';
  if (kind === 'away') return 'kilatErrorWaveHoliday';
  if (kind === 'too_far') return 'kilatErrorWaveTooFar';
  return 'kilatErrorWaveClosed';
}
