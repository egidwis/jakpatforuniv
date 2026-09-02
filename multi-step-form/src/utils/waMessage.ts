import { toast } from 'sonner';
import { formatWibDay, formatWibShort, paymentCutoffInstant, toWibYmd } from './airing-window';
import { formatRupiah } from './currency';

/**
 * Pesan WhatsApp ke peneliti, dan cara membukanya.
 *
 * Diangkat dari `SubmissionDetailSheet` begitu permukaan kedua (proses
 * penjadwalan) membutuhkannya. Alasannya sama seperti `currency.ts`: normalisasi
 * nomor dan cadangan clipboard adalah aturan yang, kalau disalin, mulai
 * menyimpang diam-diam — dan yang menyimpang di sini adalah nomor telepon orang.
 */

const rupiah = (n: number) => `Rp ${formatRupiah(n)}`;

/** Umur tagihan admin: 7 hari (`payment_due_date` di `createManualInvoice`). */
export const ADMIN_INVOICE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Nomor WA dalam bentuk yang diterima wa.me: hanya digit, awalan 62.
 *
 * `null` = tidak ada nomor yang bisa dipakai. Pemanggil WAJIB menangani itu;
 * mengirim ke string kosong membuka wa.me tanpa tujuan, yang terlihat seperti
 * berhasil.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  // `0812…` → `62812…`. Nomor yang sudah 62 atau ditulis +62 lolos apa adanya
  // karena `+` sudah ikut terbuang di atas.
  const withCountry = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
  // Nomor Indonesia terpendek yang sah masih 9 digit sesudah 62; di bawah itu
  // hampir pasti kolom yang terisi setengah, dan wa.me akan membuka obrolan
  // dengan orang yang salah alih-alih gagal.
  return withCountry.length >= 10 ? withCountry : null;
}

/** URL wa.me siap buka, atau `null` kalau nomornya tidak bisa dipakai. */
export function waLink(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * Buka WhatsApp; kalau nomornya tidak ada, salin pesannya dan katakan begitu.
 *
 * ⚠️ HARUS DIPANGGIL SINKRON DI DALAM HANDLER KLIK. `window.open` sesudah
 * `await` diblokir Safari & Chrome tanpa error apa pun — tabnya sekadar tidak
 * muncul. Permukaan yang perlu menunggu sesuatu dulu memakai
 * `openBlankTab()` + `sendToTab()` di bawah.
 */
export function openWhatsApp(phone: string | null | undefined, message: string): void {
  const link = waLink(phone, message);
  if (link) {
    window.open(link, '_blank');
    return;
  }
  navigator.clipboard?.writeText(message);
  toast.info('Nomor WhatsApp tidak tersedia. Pesan disalin ke clipboard.');
}

/**
 * Tab kosong yang dibuka SINKRON, untuk diarahkan nanti.
 *
 * Pasangan `openBlankTab` / `sendToTab` ada khusus untuk alur "kerjakan dulu,
 * baru kirim" (menerbitkan tagihan lalu mengirim link-nya). Tanpa ini tabnya
 * lahir sesudah `await` dan pemblokir popup membuangnya diam-diam.
 *
 * `null` = pemblokir popup menolak bahkan pembukaan sinkronnya; pemanggil jatuh
 * ke clipboard lewat `sendToTab`.
 */
export function openBlankTab(): Window | null {
  return window.open('', '_blank');
}

/**
 * Arahkan tab yang sudah dibuka ke WhatsApp — atau tutup dan salin, kalau
 * nomornya tidak ada. Tab yang gagal WAJIB ditutup: tab kosong menganga adalah
 * kegagalan yang tidak menjelaskan dirinya.
 */
export function sendToTab(tab: Window | null, phone: string | null | undefined, message: string): void {
  const link = waLink(phone, message);
  if (!link) {
    tab?.close();
    navigator.clipboard?.writeText(message);
    toast.info('Nomor WhatsApp tidak tersedia. Pesan disalin ke clipboard.');
    return;
  }
  if (tab) {
    tab.location.href = link;
  } else {
    window.open(link, '_blank');
  }
}

/** Batalkan tab yang terlanjur dibuka karena pekerjaannya gagal. */
export function closeTab(tab: Window | null): void {
  tab?.close();
}

// ─────────────────────────────────────────────────────────────
// Tenggat pembayaran
// ─────────────────────────────────────────────────────────────

/**
 * Kapan tagihan ini benar-benar mati.
 *
 * ⚠️ BUKAN "7 hari". Umur tagihan memang 7 hari, tapi batas yang lebih sering
 * mengikat adalah **14.00 WIB di hari tayang** (`PAYMENT_CUTOFF_HOUR_WIB`):
 * halaman iklannya dibangun admin antara 14.00 dan 15.00. Menuliskan "berlaku
 * 7 hari" pada jadwal yang tayang lusa adalah janji yang sistem sendiri akan
 * langgar tiga hari lagi.
 *
 * Untuk tagihan gabungan yang dikutip adalah tenggat PALING AWAL di antara
 * seluruh bundel — grupnya atomik dan tidak bisa dibayar sebagian, jadi jadwal
 * terdekatlah yang menentukan kapan uangnya harus masuk.
 *
 * Jadwal tanpa tanggal tidak menyumbang tenggat: belum ada hari tayang yang
 * bisa dilewatkan.
 */
export function paymentDeadline(
  startDates: Array<string | null | undefined>,
  issuedAt: Date = new Date(),
): Date {
  const candidates: number[] = [issuedAt.getTime() + ADMIN_INVOICE_LIFETIME_MS];
  for (const iso of startDates) {
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    candidates.push(paymentCutoffInstant(toWibYmd(d)).getTime());
  }
  return new Date(Math.min(...candidates));
}

/** "Jumat, 5 September 2026 pukul 14.00 WIB" — tenggat yang tidak bisa salah baca. */
export function formatDeadline(deadline: Date): string {
  return `${formatWibDay(deadline.toISOString())} pukul 14.00 WIB`;
}

// ─────────────────────────────────────────────────────────────
// Isi pesan
// ─────────────────────────────────────────────────────────────

const greet = (name: string | null | undefined) => `Halo Kak ${name?.trim() || 'Peneliti'},`;
const SIGNATURE = 'Terima kasih! 🙏\nTim Jakpat for Universities';

export interface InvoiceBundleSummary {
  title: string;
  /** Instant ISO mulai tayang, atau null kalau jadwalnya belum bertanggal. */
  startDate?: string | null;
}

export interface InvoiceReadyInput {
  researcherName?: string | null;
  bundles: InvoiceBundleSummary[];
  amount: number;
  invoiceUrl: string;
  /** Default: dihitung dari `bundles` lewat `paymentDeadline`. */
  deadline?: Date;
  issuedAt?: Date;
}

const bundleLine = (b: InvoiceBundleSummary) =>
  b.startDate
    ? `• ${b.title} — tayang ${formatWibShort(b.startDate)}`
    : `• ${b.title}`;

/**
 * "Tagihan sudah terbit" — satu pesan, satu link, N survei.
 *
 * Menyebut SELURUH survei yang ditanggung, karena satu link yang menagih empat
 * pesanan tanpa menyebut keempatnya adalah tagihan yang tidak bisa diperiksa
 * penerimanya.
 */
export function invoiceReadyMessage(input: InvoiceReadyInput): string {
  const { researcherName, bundles, amount, invoiceUrl } = input;
  const deadline = input.deadline
    ?? paymentDeadline(bundles.map((b) => b.startDate), input.issuedAt);

  const heading = bundles.length > 1
    ? `Tagihan untuk ${bundles.length} pesanan Anda sudah kami terbitkan:`
    : 'Tagihan untuk pesanan Anda sudah kami terbitkan:';

  return [
    greet(researcherName),
    '',
    heading,
    bundles.map(bundleLine).join('\n'),
    '',
    `Total: ${rupiah(amount)}${bundles.length > 1 ? ' (dibayar sekaligus dalam satu link)' : ''}`,
    `Link pembayaran: ${invoiceUrl}`,
    '',
    `Mohon diselesaikan paling lambat ${formatDeadline(deadline)} agar jadwal tayangnya tidak bergeser.`,
    '',
    SIGNATURE,
  ].join('\n');
}

export interface SlotBookedInput {
  researcherName?: string | null;
  title: string;
  /** Instant ISO mulai tayang. Wajib — pesan ini justru mengabarkan tanggalnya. */
  startDate: string;
  bookingId?: string | null;
}

/**
 * "Slot Anda sudah kami pesan, tagihannya menyusul."
 *
 * Sengaja TIDAK menyebut nominal maupun tenggat: pada momen ini tagihannya
 * belum ada, dan angka yang dikutip sebelum tagihan terbit adalah angka yang
 * akan dibantah tagihannya sendiri.
 */
export function slotBookedMessage(input: SlotBookedInput): string {
  const { researcherName, title, startDate, bookingId } = input;
  return [
    greet(researcherName),
    '',
    `Slot iklan untuk "${title}" sudah kami pesankan:`,
    `📅 Mulai tayang ${formatWibShort(startDate)} pukul 15.00 WIB`,
    ...(bookingId ? [`🔖 Kode jadwal: #${bookingId}`] : []),
    '',
    'Tagihannya akan kami kirimkan menyusul di chat ini. Slotnya kami tahan sampai tagihan itu jatuh tempo.',
    '',
    SIGNATURE,
  ].join('\n');
}

export interface ReviewFeedbackInput {
  researcherName?: string | null;
  formTitle?: string | null;
  note: string;
}

/**
 * Catatan perbaikan hasil review. Teksnya dipertahankan persis seperti versi
 * di `SubmissionDetailSheet` sebelum diangkat ke sini — ini pesan yang sudah
 * dikirim ratusan kali, bukan tempat memperbaiki gaya bahasa.
 */
export function reviewFeedbackMessage(input: ReviewFeedbackInput): string {
  const { researcherName, formTitle, note } = input;
  return `Halo Kak ${researcherName || 'Peneliti'},\n\nTerima kasih telah mengajukan kuesioner "${formTitle || 'Kuesioner'}" di Jakpat for Universities.\n\nSaat proses review, kami menemukan catatan berikut:\n📌 "${note}"\n\nMohon perbaiki kuesioner Anda, lalu buka dashboard Jakpat dan klik tombol "Saya Sudah Perbaiki Kuesioner" agar dapat kami proses kembali.\n\nTerima kasih! 🙏\nTim Reviewer Jakpat for Universities`;
}
