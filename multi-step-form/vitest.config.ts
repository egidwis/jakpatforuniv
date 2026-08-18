import { defineConfig } from 'vitest/config';

export default defineConfig({
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
    include: ['src/**/*.spec.ts'],
  },
});
