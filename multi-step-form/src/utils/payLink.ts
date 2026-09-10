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
 * Host yang PASTI menjalankan resolver `/bayar/`.
 *
 * Root `functions/_middleware.js` merutekan per-domain: `jakpatforuniv.com`
 * disajikan sebagai homepage statis dan TIDAK pernah memanggil `next()`, jadi
 * `/bayar/<id>` di sana mendarat di halaman depan — bukan 404, bukan resolver.
 * Link mati yang terlihat hidup.
 */
export const PAY_LINK_CANONICAL_ORIGIN = 'https://submit.jakpatforuniv.com';

/**
 * Origin yang boleh dipakai apa adanya: yang benar-benar menjalankan Pages
 * Functions. Sisanya dipaksa ke host kanonik.
 */
const originServesResolver = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin);
    return hostname.startsWith('submit.')
      || hostname.endsWith('.pages.dev')
      || hostname === 'localhost'
      || hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

/**
 * URL penuh — dipakai di email, WhatsApp, dan salin-link.
 *
 * ⚠️ ORIGIN-NYA DIKUNCI, bukan disalin apa adanya dari `window.location`.
 * Link yang keluar dari sini bertahan berhari-hari di inbox seseorang, jadi ia
 * tidak boleh mewarisi domain yang kebetulan sedang dibuka admin. Apex
 * `jakpatforuniv.com` khususnya: di sana `/bayar/` adalah homepage.
 *
 * `localhost` dan `*.pages.dev` sengaja DIBIARKAN — keduanya menjalankan
 * resolver, dan memaksa preview/dev ke produksi akan menyamarkan link uji
 * sebagai link sungguhan.
 */
export const payLinkUrl = (scheduleId: ScheduleUuid, origin?: string): string => {
  const raw = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const base = raw && originServesResolver(raw) ? raw : PAY_LINK_CANONICAL_ORIGIN;
  return `${base}${payLinkPath(scheduleId)}`;
};

/** Yang dibutuhkan untuk memutuskan sebuah jadwal punya tagihan yang bisa dibayar. */
export interface BillPayLinkSource {
  /**
   * URL tagihan yang MASIH TERBUKA (`openInvoice`) — `null` berarti jadwal ini
   * TIDAK punya tagihan hidup sama sekali.
   *
   * ⚠️ INI SINYALNYA, bukan sekadar isi. Lihat catatan di `payLinkForBill`.
   */
  paymentUrl: string | null;
  /** `ad_schedules.id`, kalau diketahui. */
  scheduleId: ScheduleUuid | null;
  /** `is_expired` (sql/83) — lihat catatan soal keterbatasannya di bawah. */
  isExpired: boolean;
}

/**
 * Bentuk link bayar untuk SATU jadwal — atau `null` kalau tidak ada yang bisa
 * dibayar.
 *
 * ⚠️ ADA KARENA ATURAN INI PERNAH DITUKAR, DAN PENUKARANNYA MEMBUAT PENELITI
 * TERDAMPAR. Nilai ini dipakai di hulu sebagai PENANDA KEBERADAAN — kartu
 * jadwal memilih `waiting_payment` vs `awaiting_invoice` dari ada/tidaknya ia
 * (`airingPeriods.ts`, cabang `step === 2`). Saat bentuknya diganti dari URL
 * DOKU menjadi `payLinkPath(scheduleId)`, nilainya berhenti bisa `null`:
 * `scheduleId` selalu ada, jadi kartunya SELAMANYA menawarkan "Bayar Sekarang"
 * — lalu resolver menjawab jujur "tidak ada tagihan", dan orangnya berhenti di
 * situ dengan uang di tangan.
 *
 * Aturannya karena itu dipisah tegas:
 *   KEBERADAAN diambil dari `paymentUrl` (ada tagihan terbuka atau tidak)
 *   BENTUK     diambil dari `scheduleId` (`/bayar/<id>`, bukan URL DOKU)
 *
 * ⚠️ `isExpired` DI SINI HAMPIR SELALU `false`, DAN ITU BUKAN BUG DI FUNGSI INI.
 * `openInvoice` disaring `isLiveInvoice()`, yang untuk tagihan `pending` sudah
 * mensyaratkan `!isExpired` — jadi sebuah tagihan yang kedaluwarsa tidak pernah
 * sampai ke sini sebagai `openInvoice`; ia hilang dari `paymentUrl` lebih dulu.
 * Syaratnya tetap ditulis untuk pemanggil yang membawa tagihan dari jalur lain
 * (mis. `invoices` mentah), TAPI JANGAN mengandalkannya sendirian: gerbang yang
 * benar-benar bekerja adalah `paymentUrl`.
 */
export const payLinkForBill = (bill: BillPayLinkSource): string | null => {
  if (bill.isExpired || !bill.paymentUrl) return null;
  return bill.scheduleId ? payLinkPath(bill.scheduleId) : bill.paymentUrl;
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
