import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  ═══════════════════════════════════════════════════════════════════════════
  MENGHIDUPKAN JADWAL TANPA MENERBITKAN TAGIHAN — JANGAN PERNAH LAGI
  ═══════════════════════════════════════════════════════════════════════════

  ⚠️ LAHIR DARI BUG PRODUKSI NYATA (17 Sep 2026), yang tiga kali salah
  didiagnosis sebelum sebabnya ketemu dari log produksi detik-per-detik:

      :14.4  create_ad_schedule          jadwal lahir (SATU klik)
      :15.0  invoices + transactions     tagihan lahir
      :19.1  killDokuLinksForSchedule    peneliti klik "Batalkan Pesanan"
      :19.9  invoices → expired          tagihan MATI
      :27.8  rebookSchedule              jadwal HIDUP LAGI — tagihan tetap mati

  Hasilnya: jadwal `waiting_payment` tanpa tagihan hidup, dan layar jujur
  berkata "tagihan sedang disiapkan tim kami" — kalimat tentang admin, di
  tengah fitur yang justru dibuat supaya admin tidak diperlukan.

  Sebabnya bukan satu baris salah, melainkan SEBUAH BENTUK: sebuah fungsi yang
  mengembalikan jadwal ke `waiting_payment` sambil menyetel ulang hold, tanpa
  ada yang menerbitkan tagihan barunya. `rebookSchedule()` dihapus 18 Sep;
  tes ini menjaga supaya bentuk itu tidak lahir kembali dengan nama lain.

  ⚠️ Kalau tes ini merah, JANGAN melonggarkan polanya. Tanyakan: siapa yang
  menerbitkan tagihan untuk jadwal yang baru saja dihidupkan ini? Kalau
  jawabannya "tidak ada", itu bug yang sama.
*/

const SRC = dirname(fileURLToPath(import.meta.url));
const UTILS = readFileSync(join(SRC, 'supabase.ts'), 'utf8');

/** Sumber tanpa komentar — nota sejarah menyebut nama yang sudah mati. */
function tanpaKomentar(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*$/gm, ' ');
}

describe('tidak ada jalur yang menghidupkan jadwal tanpa tagihan', () => {
  it('`rebookSchedule` benar-benar hilang dari kode aktif', () => {
    const kode = tanpaKomentar(UTILS);
    expect(kode).not.toMatch(/\brebookSchedule\b/);
  });

  it('tidak ada `.update()` ke `ad_schedules` yang menulis waiting_payment DAN slot_reserved_at', () => {
    /*
      Tanda tangan bentuk yang dilarang: satu tulisan yang sekaligus
      membangkitkan sumbu TAYANG (`status: 'waiting_payment'`) dan menyetel
      ulang HOLD (`slot_reserved_at`). Itu artinya "jadwal ini hidup lagi dan
      jam bayarnya berdetak lagi" — pernyataan yang hanya sah kalau ada tagihan
      yang menyertainya.

      `create_ad_schedule` (RPC di server) tidak kena: ia INSERT, dan
      pemanggilnya SELALU menyusulkan `createPayment`.
    */
    const kode = tanpaKomentar(UTILS);
    const blok = [...kode.matchAll(/\.from\(['"]ad_schedules['"]\)[\s\S]{0,1200}?;/g)]
      .map((m) => m[0])
      .filter((b) => /\.update\(/.test(b));

    for (const b of blok) {
      const bangkit = /status:\s*['"]waiting_payment['"]/.test(b);
      const holdBaru = /slot_reserved_at:\s*new Date\(\)/.test(b);
      expect(
        bangkit && holdBaru,
        'Ada tulisan ad_schedules yang menghidupkan jadwal DAN menyetel ulang hold '
        + 'tanpa menerbitkan tagihan — bentuk yang sama dengan rebookSchedule() '
        + 'yang dihapus 18 Sep 2026.',
      ).toBe(false);
    }
  });

  it('halaman jadwal tidak lagi memajang kalender pada keadaan `released`', () => {
    /*
      Kalender pada layar `released` adalah PINTU bug ini. Sesudah pembatalan,
      peneliti diarahkan ke dashboard dan memesan lewat `JadwalBaruPage` —
      satu-satunya jalur yang membuat jadwal DAN tagihannya bersama.
    */
    const hal = readFileSync(
      join(SRC, '..', 'pages', 'dashboard', 'JadwalDanBayarPage.tsx'), 'utf8',
    );
    const kode = tanpaKomentar(hal);

    // Cabang render kalender tidak boleh lagi menyebut `released`.
    expect(kode).not.toMatch(/screen === 'pick'\s*\|\|\s*state\.screen === 'released'/);
    // Dan pembatalan wajib berakhir di dashboard, bukan memuat ulang di tempat.
    const cancel = kode.slice(kode.indexOf('const handleCancel'));
    expect(cancel.slice(0, 900)).toMatch(/navigate\('\/dashboard'/);
  });

  it('`rebookPlan` sudah tidak ada — tinggal satu primitif pesan-ulang', () => {
    const berkas = readdirSync(SRC);
    expect(berkas).not.toContain('rebookPlan.ts');
    expect(berkas).not.toContain('rebookPlan.spec.ts');
  });
});
