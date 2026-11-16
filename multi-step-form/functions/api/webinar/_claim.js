// Klaim bersyarat atas satu baris: hanya satu pemanggil yang menang walau webhook,
// Check Status, dan halaman pembeli berjalan bersamaan.
//
// Diawali `_` supaya Cloudflare Pages tidak merutekannya sebagai endpoint.
//
// ============================================================================
// KENAPA TIDAK MEMBACA BALASAN PATCH (insiden 3 & 5 Nov 2026)
// ============================================================================
// Dulu klaim memakai PATCH ber-`or=(kolom.is.null,kolom.lt.<batas>)` dengan
// `Prefer: return=representation`, lalu menganggap `[]` sebagai "kalah". PostgREST
// menerapkan ulang filter logika `or=` pada baris yang dikembalikan. PATCH itu
// mengubah kolom yang diuji filternya sendiri, jadi baris yang BARU SAJA diklaim
// tidak lolos: database berubah, balasannya kosong (`Content-Range: */*`).
// Akibatnya e-tiket uji 3 & 5 Nov tidak pernah dikirim dan Check Status tidak
// pernah bertanya ke DOKU, tanpa satu galat atau alarm pun.
//
// Protokolnya sekarang: tulis TOKEN unik dengan `return=minimal`, lalu baca balik
// baris yang memuat token itu. Hanya penulis yang menang yang menemukan tokennya:
// UPDATE pihak yang kalah mengevaluasi ulang WHERE terhadap baris pemenang
// (READ COMMITTED), jadi tidak mengubah apa pun.
//
// Token = waktu ISO + 3 digit mikrodetik acak. Kolom klaim bertipe timestamptz
// (presisi mikrodetik), jadi token tersimpan persis tanpa migrasi. Dua klaim pada
// milidetik yang sama bertabrakan dengan peluang 1/1000; akibat terburuknya
// e-tiket terkirim dua kali, yang lebih baik daripada tidak terkirim.
//
// Baca-balik mengandalkan GET ke database utama: API memakai URL proyek bawaan,
// bukan endpoint read replica.
//
// ATURAN UMUM: tulisan yang meminta barisnya kembali tidak boleh memfilter kolom
// yang diubah oleh tulisan itu sendiri. Klaim bersyarat selalu lewat claimRow().
// ============================================================================

const randomDigits = () => {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String(n % 1000).padStart(3, '0');
};

/** Waktu ISO dengan 6 digit pecahan detik, mis. 2026-11-05T05:47:04.630123Z. */
export function claimToken(date = new Date(), digits = randomDigits) {
  return date.toISOString().replace(/Z$/, `${digits()}Z`);
}

/**
 * Menulis token ke `column` bila kolom itu kosong atau lebih tua dari `staleBefore`,
 * lalu membaca balik barisnya.
 *
 * @param {object} p
 * @param {{ url: string, headers: object }} p.sb
 * @param {(url: string, init: object, label: string) => Promise<Response>} p.sbFetch melempar bila !res.ok
 * @param {string} p.table
 * @param {string} p.match  filter kunci baris, sudah ter-encode (mis. `id=eq.<uuid>`)
 * @param {string} [p.where] filter syarat tambahan, sudah ter-encode
 * @param {string} p.column kolom timestamptz tempat klaim
 * @param {string} p.staleBefore ISO; klaim yang lebih tua dari ini boleh diambil alih
 * @param {string} p.select kolom yang dikembalikan untuk pemenang
 * @param {Date} [p.now]
 * @param {string} p.label untuk pesan galat
 * @returns {Promise<{ token: string, row: object } | null>} null = klaim dipegang pihak
 *   lain atau baris tidak memenuhi syarat. Melempar bila database gagal.
 */
export async function claimRow({ sb, sbFetch, table, match, where = '', column, staleBefore, select, now = new Date(), label }) {
  const token = claimToken(now);
  const filters = [match, where].filter(Boolean).join('&');

  await sbFetch(
    `${sb.url}/rest/v1/${table}?${filters}` +
      `&or=(${column}.is.null,${column}.lt.${encodeURIComponent(staleBefore)})`,
    {
      method: 'PATCH',
      // Balasan sengaja tidak diminta: lihat komentar di atas.
      headers: { ...sb.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ [column]: token }),
    },
    `PATCH ${label}`
  );

  const res = await sbFetch(
    `${sb.url}/rest/v1/${table}?${match}&${column}=eq.${encodeURIComponent(token)}&select=${select}`,
    { headers: sb.headers },
    `GET ${label} (baca-balik klaim)`
  );
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? { token, row } : null;
}
