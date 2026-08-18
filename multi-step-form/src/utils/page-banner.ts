import { DEFAULT_AD_BANNER_URL } from './constants';

// ─────────────────────────────────────────────────────────────
// Aturan banner halaman iklan, dipusatkan.
//
// Auto-publish (sql/40) menaikkan SETIAP iklan lunas dengan banner bawaan, jadi
// "masih pakai gambar generik" adalah sisa pekerjaan manusia nomor satu di
// seluruh alur. Sejak papan Schedule ikut menandainya, aturannya dibaca DUA
// permukaan dan ditulis DUA jalur simpan — dan dua salinan aturan yang sama
// adalah persis pelajaran yang melahirkan `airing_instant_of_date` di sql/39.
// ─────────────────────────────────────────────────────────────

/**
 * URL banner ini masih placeholder?
 *
 * Kosong dihitung placeholder: halaman tanpa banner sama-sama belum menjawab
 * pertanyaannya, dan membedakan keduanya di layar hanya menambah kosakata tanpa
 * menambah keputusan.
 */
export function isPlaceholderBannerUrl(url?: string | null): boolean {
  const u = (url ?? '').trim();
  return u === '' || u === DEFAULT_AD_BANNER_URL;
}

/**
 * Tambalan simpan banner — TERMASUK aturan pembersih `requires_banner_update`.
 *
 * ⚠️ JANGAN menulis `banner_url` tanpa lewat sini. `requires_banner_update`
 * berarti "info hadiah pada banner sudah basi", dan sql/36 mengubahnya dari
 * gerbang jadi daftar-tugas: tidak ada tombol "tandai selesai" di mana pun, jadi
 * MENYIMPAN BANNER-LAH satu-satunya yang membersihkannya. Jalur simpan yang lupa
 * melakukannya membuat pengingat itu menempel selamanya di layar Submissions.
 *
 * Banner bawaan TIDAK menghitung sebagai jawaban: ia placeholder generik yang
 * tidak memuat nominal hadiah, jadi halaman yang masih memakainya belum
 * mengomunikasikan hadiah barunya. Tanpa syarat ini, membuka lalu menyimpan
 * halaman yang dibuat otomatis akan diam-diam mematikan pengingatnya.
 */
export function bannerSavePatch(url: string): Record<string, unknown> {
  return isPlaceholderBannerUrl(url)
    ? { banner_url: url }
    : { banner_url: url, requires_banner_update: false };
}
