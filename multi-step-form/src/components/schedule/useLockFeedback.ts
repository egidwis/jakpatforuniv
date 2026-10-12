import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import type { LockFeedback } from '../../utils/reservationTicket';

/**
 * Teguran zona kunci tiket reservasi — SATU tempat inline (di bawah tombol
 * Kunci) dan toast-nya, dari kunci i18n yang sama.
 *
 * ⚠️ `toast` BERID KUNCINYA. Bayar redup yang diklik lima kali tidak menumpuk
 * lima toast; sonner memperbarui yang sudah ada.
 *
 * ⚠️ GULIR `block: 'nearest'`. Tidak bergerak bila zonanya sudah terlihat
 * (desktop, sobekan menempel); di ponsel Kunci ditekan dari bar bawah
 * sementara zonanya bisa di luar layar — tanpa gulir pesannya cuma toast.
 */
export function useLockFeedback() {
  const { t } = useLanguage();
  const [error, setError] = useState<LockFeedback | null>(null);
  const [nudging, setNudging] = useState(false);
  const zoneRef = useRef<HTMLElement | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
  }, []);

  const report = useCallback(
    (fb: LockFeedback, opts: { scroll?: boolean; nudge?: boolean } = {}) => {
      setError(fb);
      toast[fb.tone](t(fb.key), { id: fb.key });
      if (opts.scroll) {
        zoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (opts.nudge) {
        if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
        setNudging(true);
        nudgeTimer.current = setTimeout(() => setNudging(false), 1600);
      }
    },
    [t],
  );

  const clear = useCallback(() => setError(null), []);

  return { error, report, clear, zoneRef, nudging };
}

export type LockFeedbackState = ReturnType<typeof useLockFeedback>;
