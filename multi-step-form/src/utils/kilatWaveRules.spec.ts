import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isKilatWaveBookable, isWeekdayYmd, kilatBookingClosesAt, kilatLastBookableYmd, kilatPayDeadline, kilatWaveInstant, nextWibWorkdays,
} from './airing-window';
import {
  KILAT_BOOKING_LEAD_MIN, KILAT_PAY_LEAD_MIN, KILAT_QUOTA_PER_SLOT, KILAT_SELF_SERVE_OPEN, KILAT_SLOT_HOURS,
  MAX_KILAT_ADS_PER_DAY,
} from './constants';

/*
  Aturan waktu gelombang JFU Kilat (Phase 5 Task 5.4, rilis R2).

  Database menegakkan aturan yang sama lewat sql/117 untuk peneliti (trigger
  klaim) dan untuk semua penulis (kuota). Perilaku SQL-nya dibuktikan dengan
  dijalankan (PGlite + Langkah 4 berkas itu, 20 kasus); di sini dikunci bahwa
  konstanta klien tidak melenceng dari angka di berkas itu.
*/

const T = (iso: string) => new Date(iso);
const sql117 = readFileSync(resolve(__dirname, '../../sql/117_kilat_swalayan.sql'), 'utf8');

describe('konstanta = sql/117', () => {
  test('gelombang 11 & 15, 2 kursi, pesan H-2 jam, bayar H-1 jam', () => {
    expect([...KILAT_SLOT_HOURS]).toEqual([11, 15]);
    expect(KILAT_QUOTA_PER_SLOT).toBe(2);
    expect(MAX_KILAT_ADS_PER_DAY).toBe(4);
    expect(KILAT_BOOKING_LEAD_MIN).toBe(120);
    expect(KILAT_PAY_LEAD_MIN).toBe(60);
  });

  test('angka yang sama tertulis di fungsi database', () => {
    expect(sql117).toContain(`SELECT ARRAY[${KILAT_SLOT_HOURS.join(', ')}]::smallint[]`);
    expect(sql117).toMatch(new RegExp(`max_kilat_per_wave\\(\\)\\s+RETURNS integer\\s+LANGUAGE sql\\s+IMMUTABLE\\s+AS \\$function\\$ SELECT ${KILAT_QUOTA_PER_SLOT} \\$function\\$`));
    expect(sql117).toContain(`SELECT kilat_instant_of(d, h) - interval '${KILAT_BOOKING_LEAD_MIN} minutes'`);
  });

  test('pintu swalayan terbuka untuk semua sejak Push B (26 Okt 2026)', () => {
    expect(KILAT_SELF_SERVE_OPEN).toBe(true);
  });
});

describe('instan gelombang & batasnya (WIB, bukan jam device)', () => {
  test.each([
    [11, '2026-11-16T04:00:00.000Z', '2026-11-16T02:00:00.000Z', '2026-11-16T03:00:00.000Z'],
    [15, '2026-11-16T08:00:00.000Z', '2026-11-16T06:00:00.000Z', '2026-11-16T07:00:00.000Z'],
  ])('gelombang %i.00: tayang %s, tutup pesan %s, tutup bayar %s', (hour, wave, closes, pay) => {
    expect(kilatWaveInstant('2026-11-16', hour).toISOString()).toBe(wave);
    expect(kilatBookingClosesAt('2026-11-16', hour).toISOString()).toBe(closes);
    expect(kilatPayDeadline('2026-11-16', hour).toISOString()).toBe(pay);
  });
});

describe('isKilatWaveBookable', () => {
  // Senin 16 Nov 2026.
  test('tepat di detik batas masih boleh, sedetik sesudahnya tidak (= trigger: now() > batas)', () => {
    expect(isKilatWaveBookable('2026-11-16', 15, T('2026-11-16T13:00:00+07:00'))).toBe(true);
    expect(isKilatWaveBookable('2026-11-16', 15, T('2026-11-16T13:00:01+07:00'))).toBe(false);
    expect(isKilatWaveBookable('2026-11-16', 11, T('2026-11-16T09:00:00+07:00'))).toBe(true);
    expect(isKilatWaveBookable('2026-11-16', 11, T('2026-11-16T09:00:01+07:00'))).toBe(false);
  });

  test('gelombang 11.00 tutup, 15.00 hari yang sama masih buka', () => {
    const now = T('2026-11-16T10:30:00+07:00');
    expect(isKilatWaveBookable('2026-11-16', 11, now)).toBe(false);
    expect(isKilatWaveBookable('2026-11-16', 15, now)).toBe(true);
  });

  test('jam lama & akhir pekan ditolak', () => {
    // Jumat 13 Nov: jendela 3 hari kerja s/d Selasa 17 Nov — akhir pekan & Senin di dalamnya.
    const now = T('2026-11-13T08:00:00+07:00');
    expect(isKilatWaveBookable('2026-11-16', 11, now)).toBe(true);
    for (const h of [8, 14, 17]) expect(isKilatWaveBookable('2026-11-16', h, now)).toBe(false);
    expect(isKilatWaveBookable('2026-11-14', 11, now)).toBe(false); // Sabtu
    expect(isKilatWaveBookable('2026-11-15', 15, now)).toBe(false); // Minggu
  });

  test('isWeekdayYmd tidak bergantung zona device', () => {
    expect(['2026-11-16', '2026-11-20'].map(isWeekdayYmd)).toEqual([true, true]);
    expect(['2026-11-21', '2026-11-22'].map(isWeekdayYmd)).toEqual([false, false]);
  });
});

describe('kilatLastBookableYmd — jendela 3 hari kerja (sql/122 K3)', () => {
  test('tabel keputusan: Sen→Rab, Kam→Sen, Jum→Sel, Sab/Min→Rab', () => {
    expect(kilatLastBookableYmd(T('2026-10-26T08:00:00+07:00'))).toBe('2026-10-28');
    expect(kilatLastBookableYmd(T('2026-10-29T08:00:00+07:00'))).toBe('2026-11-02');
    expect(kilatLastBookableYmd(T('2026-10-30T14:00:00+07:00'))).toBe('2026-11-03');
    expect(kilatLastBookableYmd(T('2026-10-31T08:00:00+07:00'))).toBe('2026-11-04');
    expect(kilatLastBookableYmd(T('2026-11-01T08:00:00+07:00'))).toBe('2026-11-04');
  });

  test('Jumat 23.30 WIB (16.30 UTC) masih Jumat; 17.30 UTC sudah Sabtu WIB', () => {
    expect(kilatLastBookableYmd(T('2026-10-30T16:29:00Z'))).toBe('2026-11-03');
    expect(kilatLastBookableYmd(T('2026-10-30T17:30:00Z'))).toBe('2026-11-04');
  });

  /*
    PARITAS dengan SQL `kilat_last_bookable_date` — tabel ini adalah keluaran
    fungsi SQL di harness PGlite sql/122 (24 Okt–6 Nov 2026). Mengubah aturan
    di salah satu sisi tanpa sisi lain akan memerahkan tes ini.
  */
  test('paritas 14 hari dengan kilat_last_bookable_date (PGlite)', () => {
    const SQL: Array<[string, string]> = [
      ['2026-10-24', '2026-10-28'], ['2026-10-25', '2026-10-28'], ['2026-10-26', '2026-10-28'],
      ['2026-10-27', '2026-10-29'], ['2026-10-28', '2026-10-30'], ['2026-10-29', '2026-11-02'],
      ['2026-10-30', '2026-11-03'], ['2026-10-31', '2026-11-04'], ['2026-11-01', '2026-11-04'],
      ['2026-11-02', '2026-11-04'], ['2026-11-03', '2026-11-05'], ['2026-11-04', '2026-11-06'],
      ['2026-11-05', '2026-11-09'], ['2026-11-06', '2026-11-10'],
    ];
    for (const [day, last] of SQL) expect(kilatLastBookableYmd(T(`${day}T10:00:00+07:00`))).toBe(last);
  });

  test('hari ke-4 tidak bisa dipesan walau gelombangnya masih jauh dari batas', () => {
    const now = T('2026-11-16T08:00:00+07:00'); // Senin
    expect(isKilatWaveBookable('2026-11-18', 15, now)).toBe(true);  // Rabu = hari ke-3
    expect(isKilatWaveBookable('2026-11-19', 15, now)).toBe(false); // Kamis = hari ke-4
  });
});

describe('nextWibWorkdays', () => {
  test('Jumat 23.30 UTC = Sabtu 06.30 WIB → mulai Senin', () => {
    expect(nextWibWorkdays(3, T('2026-11-20T23:30:00Z'))).toEqual(['2026-11-23', '2026-11-24', '2026-11-25']);
  });

  test('hari kerja ikut dihitung bila hari ini Senin–Jumat WIB', () => {
    const days = nextWibWorkdays(10, T('2026-11-16T15:00:00+07:00'));
    expect(days[0]).toBe('2026-11-16');
    expect(days).toHaveLength(10);
    expect(days.every(isWeekdayYmd)).toBe(true);
    expect(days[9]).toBe('2026-11-27');
  });
});
