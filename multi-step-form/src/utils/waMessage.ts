import { toast } from 'sonner';
import { formatWibDay, formatWibShort, formatWibTime, payDeadlineFor, toWibYmd } from './airing-window';
import { formatRupiah } from './currency';
import { MAX_INVOICE_MINUTES } from './payment';

/**
 * Pesan WhatsApp ke peneliti, dan cara membukanya.
 *
 * Diangkat dari `SubmissionDetailSheet` begitu permukaan kedua (proses
 * penjadwalan) membutuhkannya. Alasannya sama seperti `currency.ts`: normalisasi
 * nomor dan cadangan clipboard adalah aturan yang, kalau disalin, mulai
 * menyimpang diam-diam — dan yang menyimpang di sini adalah nomor telepon orang.
 */

const rupiah = (n: number) => `Rp ${formatRupiah(n)}`;

/**
 * Umur MAKSIMUM tagihan admin, dalam ms.
 *
 * ⚠️ SATU SUMBER dengan `payment_due_date` yang benar-benar dikirim ke DOKU
 * (`MAX_INVOICE_MINUTES` di `payment.ts`). Sebelum Bagian 3 keduanya ditulis
 * terpisah sebagai "7 hari"; begitu salah satunya berubah, pesan WhatsApp mulai
 * menjanjikan link yang sudah mati — dan yang membacanya peneliti, bukan admin.
 *
 * Ini BATAS ATAS, bukan umur sesungguhnya: `paymentDeadline()` di bawah
 * mengambil yang paling awal antara ini dan batas bayar jadwalnya, persis
 * seperti `invoiceLifetimeMinutes()` melakukannya untuk link DOKU-nya.
 */
export const ADMIN_INVOICE_LIFETIME_MS = MAX_INVOICE_MINUTES * 60 * 1000;

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
  kilatHour?: number | null,
): Date {
  const candidates: number[] = [issuedAt.getTime() + ADMIN_INVOICE_LIFETIME_MS];
  for (const iso of startDates) {
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    candidates.push(payDeadlineFor(toWibYmd(d), kilatHour).getTime());
  }
  return new Date(Math.min(...candidates));
}

/** "Jumat, 5 September 2026 pukul 14.00 WIB" — tenggat yang tidak bisa salah baca. */
export function formatDeadline(deadline: Date): string {
  return `${formatWibDay(deadline.toISOString())} pukul ${formatWibTime(deadline.toISOString())} WIB`;
}

// ─────────────────────────────────────────────────────────────
// Isi pesan
// ─────────────────────────────────────────────────────────────

const greet = (name: string | null | undefined) => `Halo Kak ${name?.trim() || 'Peneliti'},`;
const SIGNATURE = 'Terima kasih! 🙏\nTim Jakpat for Universities';

export interface InvoiceItemDetail {
  name: string;
  qty?: number;
  price?: number;
  total?: number;
}

export interface InvoiceBundleSummary {
  title: string;
  /** Link form / kuesioner asli peneliti (opsional). */
  surveyUrl?: string | null;
  /** Instant ISO mulai tayang, atau null kalau jadwalnya belum bertanggal. */
  startDate?: string | null;
  /** Instant ISO selesai tayang, atau null kalau belum bertanggal. */
  endDate?: string | null;
  /** Jam gelombang Kilat (11 atau 15), jika pesanan Kilat. */
  kilatSlotHour?: number | null;
  /** Rincian item untuk pesanan ini (digunakan pada tagihan gabungan). */
  items?: InvoiceItemDetail[];
  /** Subtotal pesanan ini sebelum PPN (opsional). */
  subtotal?: number;
  /** PPN pesanan ini (opsional). */
  ppn?: number;
  /** Total/nominal pesanan ini (opsional). */
  amount?: number;
}

export interface InvoiceReadyInput {
  researcherName?: string | null;
  bundles: InvoiceBundleSummary[];
  amount: number;
  subtotal?: number;
  ppn?: number;
  items?: InvoiceItemDetail[];
  /**
   * ⚠️ HARUS LINK PERANTARA `/bayar/<ad_schedules.id>` (`payLinkUrl`), BUKAN
   * URL DOKU MENTAH.
   *
   * Pesan WhatsApp adalah permukaan yang paling tidak bisa ditarik kembali di
   * seluruh sistem ini: ia bertahan di riwayat chat penerimanya selamanya. URL
   * DOKU menagih untuk keadaan saat ia dicetak — order af004b84 dibayar lewat
   * link seperti itu, 20 menit sesudah jadwalnya dibatalkan.
   *
   * Ini juga yang akhirnya membuat `paymentDeadline()` di bawah bisa ditepati:
   * sebelumnya pesan ini menjanjikan tenggat sementara link-nya tidak tahu
   * apa-apa soal tenggat itu.
   */
  invoiceUrl: string;
  /** Default: dihitung dari `bundles` lewat `paymentDeadline`. */
  deadline?: Date;
  issuedAt?: Date;
  /**
   * Tagihan tempo (sql/102): iklannya tayang sesuai jadwal, pembayaran
   * menyusul, TANPA tenggat (K3). `deadline` diabaikan — menjanjikan tenggat
   * yang tidak ditegakkan apa pun lebih buruk daripada tidak menyebutnya.
   */
  tempo?: boolean;
  /**
   * Tagihan SUSULAN — jadwalnya sudah lunas, ini tambahan di atasnya. Iklannya
   * tidak menunggu tagihan ini, jadi "agar iklan bisa tayang sesuai jadwal" dan
   * "tetap tayang sesuai jadwal" dua-duanya salah alamat di sini.
   */
  topUp?: boolean;
  /** Apakah ini pesanan JFU Kilat */
  isKilat?: boolean;
}

const formatScheduleSuffix = (b: InvoiceBundleSummary): string => {
  if (!b.startDate) return '';
  if (b.kilatSlotHour != null) {
    return ` — gelombang ${formatWibShort(b.startDate)} pukul ${String(b.kilatSlotHour).padStart(2, '0')}.00 WIB`;
  }
  try {
    const startDay = formatWibShort(b.startDate);
    const startTime = `${formatWibTime(b.startDate)} WIB`;
    if (b.endDate) {
      const endDay = formatWibShort(b.endDate);
      const endTime = `${formatWibTime(b.endDate)} WIB`;
      if (endDay === startDay) {
        return ` — tayang ${startDay} pukul ${formatWibTime(b.startDate)} s/d ${endTime}`;
      }
      return ` — tayang ${startDay} pukul ${startTime} s/d ${endDay} pukul ${endTime}`;
    }
    return ` — tayang ${startDay} pukul ${startTime}`;
  } catch {
    return ` — tayang ${formatWibShort(b.startDate)}`;
  }
};

const formatItemLine = (it: InvoiceItemDetail, indent = ''): string => {
  const itemTotal = it.total ?? (it.price != null && it.qty != null ? it.price * it.qty : null);
  const qtySuffix = it.qty != null && it.qty > 1 ? ` (${it.qty}x)` : '';
  return itemTotal != null
    ? `${indent}• ${it.name}${qtySuffix}: ${rupiah(itemTotal)}`
    : `${indent}• ${it.name}`;
};

const bundleBlock = (b: InvoiceBundleSummary, index: number, totalBundles: number): string => {
  if (totalBundles <= 1) {
    const lines = [`• ${b.title}${formatScheduleSuffix(b)}`];
    if (b.surveyUrl?.trim()) {
      lines.push(`  Link survei: ${b.surveyUrl.trim()}`);
    }
    return lines.join('\n');
  }

  const hasDetail = (b.items && b.items.length > 0) || b.subtotal != null || b.amount != null || !!b.surveyUrl?.trim();
  if (!hasDetail) {
    return `• ${b.title}${formatScheduleSuffix(b)}`;
  }

  const lines = [`${index + 1}. ${b.title}${formatScheduleSuffix(b)}`];
  if (b.surveyUrl?.trim()) {
    lines.push(`   Link survei: ${b.surveyUrl.trim()}`);
  }
  if (b.items && b.items.length > 0) {
    for (const it of b.items) {
      lines.push(formatItemLine(it, '   '));
    }
  }
  if (b.subtotal != null) {
    lines.push(`   Subtotal pesanan: ${rupiah(b.subtotal)}`);
  } else if (b.amount != null) {
    lines.push(`   Nominal pesanan: ${rupiah(b.amount)}`);
  }
  return lines.join('\n');
};

/**
 * "Tagihan sudah terbit" — satu pesan, satu link, N survei.
 *
 * Menyebut SELURUH survei yang ditanggung, karena satu link yang menagih empat
 * pesanan tanpa menyebut keempatnya adalah tagihan yang tidak bisa diperiksa
 * penerimanya.
 */
export function invoiceReadyMessage(input: InvoiceReadyInput): string {
  const { researcherName, bundles, amount, invoiceUrl, isKilat } = input;
  const firstKilatHour = bundles.find((b) => b.kilatSlotHour != null)?.kilatSlotHour;
  const deadline = input.deadline
    ?? paymentDeadline(bundles.map((b) => b.startDate), input.issuedAt, firstKilatHour);

  const heading = input.topUp
    ? 'Tagihan susulan untuk pesanan Anda sudah kami terbitkan:'
    : bundles.length > 1
      ? `Tagihan untuk ${bundles.length} pesanan Anda sudah kami terbitkan:`
      : 'Tagihan untuk pesanan Anda sudah kami terbitkan:';

  const closing = input.topUp
    ? (input.tempo
        ? 'Tagihan susulan ini tidak punya batas waktu. Link di atas selalu bisa dipakai, kapan pun Anda siap membayar.'
        : `Mohon diselesaikan paling lambat ${formatDeadline(deadline)}.`)
    : input.tempo
      ? (isKilat
          ? 'Survei Kilat Anda tetap disiarkan sesuai jadwal — pembayarannya boleh menyusul. Link di atas selalu bisa dipakai, kapan pun Anda siap membayar.'
          : 'Iklan Anda tetap tayang sesuai jadwal — pembayarannya boleh menyusul. Link di atas selalu bisa dipakai, kapan pun Anda siap membayar.')
      : (isKilat
          ? `Mohon diselesaikan paling lambat ${formatDeadline(deadline)} agar survei Kilat bisa disiarkan sesuai jadwal.`
          : `Mohon diselesaikan paling lambat ${formatDeadline(deadline)} agar iklan bisa tayang sesuai jadwal.`);

  const isMultiWithDetail = bundles.length > 1 && bundles.some(
    (b) => (b.items && b.items.length > 0) || b.subtotal != null || b.amount != null || !!b.surveyUrl?.trim(),
  );
  const renderedBundles = bundles
    .map((b, i) => bundleBlock(b, i, bundles.length))
    .join(isMultiWithDetail ? '\n\n' : '\n');

  const costLines: string[] = [];
  const singleItems = bundles.length <= 1
    ? (input.items && input.items.length > 0 ? input.items : bundles[0]?.items)
    : input.items;
  const sub = input.subtotal ?? (bundles.length === 1 ? bundles[0]?.subtotal : undefined);
  const ppnVal = input.ppn ?? (bundles.length === 1 ? bundles[0]?.ppn : undefined);

  if (singleItems && singleItems.length > 0) {
    costLines.push('Rincian biaya:');
    for (const it of singleItems) {
      costLines.push(formatItemLine(it));
    }
    if (sub != null && ppnVal != null) {
      costLines.push('────────────────────────');
      costLines.push(`Subtotal: ${rupiah(sub)}`);
      costLines.push(`PPN (11%): ${rupiah(ppnVal)}`);
    }
    costLines.push(`Total: ${rupiah(amount)}${bundles.length > 1 ? ' (dibayar sekaligus dalam satu link)' : ''}`);
  } else if (sub != null && ppnVal != null) {
    costLines.push(bundles.length > 1 ? 'Rincian total gabungan:' : 'Rincian biaya:');
    costLines.push(`Subtotal: ${rupiah(sub)}`);
    costLines.push(`PPN (11%): ${rupiah(ppnVal)}`);
    costLines.push('────────────────────────');
    costLines.push(`Total: ${rupiah(amount)}${bundles.length > 1 ? ' (dibayar sekaligus dalam satu link)' : ''}`);
  } else {
    costLines.push(`Total: ${rupiah(amount)}${bundles.length > 1 ? ' (dibayar sekaligus dalam satu link)' : ''}`);
  }

  return [
    greet(researcherName),
    '',
    heading,
    renderedBundles,
    '',
    ...costLines,
    `Link pembayaran: ${invoiceUrl}`,
    '',
    closing,
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
