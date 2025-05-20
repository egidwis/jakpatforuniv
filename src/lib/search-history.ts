// Tipe data untuk riwayat pencarian
export interface SearchHistoryItem {
  url: string;
  timestamp: number;
  platform?: string;
  title?: string;
}

// Kunci untuk menyimpan riwayat di localStorage
const STORAGE_KEY = 'survey-extractor-history';

// Fungsi untuk mendapatkan riwayat pencarian dari localStorage
export function getSearchHistory(): SearchHistoryItem[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const storedHistory = localStorage.getItem(STORAGE_KEY);
    if (!storedHistory) return [];
    
    return JSON.parse(storedHistory);
  } catch (error) {
    console.error('Error reading search history:', error);
    return [];
  }
}

// Fungsi untuk menambahkan item ke riwayat pencarian
export function addToSearchHistory(item: SearchHistoryItem): void {
  if (typeof window === 'undefined') return;
  
  try {
    const history = getSearchHistory();
    
    // Cek apakah URL sudah ada di riwayat
    const existingIndex = history.findIndex(h => h.url === item.url);
    
    if (existingIndex >= 0) {
      // Jika URL sudah ada, perbarui timestamp dan data lainnya
      history[existingIndex] = {
        ...history[existingIndex],
        ...item,
        timestamp: Date.now()
      };
    } else {
      // Jika URL belum ada, tambahkan ke riwayat
      history.unshift({
        ...item,
        timestamp: Date.now()
      });
      
      // Batasi jumlah riwayat menjadi 10 item
      if (history.length > 10) {
        history.pop();
      }
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Error saving search history:', error);
  }
}

// Fungsi untuk menghapus item dari riwayat pencarian
export function removeFromSearchHistory(url: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const history = getSearchHistory();
    const newHistory = history.filter(item => item.url !== url);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  } catch (error) {
    console.error('Error removing from search history:', error);
  }
}

// Fungsi untuk menghapus semua riwayat pencarian
export function clearSearchHistory(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing search history:', error);
  }
}
