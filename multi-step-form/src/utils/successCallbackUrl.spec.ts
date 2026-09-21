import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore -- Pages Function tanpa deklarasi tipe (alasan sama dengan create-payment-select.spec.ts)
import { buildSuccessCallbackUrl } from '../../functions/api/doku/create-payment.js';

/*
  KENAPA TES INI ADA.

  `/payment-success` berlingkup ORDER: ia mencetak
  `form_submissions.title/start_date/end_date`, yang SELALU jendela ordinal 1.
  Tagihan berlingkup JADWAL. Selama satu order cuma punya satu jadwal keduanya
  sama — lalu jadwal ke-2 dirilis dan halaman mulai mengumumkan tanggal yang
  salah tanpa satu pun galat.

  Terukur di produksi: 17 tagihan lunas ordinal >=2. Terburuk order
  `6a18c955…` — membayar jadwal tayang 17 Sep, halaman menyebut 24 Mei.

  ⚠️ Pelajaran dari `create-payment-select.spec.ts` dipakai di sini: menguji
  fungsinya saja TIDAK CUKUP. Bug di sana hidup berbulan-bulan dengan suite
  hijau karena yang rusak adalah PEMANGGILNYA. Karena itu blok terakhir
  membaca sumber endpoint dan membuktikan `callback_url`-nya memang memakai
  fungsi ini — bukan merakit URL-nya sendiri lagi.
*/

const ORIGIN = 'https://submit.jakpatforuniv.com';
const ORDER = '6a18c955-8666-4c1f-9457-48339e13b93f';
const JADWAL = 'ba0a12f2-a1cb-4a03-966d-77686b280f62';

describe('buildSuccessCallbackUrl', () => {
  it('membawa jadwal yang dibayar saat scheduleId ada', () => {
    const url = buildSuccessCallbackUrl(ORIGIN, ORDER, JADWAL);
    expect(url).toContain(`schedule=${JADWAL}`);
    expect(url).toContain(`id=${ORDER}`);
    expect(url).toContain('source=gateway');
  });

  /*
    Uji karakterisasi. Ratusan link ordinal 1 sudah beredar dengan bentuk ini;
    URL-nya wajib identik sampai ke karakter, bukan sekadar "mirip".
  */
  it('TANPA scheduleId bentuknya identik dengan sebelum perubahan', () => {
    expect(buildSuccessCallbackUrl(ORIGIN, ORDER, undefined))
      .toBe(`${ORIGIN}/payment-success?id=${ORDER}&source=gateway`);
  });

  it('nilai kosong diperlakukan sama dengan tidak ada — bukan `schedule=`', () => {
    for (const kosong of [undefined, null, '']) {
      const url = buildSuccessCallbackUrl(ORIGIN, ORDER, kosong as unknown as string);
      expect(url).not.toContain('schedule=');
      expect(url).toBe(`${ORIGIN}/payment-success?id=${ORDER}&source=gateway`);
    }
  });

  it('id jadwal di-encode — parameter sesudahnya tidak boleh bisa disuntik', () => {
    const url = buildSuccessCallbackUrl(ORIGIN, ORDER, 'a&source=evil');
    expect(url).toContain('schedule=a%26source%3Devil');
    // `source=gateway` tetap satu-satunya `source` yang sah di URL ini.
    expect(url.match(/[?&]source=/g)).toHaveLength(1);
  });
});

describe('sambungan ke endpoint — bukan cuma fungsinya yang benar', () => {
  const source = readFileSync(
    join(__dirname, '../../functions/api/doku/create-payment.js'),
    'utf8',
  );

  it('callback_url endpoint memakai buildSuccessCallbackUrl', () => {
    expect(source).toMatch(/callback_url:\s*buildSuccessCallbackUrl\(/);
  });

  it('endpoint mengoper id jadwal, bukan hanya order', () => {
    const call = source.match(/callback_url:\s*buildSuccessCallbackUrl\(([^)]*)\)/);
    expect(call?.[1]).toContain('schedule');
  });

  it('URL /payment-success hanya dirakit di SATU tempat', () => {
    /*
      Penjaga terhadap penulis berikutnya yang menambahkan cabang callback
      kedua: dua tempat merakit URL = dua aturan yang bisa menyimpang, dan
      yang kedua hampir pasti lupa membawa `schedule`.

      Satu kecocokan = baris di dalam `buildSuccessCallbackUrl` sendiri.
    */
    const manual = source.match(/`\$\{[^`]*\}\/payment-success\?/g) || [];
    expect(manual).toHaveLength(1);

    const builder = source.match(
      /export function buildSuccessCallbackUrl[\s\S]*?\n}/,
    )?.[0];
    expect(builder).toContain('/payment-success?');
  });
});

describe('jalur tagihan manual (payment.ts) — cabang N=1 vs bundel', () => {
  const source = readFileSync(join(__dirname, 'payment.ts'), 'utf8');

  it('bundel tetap diarahkan ke /invoices/, bukan ke halaman sukses', () => {
    // Regresi paling mahal di tahap ini: menarik pembayar grup ke
    // /payment-success berarti ia melihat SATU survei dari N yang dibayar.
    expect(source).toMatch(/bundleCount > 1[\s\S]{0,120}\/invoices\//);
  });

  it('cabang N=1 membawa scheduleId', () => {
    expect(source).toMatch(/scheduleId \? `&schedule=\$\{encodeURIComponent\(scheduleId\)\}`/);
  });

  it('InvoiceForm mengoper jadwal yang ditagihnya', () => {
    const form = readFileSync(
      join(__dirname, '../components/schedule/InvoiceForm.tsx'),
      'utf8',
    );
    expect(form).toMatch(/scheduleId:\s*entry\.id/);
  });
});
