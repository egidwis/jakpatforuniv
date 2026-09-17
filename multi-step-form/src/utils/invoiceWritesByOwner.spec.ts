import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  ═══════════════════════════════════════════════════════════════════════════
  APA YANG DITULIS JALUR PENELITI KE `invoices` — HARUS COCOK DENGAN sql/92
  ═══════════════════════════════════════════════════════════════════════════

  ⚠️ TES INI LAHIR DARI REGRESI NYATA (17 Sep 2026). `sql/91` mengunci
  `invoices.status` total untuk non-admin, padahal `cancelSchedule()` — jalur
  pembatalan milik PENELITI — memang menulis `status = 'expired'`. Akibatnya
  pembatalan jadwal gagal TOTAL dengan pesan "Kolom tagihan ini hanya bisa
  diubah admin", lebih buruk daripada sebelum sql/91.

  Sebabnya: penjaga DB ditulis dari pembacaan kode yang berhenti terlalu awal.
  Tes ini menutupnya dari arah sebaliknya — ia membaca SUMBER dan menuntut
  setiap kolom `invoices` yang ditulis klien sudah terdaftar sebagai "disadari".

  Kalau tes ini merah, JANGAN cuma menambah nama ke daftar. Tanyakan dulu:
  apakah `guard_invoice_columns_for_owner()` (sql/92) mengizinkan kolom itu
  untuk peneliti? Kalau tidak, tulisan itu akan gagal di produksi — persis
  seperti yang sudah terjadi.
*/

const SRC = dirname(fileURLToPath(import.meta.url));
const body = readFileSync(join(SRC, 'supabase.ts'), 'utf8');

/**
 * Kolom yang BOLEH ditulis peneliti menurut `guard_invoice_columns_for_owner()`.
 * `status` hanya sah untuk arah `pending` → `expired`/`cancelled`.
 */
const DIIZINKAN_UNTUK_PEMILIK = new Set(['status', 'doku_cancel_last_error']);

/** Kolom yang DIKUNCI penuh — hanya admin/service_role. */
const TERKUNCI = new Set([
  'amount', 'paid_at', 'doku_cancelled_at', 'payment_id',
  'schedule_id', 'form_submission_id', 'expires_at',
]);

/** Setiap `.from('invoices').update({...})` di sumber, beserta kolomnya. */
function invoiceUpdates(): string[][] {
  const out: string[][] = [];
  const re = /\.from\(['"]invoices['"]\)\s*\n?\s*\.update\(\{([\s\S]{0,400}?)\}\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const cols = [...m[1].matchAll(/(?:^|[\s,{])([a-z_][a-z0-9_]*)\s*:/gi)].map((x) => x[1]);
    out.push(cols);
  }
  return out;
}

describe('tulisan klien ke `invoices`', () => {
  it('pemindainya benar-benar menemukan blok update', () => {
    expect(invoiceUpdates().length).toBeGreaterThan(0);
  });

  it('setiap kolom yang ditulis sudah DISADARI — diizinkan atau sengaja admin-only', () => {
    /*
      Daftar ini adalah kontrak dengan sql/92. Menambah kolom baru ke sebuah
      `.update()` tanpa memperbaruinya membuat tes ini merah SEBELUM tulisan itu
      gagal senyap di tangan peneliti.
    */
    const dikenal = new Set([...DIIZINKAN_UNTUK_PEMILIK, ...TERKUNCI, 'updated_at']);
    const asing = invoiceUpdates().flat().filter((c) => !dikenal.has(c));
    expect([...new Set(asing)]).toEqual([]);
  });

  it('⚠️ `status` MASIH ditulis oleh jalur klien — itulah yang dipatahkan sql/91', () => {
    // Kalau baris ini hilang, `cancelSchedule` berhenti mematikan barisnya di
    // `invoices` dan tagihan hantu kembali: hidup di satu tabel, mati di tabel
    // lain. Lihat blok "invoices IKUT DIMATIKAN" di supabase.ts.
    expect(invoiceUpdates().some((cols) => cols.includes('status'))).toBe(true);
  });

  it('nilai `status` yang ditulis klien hanya yang MEMATIKAN, tidak pernah lunas', () => {
    /*
      sql/92 menolak `pending → paid` dari peneliti. Kalau kode klien suatu saat
      menulis 'paid' ke `invoices`, jalur itu HARUS lewat admin/service_role —
      dan tes ini memaksa perubahannya terlihat.
    */
    const re = /\.from\(['"]invoices['"]\)\s*\n?\s*\.update\(\{[\s\S]{0,400}?status:\s*['"]([a-z_]+)['"]/g;
    const nilai = [...body.matchAll(re)].map((m) => m[1]);
    expect(nilai.length).toBeGreaterThan(0);
    for (const v of nilai) {
      expect(['expired', 'cancelled', 'paid', 'pending']).toContain(v);
    }
    // Yang MEMATIKAN pasti ada — itu jalur peneliti.
    expect(nilai.some((v) => v === 'expired' || v === 'cancelled')).toBe(true);
  });
});

describe('penyaringan `invoices` saat membatalkan jadwal', () => {
  /*
    ⚠️ INSIDEN 17 Sep 2026. `cancelSchedule` menyaring dengan
    `.or('schedule_id.eq.X,schedule_id.is.null')`. Di PostgREST `.or()` adalah
    GRUP TERPISAH yang di-AND dengan filter lain, dan cabang `is.null` membuat
    kondisinya jauh lebih longgar daripada maksud penulisnya.

    Akibat nyata: peneliti membatalkan lalu memesan ulang di tanggal yang sama →
    tagihan BARU ikut ditandai `expired` sementara `transactions`-nya `pending`,
    dan layar berbunyi "tagihan sedang disiapkan tim kami" di tengah fitur
    swalayan.

    Bug filternya LAMA; sql/92 hanya membukanya — sebelum itu tulisannya ditolak
    trigger, jadi tidak pernah mendarat.
  */

  it('tidak ada penyaringan `schedule_id.is.null` yang tersisa', () => {
    const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    expect(code).not.toMatch(/schedule_id\.is\.null/);
  });

  it('setiap update `invoices` berlingkup jadwal memakai `.eq`, bukan `.or`', () => {
    // `.or()` di sekitar tulisan `invoices` selalu layak dicurigai: ia melonggar
    // ke arah yang tidak terlihat dari pembacaan sepintas.
    const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    const blok = [...code.matchAll(/\.from\(['"]invoices['"]\)[\s\S]{0,400}?;/g)].map((m) => m[0]);
    expect(blok.length).toBeGreaterThan(0);
    for (const b of blok) {
      if (/\.update\(/.test(b)) expect(b).not.toMatch(/\.or\(/);
    }
  });
});

describe('nol baris tanpa error = kegagalan, bukan keberhasilan', () => {
  /*
    ═════════════════════════════════════════════════════════════════════════
    KAMBUHAN KEENAM — dan tes inilah yang seharusnya sudah ada sejak kambuhan
    pertama. Memori proyek: `rls-update-policy-silent-zero-rows.md`.
    ═════════════════════════════════════════════════════════════════════════

    Terukur di produksi 17 Sep 2026, sebagai peneliti sungguhan (SET LOCAL ROLE
    + klaim JWT asli, dibungkus ROLLBACK):

        SELECT transactions  → 1 baris terlihat
        UPDATE transactions  → 0 baris, TANPA ERROR   ← cacatnya
        UPDATE invoices      → 1 baris (sql/92 sudah membukanya)

    `transactions` hanya punya policy UPDATE admin; NOL policy pemilik. Maka
    `cancelSchedule()` dari klien peneliti mengenai nol baris dan PostgREST
    memulangkannya tanpa error. Kode berjalan terus seolah berhasil, jadwal
    tampak batal, tapi transaksinya `pending` selamanya — lalu layar membaca
    "masih ada tagihan hidup" dan peneliti terdampar pada kalimat tentang admin.

    Diperbaiki server-side oleh sql/93. Tes ini memagari sisi KLIEN: selama
    tulisan uang tidak memeriksa jumlah barisnya, kegagalan izin akan selalu
    bisa menyamar jadi sukses lagi — di tabel mana pun, oleh policy mana pun.

    ⚠️ Kalau tes ini merah, jangan hapus `.select()`-nya. Tambahkan penjaganya.
  */

  const bersih = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  /** Blok `cancelSchedule` saja — di sanalah pembatalan peneliti hidup. */
  function blokCancelSchedule(): string {
    const mulai = bersih.indexOf('export const cancelSchedule');
    expect(mulai).toBeGreaterThan(-1);
    const sesudah = bersih.indexOf('export const', mulai + 20);
    return bersih.slice(mulai, sesudah === -1 ? undefined : sesudah);
  }

  it.each(['transactions', 'invoices'])(
    'tulisan `%s` di cancelSchedule memanggil `.select()` supaya barisnya terhitung',
    (tabel) => {
      const blok = blokCancelSchedule();
      const tulisan = [...blok.matchAll(
        new RegExp(`\\.from\\(['"]${tabel}['"]\\)[\\s\\S]{0,900}?;`, 'g'),
      )].map((m) => m[0]).filter((b) => /\.update\(/.test(b));

      expect(tulisan.length).toBeGreaterThan(0);
      for (const t of tulisan) {
        expect(t).toMatch(/\.select\(/);
      }
    },
  );

  it('cancelSchedule benar-benar memeriksa hasil nol, bukan sekadar memintanya', () => {
    const blok = blokCancelSchedule();
    // Dua penjaga: satu untuk transactions, satu untuk invoices.
    const penjaga = [...blok.matchAll(/length === 0/g)];
    expect(penjaga.length).toBeGreaterThanOrEqual(2);
    // Dan keduanya harus bisa melempar, bukan cuma console.error.
    expect(blok).toMatch(/DITOLAK database/);
  });

  it('membedakan "ditolak izin" dari "kalah cepat oleh webhook DOKU"', () => {
    /*
      Nol baris punya DUA sebab yang sah-sah berbeda. Kalau webhook DOKU lebih
      dulu membalik barisnya jadi lunas, nol adalah hasil yang BENAR dan tidak
      boleh dilaporkan sebagai bug — `payment_status` bukan bukti pembayaran,
      dan uang yang sungguh diterima tidak boleh kalah oleh status di layar.
      Karena itu penjaganya membaca ulang status sebelum menuduh.
    */
    const blok = blokCancelSchedule();
    expect(blok).toMatch(/masihPending/);
  });
});

describe('penjaga SQL hanya menyebut kolom yang benar-benar ada', () => {
  /*
    ⚠️ LAHIR DARI CACAT NYATA (17 Sep 2026, tertangkap uji pertama sesudah
    sql/93 diterapkan ke produksi).

    `guard_transaction_columns_for_owner()` menyalin daftar kolomnya dari
    pasangannya di `invoices` (sql/92), termasuk `paid_at` — kolom yang
    `transactions` TIDAK PUNYA.

    plpgsql TIDAK memeriksa nama kolom saat fungsi DIBUAT, hanya saat trigger
    BERJALAN. Jadi migrasinya "sukses", lalu SETIAP pembatalan oleh peneliti
    meledak dengan `record "new" has no field "paid_at"` — gagal total, di
    produksi, karena satu nama yang disalin tanpa dibaca ulang.

    Tes ini mahal-murahnya jelas: ia membaca berkas SQL dan menuntut setiap
    `NEW.<kolom>` yang disebut penjaga `transactions` ada di daftar kolom
    tabelnya. Daftar itu ditulis tangan DARI information_schema produksi.
  */

  const SQL_DIR = join(SRC, '..', '..', 'sql');

  /** Kolom `public.transactions`, dibaca dari information_schema 17 Sep 2026. */
  const KOLOM_TRANSACTIONS = new Set([
    'id', 'form_submission_id', 'payment_id', 'payment_method', 'amount',
    'status', 'payment_url', 'created_at', 'updated_at', 'note', 'entity_type',
    'extend_id', 'payment_channel', 'subtotal', 'ppn_rate', 'ppn_amount',
    'schedule_id', 'voucher_code', 'billed_start_date', 'doku_request_id',
  ]);

  it('sql/93 tidak menyebut satu pun kolom yang tidak ada di `transactions`', () => {
    const sql = readFileSync(
      join(SQL_DIR, '93_owner_may_kill_own_transaction.sql'), 'utf8',
    );
    // Buang komentar: `paid_at` memang SENGAJA disebut di sana sebagai riwayat.
    const kode = sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*--[^\n]*$/gm, ' ');

    const disebut = [...kode.matchAll(/\b(?:NEW|OLD)\.([a-z_][a-z0-9_]*)/gi)]
      .map((m) => m[1].toLowerCase());

    expect(disebut.length).toBeGreaterThan(0);
    const asing = [...new Set(disebut)].filter((k) => !KOLOM_TRANSACTIONS.has(k));
    expect(asing).toEqual([]);
  });

  it('kolom uang `transactions` yang nyata memang ikut dikunci', () => {
    const sql = readFileSync(
      join(SQL_DIR, '93_owner_may_kill_own_transaction.sql'), 'utf8',
    );
    // Yang menggerakkan uang & identitas tagihan; kalau ada yang lolos, peneliti
    // bisa menggeser nilai tagihannya sendiri tanpa menyentuh `status`.
    for (const kolom of [
      'amount', 'subtotal', 'ppn_amount', 'ppn_rate', 'voucher_code',
      'payment_id', 'payment_method', 'billed_start_date',
      'form_submission_id', 'extend_id', 'entity_type',
    ]) {
      expect(sql).toMatch(new RegExp(`NEW\\.${kolom}\\s+IS DISTINCT FROM`));
    }
  });
});
