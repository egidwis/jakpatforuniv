/**
 * Proxy service untuk mengatasi masalah CORS saat mengakses Google Forms
 */

// URL proxy yang akan digunakan - gunakan hanya yang paling reliable
const PROXY_URLS = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://cors.eu.org/',
  'https://proxy.cors.sh/'
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
 * Fungsi untuk mencoba semua proxy yang tersedia dengan timeout
 * @param url URL asli yang ingin diakses
 * @param callback Fungsi callback yang akan dipanggil dengan URL proxy yang berhasil
 * @param timeoutMs Timeout dalam milidetik (default: 10000ms)
 */
export async function tryAllProxies(
  url: string,
  callback: (proxiedUrl: string) => Promise<any>,
  timeoutMs: number = 10000
): Promise<any> {
  // Fungsi untuk menambahkan timeout ke promise
  const withTimeout = (promise: Promise<any>, ms: number) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), ms)
      )
    ]);
  };

  // Coba tanpa proxy terlebih dahulu dengan timeout
  try {
    console.log('Trying direct access...');
    return await withTimeout(callback(url), timeoutMs);
  } catch (error) {
    console.log('Direct access failed, trying proxies...', error);
  }

  // Coba semua proxy yang tersedia dengan timeout
  for (const proxyUrl of PROXY_URLS) {
    try {
      const encodedUrl = encodeURIComponent(url);
      const proxiedUrl = `${proxyUrl}${encodedUrl}`;
      console.log(`Trying proxy: ${proxyUrl}`);

      // Gunakan timeout untuk mencegah request yang terlalu lama
      return await withTimeout(callback(proxiedUrl), timeoutMs);
    } catch (error) {
      console.log(`Proxy ${proxyUrl} failed, trying next...`, error);
    }
  }

  // Jika semua proxy gagal, lempar error
  console.error('All proxies failed');
  throw new Error('All proxies failed');
}

/**
 * Fungsi untuk mengambil data dengan timeout
 * @param url URL yang akan diakses
 * @param timeoutMs Timeout dalam milidetik
 * @returns Promise yang resolve dengan data atau reject dengan error
 */
export function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Request timeout'));
    }, timeoutMs);

    fetch(url, { signal: controller.signal })
      .then(response => {
        clearTimeout(timeout);
        resolve(response);
      })
      .catch(error => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}
