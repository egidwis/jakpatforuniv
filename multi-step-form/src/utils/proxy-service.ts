/**
 * Proxy service untuk mengatasi masalah CORS saat mengakses Google Forms
 */

// URL proxy yang akan digunakan - gunakan hanya yang paling reliable
const PROXY_URLS = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url='
];

/**
 * Fungsi untuk mendapatkan URL dengan proxy
 * @param url URL asli yang ingin diakses
 * @returns URL dengan proxy
 */
export function getProxiedUrl(url: string): string {
  // Gunakan proxy pertama sebagai default
  const proxyUrl = PROXY_URLS[0];

  // Pastikan URL dienkode dengan benar
  const encodedUrl = encodeURIComponent(url);

  // Kembalikan URL dengan proxy
  return `${proxyUrl}${encodedUrl}`;
}

/**
 * Fungsi untuk mencoba semua proxy yang tersedia
 * @param url URL asli yang ingin diakses
 * @param callback Fungsi callback yang akan dipanggil dengan URL proxy yang berhasil
 */
export async function tryAllProxies(url: string, callback: (proxiedUrl: string) => Promise<any>): Promise<any> {
  // Coba tanpa proxy terlebih dahulu
  try {
    return await callback(url);
  } catch (error) {
    console.log('Direct access failed, trying proxies...');
  }

  // Coba semua proxy yang tersedia
  for (const proxyUrl of PROXY_URLS) {
    try {
      const encodedUrl = encodeURIComponent(url);
      const proxiedUrl = `${proxyUrl}${encodedUrl}`;
      console.log(`Trying proxy: ${proxyUrl}`);
      return await callback(proxiedUrl);
    } catch (error) {
      console.log(`Proxy ${proxyUrl} failed, trying next...`);
    }
  }

  // Jika semua proxy gagal, lempar error
  throw new Error('All proxies failed');
}
