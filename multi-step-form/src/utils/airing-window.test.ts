// Standalone test (no framework in this project).
// Run: node_modules/.bin/esbuild src/utils/airing-window.test.ts --bundle --platform=node --format=esm | node --input-type=module
import {
  nowWib,
  isBookingClosedForDate,
  isPaymentTooLateForDate,
  normalizeScheduleDate,
  paymentCutoffInstant,
  toAiringStartIso,
  toAiringEndIso,
  toWibYmd,
} from './airing-window';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok  - ${name}`);
  } else {
    failures++;
    console.log(`FAIL  - ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

// Semua instant di bawah ditulis dalam UTC. WIB = UTC+7.
//   12:59 WIB = 05:59Z   13:00 WIB = 06:00Z
//   13:59 WIB = 06:59Z   14:00 WIB = 07:00Z
//   15:01 WIB = 08:01Z
const TODAY = '2026-08-05';
const at = (utc: string) => new Date(`${TODAY}T${utc}Z`);

// ── 1. Cutoff pemesanan: 13.00 WIB ──────────────────────────────────────────
check('12:59 WIB → hari ini masih terbuka', isBookingClosedForDate(TODAY, at('05:59:00')), false);
check('13:00 WIB → hari ini tertutup', isBookingClosedForDate(TODAY, at('06:00:00')), true);
check('15:01 WIB → hari ini tertutup', isBookingClosedForDate(TODAY, at('08:01:00')), true);
// 00:00 WIB tgl 5 = 17:00Z tgl 4 (bukan tgl 5 — itu sudah midnight tgl 6).
check('00:00 WIB → hari ini terbuka', isBookingClosedForDate(TODAY, new Date('2026-08-04T17:00:00Z')), false);

// ── 2. Cutoff pembayaran: 14.00 WIB ─────────────────────────────────────────
check('13:59 WIB → pembayaran masih terkejar', isPaymentTooLateForDate(TODAY, at('06:59:00')), false);
check('14:00 WIB → pembayaran terlambat', isPaymentTooLateForDate(TODAY, at('07:00:00')), true);
check('16:00 WIB → pembayaran terlambat', isPaymentTooLateForDate(TODAY, at('09:00:00')), true);

// Pemesanan sudah tutup 13.00, tapi pembayaran masih boleh sampai 14.00 —
// justru itu jendela yang dipakai user yang memesan pukul 12.5x.
check(
  '13:30 WIB → pesan tutup tapi bayar masih boleh',
  [isBookingClosedForDate(TODAY, at('06:30:00')), isPaymentTooLateForDate(TODAY, at('06:30:00'))],
  [true, false],
);

// ── 3. Tanggal lain ─────────────────────────────────────────────────────────
check('besok selalu terbuka walau sekarang 23.00 WIB', isBookingClosedForDate('2026-08-06', at('16:00:00')), false);
check('besok tidak pernah terlambat dibayar', isPaymentTooLateForDate('2026-08-06', at('16:00:00')), false);
check('kemarin selalu tertutup', isBookingClosedForDate('2026-08-04', at('00:00:00')), true);
check('kemarin selalu terlambat', isPaymentTooLateForDate('2026-08-04', at('00:00:00')), true);

// ── 4. Konsisten lintas timezone device ─────────────────────────────────────
// Instant yang sama harus menghasilkan keputusan yang sama, apa pun TZ device.
// Nilai harapannya HARDCODED, dan runner menjalankan file ini beberapa kali
// dengan TZ berbeda (lihat perintah di bawah) — kalau ada yang bocor ke jam
// device, salah satu run pasti gagal.
//   for tz in Asia/Jakarta Asia/Makassar Asia/Jayapura UTC America/New_York; do
//     TZ=$tz <perintah run di baris 2>
//   done
const INSTANT = at('06:30:00'); // 13:30 WIB
check(`TZ device saat ini = ${process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone}`, true, true);
check(
  'keputusan 13:30 WIB tidak terpengaruh TZ device',
  [
    isBookingClosedForDate(TODAY, INSTANT),
    isPaymentTooLateForDate(TODAY, INSTANT),
    nowWib(INSTANT).ymd,
    nowWib(INSTANT).hour,
  ],
  [true, false, TODAY, 13],
);

// ── 5. Pergantian hari menurut WIB, bukan UTC ───────────────────────────────
// 23:30 WIB tanggal 5 = 16:30Z tanggal 5. Menurut UTC masih tanggal 5 juga,
// jadi pakai kasus yang benar-benar menyeberang: 07:00 WIB tanggal 6 = 00:00Z
// tanggal 6, dan 06:00 WIB tanggal 6 = 23:00Z tanggal 5.
check('23:30 WIB tgl 5 tetap dinilai tgl 5', nowWib(new Date('2026-08-05T16:30:00Z')).ymd, '2026-08-05');
check('06:00 WIB tgl 6 (23:00Z tgl 5) dinilai tgl 6', nowWib(new Date('2026-08-05T23:00:00Z')).ymd, '2026-08-06');
check('00:00 WIB tgl 6 (17:00Z tgl 5) dinilai tgl 6', nowWib(new Date('2026-08-05T17:00:00Z')).ymd, '2026-08-06');
check('jam 00 WIB dilaporkan sebagai 0, bukan 24', nowWib(new Date('2026-08-05T17:00:00Z')).hour, 0);

// ── 6. Instant jadwal ───────────────────────────────────────────────────────
check('start selalu 08:00Z (15.00 WIB)', toAiringStartIso(TODAY), '2026-08-05T08:00:00.000Z');
check('cutoff bayar selalu 07:00Z (14.00 WIB)', paymentCutoffInstant(TODAY).toISOString(), '2026-08-05T07:00:00.000Z');
check('end = start + n×24 jam', toAiringEndIso(TODAY, 7), '2026-08-12T08:00:00.000Z');
check('end kilat = start + 24 jam', toAiringEndIso(TODAY, 1), '2026-08-06T08:00:00.000Z');

// `normalizeScheduleDate` menyintesis 08:00 UTC untuk string date-only. Sejak
// Task 9B ia tinggal di modul ini juga, jadi uji ini memanggil fungsi yang
// sebenarnya alih-alih menyalin ulang rumusnya — dulu keduanya bisa menyimpang
// tanpa satu pun uji gagal.
check(
  'start cocok dengan normalizeScheduleDate untuk tanggal yang sama',
  toAiringStartIso(TODAY),
  normalizeScheduleDate(TODAY).toISOString(),
);
check(
  'normalizeScheduleDate membiarkan nilai yang sudah berjam apa adanya',
  normalizeScheduleDate('2026-08-05T01:00:00.000Z').toISOString(),
  '2026-08-05T01:00:00.000Z',
);

check('toWibYmd konsisten dengan nowWib', toWibYmd(INSTANT), nowWib(INSTANT).ymd);

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) failed.`);
if (failures > 0) process.exit(1);
