import { slotReleaseDeadline } from './slotHold';
import { payDeadlineFor } from './airing-window';
import type { PageScreen } from './schedulePageState';

/**
 * Gerbang uang halaman Jadwal & Bayar — murni, supaya bisa diuji tanpa
 * merender halaman. Setiap cabang di sini menentukan apakah sebuah tagihan
 * DOKU lahir atau sebuah tanggal berpindah; jangan disalin ke komponen.
 */

export interface AutoMintInput {
  screen: PageScreen;
  ordinal: number;
  slotBookedBy: string | null | undefined;
  paymentStatus: string | null | undefined;
  /** Tagihan jadwal ini SUDAH terbaca (berhasil). Gagal baca ≠ "belum ada". */
  billingLoaded: boolean;
  hasOpenBill: boolean;
  owedOnCredit: boolean;
  /** Batas bayar hari tayang sudah lewat (Iklan 14.00 WIB, Kilat gelombang − 60 menit). */
  tooLate: boolean;
  /** Countdown hold 1 jam sudah menyentuh nol. */
  holdExpired: boolean;
}

/**
 * Boleh menerbitkan tagihan otomatis saat halaman dibuka?
 *
 * ⚠️ SATU PEMICU (keputusan 19 Agu 2026). Tagihan reservasi mandiri ordinal 1
 * terbit di halaman ini — bukan di wizard, bukan di fungsi rebook — supaya
 * tidak ada dua tempat yang bisa berselisih. Server (`create-payment.js`)
 * memakai ulang tagihan hidup yang setara dan mencabut tagihan jadwal yang
 * sama bila tanggalnya pindah, jadi pemanggilan berulang tidak melahirkan
 * tagihan kembar.
 *
 * Sengaja SEMPIT:
 *   - hanya `slot_booked_by='user'`: jadwal admin ditagih admin (bisa dengan
 *     voucher/nominal pilihannya); dashboard menunjuk ke sini untuk keduanya,
 *     tapi halaman tidak boleh mendahului keputusan admin.
 *   - hanya ordinal 1: perpanjangan lahir BERSAMA tagihannya di JadwalBaruPage.
 *   - tagihan harus sudah terbaca: fetch yang gagal bukan bukti ketiadaan.
 *   - lewat 14.00 menunggu pilihan peneliti (tanggal lain vs tetap bayar).
 */
export function shouldAutoMint(input: AutoMintInput): boolean {
  if (input.screen !== 'awaiting_payment') return false;
  if (input.ordinal !== 1) return false;
  if (input.slotBookedBy !== 'user') return false;
  if (['paid', 'completed', 'expired'].includes((input.paymentStatus || '').toLowerCase())) return false;
  if (!input.billingLoaded || input.hasOpenBill) return false;
  if (input.owedOnCredit || input.tooLate || input.holdExpired) return false;
  return true;
}

export interface RepickInput {
  ordinal: number;
  /** Jumlah jadwal order ini, termasuk yang ini. */
  siblingCount: number;
  /** `form_submissions.submission_status`; null = belum terbaca. */
  submissionStatus: string | null | undefined;
  /** `ad_schedules.status`. */
  scheduleStatus: string | null | undefined;
  /** `isAutoReviewed(submission)` — predikat yang sama dengan tombol dashboard. */
  autoReviewed: boolean;
}

/**
 * Boleh memilih tanggal lain DI TEMPAT (`rebookSlotForSubmission`)?
 *
 * ⚠️ `cancelSchedule()` JUGA menulis `payment_status='expired'`, jadi "dilepas
 * karena waktu habis" dan "dibatalkan" terbaca sama oleh mesin keadaan.
 * Pembatalan tidak boleh dihidupkan lagi dari sini (penjaga Track B2 di
 * `rebookSlotForSubmission` akan menolak, dan layar berakhir di galat).
 *
 * ⚠️ `rebookSlotForSubmission` berlingkup ORDER — ia menulis tanggal ke
 * `form_submissions`. Untuk order berjadwal banyak itu bukan lagi "jadwal ini",
 * jadi hanya order berjadwal tunggal yang boleh.
 *
 * Jalur review manual: tanggalnya milik tim (keputusan 25 Agu 2026), sama
 * dengan tombol "Jadwalkan Ulang" di dashboard.
 */
export function canRepickInPlace(input: RepickInput): boolean {
  if (input.ordinal !== 1) return false;
  if (input.siblingCount > 1) return false;
  if (!input.autoReviewed) return false;
  if (!input.submissionStatus || input.submissionStatus === 'slot_cancelled') return false;
  if (['cancelled', 'slot_cancelled'].includes((input.scheduleStatus || '').toLowerCase())) return false;
  return true;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Umur link DOKU. Reservasi mandiri: ikut hold 1 jam (menerbitkan lebih awal
 * tidak memotong waktu peneliti). Jadwal admin tak punya umur hold: batas
 * bayar 14.00 hari tayang selagi masih di depan, kalau sudah lewat 7 hari —
 * sama dengan tagihan manual admin. Dulu jalur admin mengirim "Invalid Date".
 */
export function billExpiryFor(
  slot: {
    slotBookedBy: string | null | undefined;
    slotReservedAt: string | null | undefined;
    lockedYmd: string | null;
    /** Jam gelombang — HANYA untuk jadwal Kilat (lihat `payDeadlineFor`). */
    kilatHour?: number | null;
  },
  nowMs: number = Date.now(),
): Date {
  const releaseAt = slotReleaseDeadline({ slotBookedBy: slot.slotBookedBy ?? null, slotReservedAt: slot.slotReservedAt ?? null });
  const cutoff = slot.lockedYmd ? payDeadlineFor(slot.lockedYmd, slot.kilatHour).getTime() : null;
  /*
    ⚠️ KILAT: link tidak boleh hidup melewati gelombang − 60 menit (R6), apa pun
    sisa hold-nya. Hari ini hold selalu tiba lebih dulu (pesan ≤ H-2 jam + hold
    1 jam = H-1 jam), tapi itu kebetulan dua angka — `min` membuatnya aturan.
    Kilat yang batasnya sudah lewat tidak jatuh ke "+7 hari" seperti Iklan:
    server menolaknya (`kilatPaymentGate`), jadi umur link diberi batas itu
    sendiri dan penolakannya datang dari sana dengan pesan yang benar.
  */
  if (slot.kilatHour != null && cutoff !== null) {
    return new Date(releaseAt !== null ? Math.min(releaseAt, cutoff) : cutoff);
  }
  if (releaseAt !== null) return new Date(releaseAt);
  return new Date(cutoff !== null && cutoff > nowMs ? cutoff : nowMs + WEEK_MS);
}
