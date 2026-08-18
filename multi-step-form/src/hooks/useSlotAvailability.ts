import { useCallback, useEffect, useState } from 'react';
import { fetchSlotAvailability } from '../utils/supabase';
import { MAX_REGULAR_ADS_PER_DAY, MAX_KILAT_ADS_PER_DAY } from '../utils/constants';
import { toLocalYmd } from '../utils/airing-window';

export interface SlotAvailability {
  /** Jumlah iklan yang sudah memesan tiap tanggal, kunci YYYY-MM-DD. */
  counts: Record<string, number>;
  maxPerDay: number;
  isLoading: boolean;
  reload: () => Promise<void>;
  /** Apakah seluruh rentang `days` hari sejak `startYmd` masih muat. */
  isRangeAvailable: (startYmd: string, days: number) => boolean;
}

/**
 * Ketersediaan slot untuk kalender pemesanan.
 *
 * Dipakai di DUA tempat yang harus sepakat: langkah Jadwal di wizard (Fase A)
 * dan kalender yang hidup lagi di halaman pembayaran saat slot kedaluwarsa.
 * Dulu logikanya hanya ada di `StepSchedule`, jadi tempat kedua tidak mungkin
 * dibuat tanpa menyalinnya.
 *
 * `excludeSubmissionId` dipakai saat MEMILIH ULANG tanggal untuk order yang
 * sudah ada — tanpa itu, order tersebut menghitung dirinya sendiri sebagai
 * pesaing dan tanggal yang baru saja dilepasnya bisa tampak penuh.
 */
export function useSlotAvailability(
  mode: 'regular' | 'kilat' = 'regular',
  excludeSubmissionId?: string
): SlotAvailability {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const maxPerDay = mode === 'kilat' ? MAX_KILAT_ADS_PER_DAY : MAX_REGULAR_ADS_PER_DAY;

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const { regularCounts } = await fetchSlotAvailability(excludeSubmissionId, mode);
      setCounts(regularCounts);
    } catch (err) {
      console.error('Failed to fetch slot counts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [mode, excludeSubmissionId]);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Ditelusuri lewat tanggal kalender sungguhan, bukan indeks di dalam jendela
   * 14 hari yang dirender. Versi lama melewati begitu saja hari yang jatuh di
   * luar jendela itu, sehingga iklan panjang bisa lolos melewati kuota pada
   * hari-hari terakhirnya.
   */
  const isRangeAvailable = useCallback(
    (startYmd: string, days: number) => {
      const cursor = new Date(`${startYmd}T00:00:00`);
      if (Number.isNaN(cursor.getTime())) return false;
      for (let i = 0; i < Math.max(days, 1); i++) {
        const ymd = toLocalYmd(cursor);
        if ((counts[ymd] || 0) >= maxPerDay) return false;
        cursor.setDate(cursor.getDate() + 1);
      }
      return true;
    },
    [counts, maxPerDay]
  );

  return { counts, maxPerDay, isLoading, reload, isRangeAvailable };
}
