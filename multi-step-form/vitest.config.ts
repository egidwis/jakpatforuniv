import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // ⚠️ Alias `@` HARUS ada di sini juga, bukan hanya di vite.config.
  // Vitest memakai konfigurasi ini sendiri, jadi tanpa baris ini setiap modul
  // yang mengimpor `@/…` gagal dimuat saat diuji — dan efeknya bukan "tesnya
  // merah" melainkan "tesnya tidak pernah ditulis": seluruh kode di bawah
  // src/components/ memakai `@/`, jadi ia praktis tak bisa diuji sama sekali.
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    // Repo ini punya DUA gaya tes yang sengaja dibiarkan hidup berdampingan:
    //
    //   *.test.ts  — skrip mandiri tanpa framework, dijalankan lewat
    //                `esbuild … | node` seperti tertulis di baris pertama
    //                masing-masing berkas. Lima berkas memakai gaya ini dan
    //                semuanya masih sah; vitest TIDAK boleh mengambilnya,
    //                karena mereka tidak memanggil test()/describe() sama
    //                sekali dan hanya akan dilaporkan "no test suite found".
    //
    //   *.spec.ts  — suite vitest biasa. Gaya untuk tes baru.
    //
    // Batasnya aturan penamaan, bukan daftar berkas, supaya tidak perlu
    // dirawat setiap kali ada tes baru.
    // `functions/` ikut karena adapter email (functions/api/_mail.js) memutuskan
    // seluruh email transaksional jalan atau tidak — dan pernah gagal diam-diam.
    include: ['src/**/*.spec.ts', 'functions/**/*.spec.ts'],
  },
});
