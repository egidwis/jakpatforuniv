// Standalone test (no framework in this project).
// Run: node_modules/.bin/esbuild src/utils/slotHold.test.ts --bundle --platform=node --format=esm | node --input-type=module
import { SLOT_HOLD_MS, slotReleaseDeadline, isSlotHoldReleased } from './slotHold';

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

const RESERVED = '2026-08-10T02:00:00.000Z';
const RESERVED_MS = Date.parse(RESERVED);
const WITHIN = RESERVED_MS + 59 * 60 * 1000; // 59 menit sesudah
const AFTER = RESERVED_MS + 61 * 60 * 1000; // 61 menit sesudah

// ── Reservasi mandiri: satu-satunya yang punya umur ──────────────────
check(
  'user — tenggat = reservasi + 1 jam',
  slotReleaseDeadline({ slotBookedBy: 'user', slotReservedAt: RESERVED }),
  RESERVED_MS + SLOT_HOLD_MS,
);
check(
  'user — belum lewat 1 jam, belum lepas',
  isSlotHoldReleased({ slotBookedBy: 'user', slotReservedAt: RESERVED }, WITHIN),
  false,
);
check(
  'user — sudah lewat 1 jam, lepas',
  isSlotHoldReleased({ slotBookedBy: 'user', slotReservedAt: RESERVED }, AFTER),
  true,
);
check(
  'user — tepat di detik tenggat belum lepas (ambang eksklusif)',
  isSlotHoldReleased({ slotBookedBy: 'user', slotReservedAt: RESERVED }, RESERVED_MS + SLOT_HOLD_MS),
  false,
);

// ── Jadwal admin: TIDAK PERNAH lepas sendiri ─────────────────────────
// Ini inti perbaikannya. 35 jadwal admin di produksi semuanya sudah lewat
// 1 jam; kalau aturan ini salah, semuanya terhapus begitu penelitinya
// membuka halaman bayar.
check(
  'admin — tidak punya tenggat pelepasan',
  slotReleaseDeadline({ slotBookedBy: 'admin', slotReservedAt: RESERVED }),
  null,
);
check(
  'admin — lewat berhari-hari pun tidak lepas',
  isSlotHoldReleased({ slotBookedBy: 'admin', slotReservedAt: RESERVED }, RESERVED_MS + 30 * 864e5),
  false,
);

// ── Baris tanpa pemesan: juga tidak pernah lepas sendiri ─────────────
// 264 baris di produksi ber-slot_booked_by NULL. Cabang lama di
// PaymentCheckoutPage menghapusnya SEKETIKA, tanpa timer sama sekali.
check(
  'slot_booked_by NULL — tidak punya tenggat',
  slotReleaseDeadline({ slotBookedBy: null, slotReservedAt: RESERVED }),
  null,
);
check(
  'slot_booked_by NULL — tidak pernah lepas',
  isSlotHoldReleased({ slotBookedBy: null, slotReservedAt: RESERVED }, AFTER),
  false,
);
check(
  'slot_reserved_at NULL — tidak punya tenggat meski dipesan user',
  slotReleaseDeadline({ slotBookedBy: 'user', slotReservedAt: null }),
  null,
);
check(
  'slot_reserved_at NULL — tidak pernah lepas (bukan "sudah lepas")',
  isSlotHoldReleased({ slotBookedBy: 'user', slotReservedAt: null }, AFTER),
  false,
);
check(
  'keduanya NULL — tidak pernah lepas',
  isSlotHoldReleased({ slotBookedBy: null, slotReservedAt: null }, AFTER),
  false,
);

// ── Tanggal rusak diperlakukan seperti tidak ada, bukan seperti nol ──
// Date.parse('') = NaN; membiarkannya lolos membuat now > NaN jadi false
// tapi tenggatnya NaN — jadi ia disaring di sini, bukan di pemanggil.
check(
  'slot_reserved_at tidak bisa diurai — tidak punya tenggat',
  slotReleaseDeadline({ slotBookedBy: 'user', slotReservedAt: 'bukan-tanggal' }),
  null,
);

console.log(failures === 0 ? '\nAll slotHold tests passed.' : `\n${failures} test(s) FAILED.`);
if (failures > 0) process.exit(1);
