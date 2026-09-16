/**
 * Primitif mana yang melepas jadwal ini saat hold-nya habis — SATU keputusan,
 * satu tempat.
 *
 * ⚠️ INI INTI KESELAMATAN HALAMAN PER-JADWAL.
 *
 * Ada DUA primitif dan lingkupnya BERBEDA:
 *
 *   `releaseExpiredSlot(submissionId)`  menulis `form_submissions`  → lingkup ORDER
 *   `cancelSchedule(entry)`             menulis `ad_schedules`      → lingkup JADWAL
 *
 * Doc `releaseExpiredSlot` memperingatkan sendiri: *"untuk order berjadwal
 * banyak, `releaseExpiredSlot` akan ikut mematikan tagihan jadwal lain."*
 * `PaymentCheckoutPage` memanggilnya dan itu aman SELAMA halaman itu hanya
 * melayani ordinal 1 dari order berjadwal tunggal. Halaman per-jadwal tidak
 * punya jaminan itu.
 *
 * ⚠️ Yang menentukan BUKAN ordinal semata, melainkan apakah ada SAUDARA yang
 * bisa ikut terseret. Order ordinal-1 yang sudah punya jadwal ke-2 tetap wajib
 * memakai primitif berlingkup-jadwal.
 *
 * Terukur di produksi 2026-09-17:
 *
 *   order berjadwal banyak                        : 20
 *   baris ordinal 1 yang PUNYA saudara            : 20
 *   di antaranya `user` + belum lunas (berbahaya) :  0
 *
 * Nol hari ini — jadi bahayanya LATEN, bukan aktif. Ia menyala begitu peneliti
 * pertama memesan sendiri jadwal ke-2 pada order yang jadwal pertamanya juga
 * dipesan sendiri dan belum lunas. Gerbang `siblingCount` ada supaya hari itu
 * tidak pernah jadi insiden.
 *
 * ⚠️ Terukur 2026-09-17: 0 dari 25 jadwal ordinal >=2 pernah punya
 * `slot_booked_by='user'` — jalur ini belum pernah hidup di produksi.
 *
 * Murni: masuk keadaan, keluar rencana. Tidak memanggil apa pun.
 */

export interface ExpirySubject {
  /** `ad_schedules.ordinal`. */
  ordinal: number;
  /** Jumlah jadwal pada ORDER yang sama, termasuk jadwal ini sendiri. */
  siblingCount: number;
  slotBookedBy: string | null | undefined;
  paymentStatus: string | null | undefined;
}

export type ExpiryPrimitive = 'releaseExpiredSlot' | 'cancelSchedule' | 'none';

export interface ExpiryPlan {
  primitive: ExpiryPrimitive;
  /** Apa yang tersentuh kalau primitifnya dijalankan. */
  scope: 'order' | 'schedule' | 'none';
  /** Kenapa tidak melepas, kalau memang tidak. */
  reason?: 'admin_hold' | 'already_paid';
}

const PAID_STATUSES = ['paid', 'completed'];

export function expiryPlanFor(subject: ExpirySubject): ExpiryPlan {
  /*
    Penjaga lunas lebih dulu, dan ia menang atas segalanya. Penjaga yang sama
    berdiri di dalam `cancelSchedule` dan `releaseExpiredSlot`; diulang di sini
    supaya layar tidak pernah sampai memanggilnya — dan supaya `payment_status`
    yang basi tidak pernah jadi satu-satunya yang memutuskan (memori proyek:
    `payment_status` bukan bukti pembayaran).
  */
  if (PAID_STATUSES.includes(subject.paymentStatus || '')) {
    return { primitive: 'none', scope: 'none', reason: 'already_paid' };
  }

  /*
    Hanya reservasi MANDIRI yang lepas karena waktu (`slotHold.ts`). Jadwal
    admin — dan baris lama tanpa `slot_booked_by` — tidak pernah lepas sendiri;
    melepasnya keputusan admin, bukan keputusan jam. 31 order produksi
    menunggu di jalur ini.
  */
  if (subject.slotBookedBy !== 'user') {
    return { primitive: 'none', scope: 'none', reason: 'admin_hold' };
  }

  /*
    ⚠️ Primitif berlingkup-ORDER hanya boleh dipakai kalau memang tidak ada
    yang bisa ikut terseret: ordinal 1 DAN tidak punya saudara.

    Perpanjangan (ordinal >=2) selalu berlingkup jadwal — barisnya hidup di
    `form_submissions_extend`, jadi menulis ke `form_submissions` tidak akan
    menyentuhnya sama sekali sambil merusak jadwal pertama.
  */
  const sendirian = subject.ordinal === 1 && subject.siblingCount <= 1;

  return sendirian
    ? { primitive: 'releaseExpiredSlot', scope: 'order' }
    : { primitive: 'cancelSchedule', scope: 'schedule' };
}
