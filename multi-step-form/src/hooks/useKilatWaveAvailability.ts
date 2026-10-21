import { useCallback, useEffect, useState } from 'react';
import { fetchKilatWaveOccupancy } from '../utils/supabase';
import { kilatWaveWindow, parseKilatOccupancy, type KilatWaveRow } from '../utils/kilatWaves';

export interface KilatWaveAvailability {
  rows: KilatWaveRow[];
  isLoading: boolean;
  /**
   * Okupansi sudah benar-benar terbaca, minimal sekali.
   *
   * ⚠️ WAJIB DICEK SEBELUM MENGUNCI — alasan yang sama dengan
   * `useSlotAvailability.isReady`: baris kosong tidak bisa dibedakan dari
   * "belum terbaca", dan pemilih tidak boleh fail-open.
   */
  isReady: boolean;
  hasError: boolean;
  /**
   * Mode libur menyala (sql/122): RPC menandai setiap hari kerja sejak
   * tanggal nyala 'holiday', jadi jendela yang dimulai hari ini berisi libur
   * ⇔ tim admin sedang libur. Pemilih TIDAK merender grid saat ini true.
   */
  adminAway: boolean;
  reload: () => Promise<void>;
}

/** Sama dengan kalender Iklan: permintaan yang menggantung dianggap gagal. */
const AVAILABILITY_TIMEOUT_MS = 15_000;

/**
 * Okupansi gelombang Kilat untuk pemilih peneliti (`KilatWavePicker`).
 *
 * `enabled = false` untuk pemanggil yang merender mode lain (aturan hooks
 * memaksa hook tetap dipanggil). `excludeSubmissionId` untuk MEMILIH ULANG gelombang order yang sudah ada —
 * tanpa itu, kursinya sendiri terhitung sebagai saingan.
 */
export function useKilatWaveAvailability(excludeSubmissionId?: string, enabled: boolean = true): KilatWaveAvailability {
  const [rows, setRows] = useState<KilatWaveRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { from, to } = kilatWaveWindow();
      const data = await Promise.race([
        fetchKilatWaveOccupancy(from, to, excludeSubmissionId),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('kilat wave occupancy timed out')), AVAILABILITY_TIMEOUT_MS);
        }),
      ]);
      setRows(parseKilatOccupancy(data));
      setIsReady(true);
    } catch (err) {
      console.error('Gagal memuat okupansi gelombang Kilat:', err);
      setHasError(true);
    } finally {
      if (timer) clearTimeout(timer);
      setIsLoading(false);
    }
  }, [excludeSubmissionId]);

  useEffect(() => {
    if (enabled) void reload();
  }, [reload, enabled]);

  const adminAway = rows.some((r) => r.closedReason === 'holiday');
  return { rows, isLoading, isReady, hasError, adminAway, reload };
}
