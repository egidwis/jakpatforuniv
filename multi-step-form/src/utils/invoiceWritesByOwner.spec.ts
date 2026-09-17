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
