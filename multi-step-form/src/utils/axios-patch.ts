/**
 * Patch untuk mengatasi masalah dengan URL constructor di Axios
 * File ini harus diimpor di main.tsx sebelum komponen lain dirender
 *
 * Versi yang disederhanakan untuk meningkatkan performa
 */

// Patch hanya untuk window.location.origin jika perlu
if (typeof window !== 'undefined' && !window.location.origin) {
  try {
    Object.defineProperty(window.location, 'origin', {
      get: function() {
        return window.location.protocol + '//' + window.location.hostname +
          (window.location.port ? ':' + window.location.port : '');
      },
      configurable: true
    });
    console.log('Location origin patch applied successfully');
  } catch (error) {
    console.warn('Failed to patch location.origin:', error);
  }
}
