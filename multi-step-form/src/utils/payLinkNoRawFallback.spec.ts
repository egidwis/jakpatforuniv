import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  ═══════════════════════════════════════════════════════════════════════════
  LINK BAYAR YANG TERSIMPAN ATAU DIKIRIM TIDAK PUNYA CADANGAN URL MENTAH
  ═══════════════════════════════════════════════════════════════════════════

  Aturannya: **ada `schedule_id` → `/bayar/<id>`, atau tombolnya tidak dirender.**
  Tidak pernah ada cadangan ke `invoice_url` / `payment_url` DOKU.

  ⚠️ KENAPA CADANGAN ITU JUSTRU YANG PALING BERBAHAYA. Ia menyala tepat ketika
  kita TIDAK punya `schedule_id` — yaitu ketika kita tidak bisa menjamin link
  itu masih berwenang. Jadi bentuk `x ? payLink(...) : urlMentah` memberi
  jaminan pada kasus yang aman dan melepasnya pada kasus yang berbahaya: persis
  terbalik. Kegagalannya sunyi — link-nya terbuka, halaman DOKU-nya muncul, dan
  uangnya masuk ke tagihan yang sudah tidak berlaku.

  Ini tes SUMBER, bukan tes unit, dan itu disengaja. Yang dijaga bukan delapan
  cadangan yang dibuang 2026-09-10 — itu sudah selesai — melainkan cadangan
  KESEMBILAN yang belum ditulis. Bentuknya sangat mudah ditulis ulang tanpa
  sadar; ia terlihat seperti kehati-hatian.

  ⚠️ YANG SENGAJA DI LUAR LINGKUP: link yang BARU DICETAK lalu langsung dibuka
  di tab yang sama (`PaymentCheckoutPage`, `PaymentRetryPage`, respons
  `create-payment`). Pada detik itu link DOKU memang berwenang, dan menyisipkan
  satu lompatan resolver di tengah checkout justru menambah titik gagal. Yang
  dijaga di sini hanya link yang TERSIMPAN atau DIKIRIM.
*/

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * SATU-SATUNYA berkas yang boleh menuliskan cadangan itu — karena di sanalah
 * aturannya didefinisikan, sekali, dengan tesnya sendiri (`payLink.spec.ts`).
 *
 * ⚠️ Cadangan di `payLinkForBill` BUKAN kelalaian yang lolos. Ia menjaga hal
 * yang berlawanan: nilai itu dipakai di hulu sebagai PENANDA KEBERADAAN, jadi
 * memulangkan `null` saat tagihannya nyata-nyata hidup akan membuat kartu
 * berbunyi "menunggu tagihan" untuk tagihan yang sudah terbit — kebohongan ke
 * arah sebaliknya. Dan link di sana tidak tersimpan maupun dikirim: ia dirender
 * dari tagihan yang BARU SAJA dibaca dan sudah lolos `isLiveInvoice()`.
 *
 * Pengecualiannya satu berkas, bukan satu daftar: begitu daftarnya bisa tumbuh,
 * ia akan tumbuh.
 */
const RULE_HOME = 'utils/payLink.ts';

/** Kolom URL DOKU mentah — kolomnya, bukan variabel bebas. */
const RAW = String.raw`(?:invoice_url|payment_url|invoiceUrl|paymentUrl)`;
/** Pemanggilan penyusun link berwenang. */
const CALL = String.raw`payLink(?:Path|Url|ForBill)\s*\(`;

/**
 * Bentuk yang dilarang, semuanya "payLink di satu cabang, URL mentah di cabang
 * lain dari percabangan yang SAMA".
 *
 * `[^;\n]{0,80}` mengurung pencarian pada pernyataan yang sama: tanpa itu
 * pemindai membaca seluruh blok JSX sebagai satu ekspresi dan menuduh berkas
 * yang justru sudah benar.
 */
const FORBIDDEN: Array<[string, RegExp]> = [
  // payLink(...) : urlMentah        — cabang "tidak punya schedule_id"
  ['ternari, payLink lebih dulu', new RegExp(`${CALL}[^;\\n]{0,80}\\)?\\s*:\\s*[^;\\n]{0,80}\\b${RAW}\\b`)],
  // urlMentah : payLink(...)        — urutan terbalik, bahaya yang sama
  ['ternari, URL mentah lebih dulu', new RegExp(`\\b${RAW}\\b[^;\\n]{0,80}\\s:\\s*[^;\\n]{0,40}${CALL}`)],
  // payLink(...) ?? urlMentah  /  payLink(...) || urlMentah
  ['cadangan ?? / ||', new RegExp(`${CALL}[^;\\n]{0,80}\\)?\\s*(?:\\?\\?|\\|\\|)\\s*[^;\\n]{0,80}\\b${RAW}\\b`)],
];

/** Buang komentar SEBELUM memindai — berkas-berkas ini penuh catatan yang MENYEBUT nama kolomnya. */
const stripComments = (body: string): string =>
  body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const offendersIn = (body: string): string[] => {
  const code = stripComments(body);
  return FORBIDDEN.flatMap(([label, re]) => {
    const m = code.match(new RegExp(re.source, 'g'));
    return m ? m.map((hit) => `${label}: ${hit.replace(/\s+/g, ' ').slice(0, 140)}`) : [];
  });
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full);
    return /\.tsx?$/.test(name) && !/\.spec\.tsx?$/.test(name) ? [full] : [];
  });

const files = walk(SRC)
  .map((path) => ({ path: relative(SRC, path).split(/[\\/]/).join('/'), body: readFileSync(path, 'utf8') }))
  .filter((f) => f.path !== RULE_HOME);

/*
  ⚠️ EMPAT CADANGAN SUNGGUHAN yang hidup di produksi sampai 2026-09-10, disalin
  APA ADANYA. Mereka ada di sini supaya pemindai di atas terbukti bisa MERAH —
  sebuah penjaga yang tidak pernah menangkap apa pun tidak membuktikan apa pun,
  dan pemindai yang regex-nya terlanjur longgar gagal dengan sangat sunyi.
*/
const CADANGAN_ASLI: Array<[string, string]> = [
  ['StatusPage — kartu ordinal 1',
   'links[submission.id] = ownBilling.isExpired ? null : (ownBilling.scheduleId ? payLinkPath(ownBilling.scheduleId) : ownBilling.paymentUrl ?? null);'],
  ['InvoicePage — tombol Bayar Sekarang',
   'const payHref = leadScheduleId ? payLinkPath(leadScheduleId) : data.payment_url;'],
  ['BulkInvoiceDialog — memberi makan email DAN WhatsApp',
   'const bundlePayUrl = leadBundle ? payLinkUrl(leadBundle.entry.id) : paymentResponse.invoice_url;'],
  ['airingPeriods — kartu jadwal ke-2 dst.',
   'payUrl: bookingState === "waiting_payment" ? (s.id ? payLinkPath(s.id) : pay?.paymentUrl || null) : null,'],
];

describe('link bayar — nol cadangan ke URL DOKU mentah', () => {
  it('pemindainya benar-benar memindai sesuatu', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => /payLink(Path|Url|ForBill)\s*\(/.test(f.body))).toBe(true);
  });

  it.each(CADANGAN_ASLI)('menangkap cadangan asli: %s', (_label, source) => {
    expect(offendersIn(source)).not.toEqual([]);
  });

  it('bentuk yang BENAR tidak dituduh', () => {
    // Tanpa cadangan; `paymentUrl` hanya jadi SINYAL di gerbang, bukan nilai balik.
    expect(offendersIn('payUrl: state === "waiting_payment" && s.id ? payLinkPath(s.id) : null,')).toEqual([]);
    expect(offendersIn('{inv.paymentUrl && !inv.isPaid && entry.id && (\n  <button onClick={() => copy(payLinkUrl(entry.id))} />\n)}')).toEqual([]);
  });

  it('tidak ada berkas yang menyandingkan payLink dengan URL mentah', () => {
    /*
      Kalau tes ini merah: JANGAN melebarkan `RULE_HOME` jadi daftar. Yang benar
      adalah menghapus cadangannya — tombol yang tidak dirender selalu lebih
      murah daripada tombol yang menagih keadaan lama.

      Kalau URL mentahnya memang BARU dicetak di request yang sama, ia bukan
      cadangan: pisahkan pernyataannya, atau beri nama yang bukan `*_url`/`*Url`.
    */
    const hits = files.flatMap((f) => offendersIn(f.body).map((o) => `${f.path} — ${o}`));
    expect(hits).toEqual([]);
  });

  it('`payLinkUrl` satu-satunya penyusun URL penuh — origin-nya dikunci di sana', () => {
    // Menyusun `${origin}/bayar/${id}` dengan tangan melewati penguncian origin
    // dan menghidupkan lagi cacat "link mati di email dari domain apex".
    const handRolled = files.filter((f) =>
      /['"`]\s*\/bayar\/\$\{/.test(f.body) || /\+\s*['"`]\/bayar\//.test(f.body),
    );
    expect(handRolled.map((f) => f.path)).toEqual([]);
  });
});
