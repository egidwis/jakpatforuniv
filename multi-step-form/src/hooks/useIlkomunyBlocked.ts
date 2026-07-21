import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { hasRedeemedVoucher, hasActiveVoucherSubmission } from '../utils/supabase';

/**
 * True bila kode voucher yang diberikan adalah ILKOMUNY DAN akun yang login sudah
 * pernah memakainya (redemption lunas ATAU submission ILKOMUNY yang masih aktif).
 *
 * "Blocked" berarti: voucher tak boleh diterapkan lagi — diskon tidak dihitung dan
 * pesan "sudah pernah digunakan" ditampilkan (tanpa memblokir submit). Dipakai di
 * SEMUA titik yang menampilkan total (StepCheckout, UnifiedHeader, Sidebar) agar
 * harga diskon ILKOMUNY-terpakai tidak muncul di mana pun. Query hanya berjalan
 * saat kode == ILKOMUNY.
 */
export function useIlkomunyBlocked(voucherCode: string | undefined): boolean {
  const { user } = useAuth();
  const [used, setUsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (voucherCode?.toUpperCase() !== 'ILKOMUNY') {
      setUsed(false);
      return;
    }
    (async () => {
      const u = (await hasRedeemedVoucher('ILKOMUNY')) || (await hasActiveVoucherSubmission('ILKOMUNY'));
      if (!cancelled) setUsed(u);
    })();
    return () => { cancelled = true; };
  }, [voucherCode, user]);

  return voucherCode?.toUpperCase() === 'ILKOMUNY' && used;
}
