/**
 * Link pembayaran yang KELUAR dari sistem — satu bentuk, satu tempat.
 *
 * ⚠️ YANG BEREDAR BUKAN LAGI URL DOKU MENTAH. URL DOKU menagih untuk keadaan
 * saat ia dicetak, selamanya: sekali terkirim lewat email atau WhatsApp ia
 * tidak bisa ditarik. Itulah yang terjadi pada order af004b84 — jadwalnya
 * dibatalkan, tanggal baru dibuat, dan peneliti membayar lewat link lama.
 *
 * Yang beredar sekarang `/bayar/<ad_schedules.id>`, dan pertanyaannya dijawab
 * SAAT DIKLIK oleh `functions/bayar/[id].js` → `authoritative_payment_url()`
 * (sql/85). Link lama di inbox seseorang karena itu berhenti jadi masalah
 * permanen: ia menyesuaikan diri.
 */

/**
 * `ad_schedules.id` — BUKAN `source_id`, BUKAN `payment_id`.
 *
 * Ketiganya UUID/teks yang bertetangga di kode yang sama, dan yang salah tidak
 * pernah error — resolver cuma tidak menemukan tagihan apa pun:
 *   `payment_id` berubah tiap tagihan terbit ulang → URL-nya ikut basi
 *   `source_id`  kunci `invoices.extend_id`, bukan yang diterima `schedule_billing()`
 */
export type ScheduleUuid = string;

/** Path relatif — dipakai di dalam aplikasi (router menanganinya sendiri). */
export const payLinkPath = (scheduleId: ScheduleUuid): string =>
  `/bayar/${scheduleId}`;

/**
 * URL penuh — dipakai di email, WhatsApp, dan salin-link.
 *
 * ⚠️ `origin` WAJIB `submit.` (atau *.pages.dev). Root `functions/_middleware.js`
 * merutekan per-domain: `jakpatforuniv.com` disajikan sebagai homepage statis,
 * jadi `/bayar/...` di sana mendarat di halaman depan, bukan di resolver.
 * Menurunkannya dari `window.location.origin` benar untuk dashboard admin, yang
 * memang selalu dibuka di `submit.`.
 */
export const payLinkUrl = (scheduleId: ScheduleUuid, origin?: string): string => {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${payLinkPath(scheduleId)}`;
};

/** Yang dibutuhkan untuk mengurutkan anggota sebuah tagihan gabungan. */
export interface LeadCandidate {
  startDate: string | null;
  ordinal: number | null;
}

/**
 * Urutan anggota tagihan gabungan: tanggal tayang paling awal dulu.
 *
 * ⚠️ INI SATU-SATUNYA SALINAN TypeScript-nya, dan ia punya kembaran di SQL
 * (`lead` di `authoritative_payment_url()`, sql/85). Keduanya WAJIB sepakat:
 * resolver memakai yang SQL untuk memutuskan siapa yang boleh diteruskan ke
 * DOKU, sementara layar memakai yang ini untuk memutuskan siapa yang memegang
 * tombol bayar. Kalau berbeda, seseorang melihat tombol yang menolaknya.
 *
 * ⚠️ ARAH NULL-NYA BEDA DI DUA KOLOM, dan itu bukan kelalaian:
 *   `startDate` null → paling BELAKANG (jadwal tanpa tanggal bukan yang paling
 *                      mendesak; padanan SQL-nya `NULLS LAST`)
 *   `ordinal`  null → paling DEPAN (baris warisan; `?? 0`, sedangkan ordinal
 *                      asli mulai dari 1; padanan SQL-nya `NULLS FIRST`)
 * Menyeragamkannya terlihat lebih rapi dan memindahkan pemegang tombol bayar.
 *
 * Alasannya bukan kosmetik: anggota terdepan itulah yang link-nya mati paling
 * cepat (`invoiceLifetimeMinutes` mengunci ke 14.00 hari tayang), jadi kartu
 * yang menagih adalah kartu dengan tenggat paling ketat.
 */
export const compareLeadOrder = (a: LeadCandidate, b: LeadCandidate): number => {
  const at = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
  const bt = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
  if (at !== bt) return at - bt;
  return (a.ordinal ?? 0) - (b.ordinal ?? 0);
};

/**
 * Anggota LEAD sebuah bundel — yang memegang link bayarnya.
 *
 * Mengembalikan `null` untuk daftar kosong, bukan melempar: pemanggilnya
 * biasanya sedang menyusun pesan, dan pesan tanpa link lebih baik daripada
 * layar yang mati.
 */
export const leadOf = <T extends LeadCandidate>(members: T[]): T | null => {
  if (!members || members.length === 0) return null;
  return [...members].sort(compareLeadOrder)[0];
};
