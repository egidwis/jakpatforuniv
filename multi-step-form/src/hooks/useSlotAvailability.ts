import { useCallback, useEffect, useState } from 'react';
import { fetchSlotAvailability } from '../utils/supabase';
import { MAX_REGULAR_ADS_PER_DAY, MAX_KILAT_ADS_PER_DAY } from '../utils/constants';
import { toLocalYmd } from '../utils/airing-window';

export interface SlotAvailability {
  /** Jumlah iklan yang sudah memesan tiap tanggal, kunci YYYY-MM-DD. */
  counts: Record<string, number>;
  maxPerDay: number;
  isLoading: boolean;
  /**
   * Ketersediaan sudah benar-benar terbaca, minimal sekali.
   *
   * ⚠️ WAJIB DICEK SEBELUM MENGUNCI TANGGAL. `counts` kosong tidak bisa
   * dibedakan dari "semua tanggal lowong": `isRangeAvailable` membacanya
   * sebagai 0 dari kuota, jadi ia menjawab TRUE untuk setiap tanggal —
   * termasuk yang sebenarnya penuh. Selama pengambilan datanya gagal atau
   * menggantung, kalender ini fail-open, dan satu-satunya penjaga yang
   * tersisa adalah pemeriksaan ulang di `submitOrder` (yang hanya berjalan
   * di jalur auto-approval) — jalur rebook tidak punya penjaga sama sekali.
   */
  isReady: boolean;
  /** Pengambilan terakhir gagal atau kehabisan waktu. */
  hasError: boolean;
  reload: () => Promise<void>;
  /** Apakah seluruh rentang `days` hari sejak `startYmd` masih muat. */
  isRangeAvailable: (startYmd: string, days: number) => boolean;
}

/**
 * Permintaan yang menggantung TANPA pernah gagal adalah kegagalan yang paling
 * buruk di sini: spinner berputar selamanya, `counts` tetap kosong, dan
 * kalender diam-diam mengizinkan tanggal yang penuh. `try/catch/finally` tidak
 * menolongnya — `finally` cuma jalan kalau promisenya selesai. Jadi batas
 * waktunya dipasang sendiri.
 */
const AVAILABILITY_TIMEOUT_MS = 15_000;

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
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  const maxPerDay = mode === 'kilat' ? MAX_KILAT_ADS_PER_DAY : MAX_REGULAR_ADS_PER_DAY;

  const reload = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { regularCounts } = await Promise.race([
        fetchSlotAvailability(excludeSubmissionId, mode),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('slot availability timed out')),
            AVAILABILITY_TIMEOUT_MS,
          );
        }),
      ]);
      setCounts(regularCounts);
      setIsReady(true);
    } catch (err) {
      console.error('Failed to fetch slot counts:', err);
      setHasError(true);
    } finally {
      if (timer) clearTimeout(timer);
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

  return { counts, maxPerDay, isLoading, isReady, hasError, reload, isRangeAvailable };
}
