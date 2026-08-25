import { Chip } from '../ui/chip';

interface ReviewStatusChipProps {
  status?: string | null;
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Chip sumbu review. NILAI DB-nya tidak pernah diubah (`rejected`, `spam`) —
 * yang dipetakan di sini cuma kata yang dilihat manusia:
 *
 *   rejected → "Menunggu Perbaikan"   (bukan penolakan final; admin masih bisa
 *                                      meloloskannya tanpa peneliti klik apa pun)
 *   spam     → "Tidak Valid"          (bukan order sungguhan, disembunyikan
 *                                      dari dashboard peneliti)
 *   cancelled→ "Dibatalkan"           (order sah yang dihentikan)
 */
export function ReviewStatusChip({ status, size = 'md' }: ReviewStatusChipProps) {
  const normStatus = status || 'in_review';

  let variant: 'blue' | 'green' | 'red' | 'orange' | 'slate' | 'indigo' | 'amber' = 'blue';
  let label = 'Need Review';
  let pulse = false;

  switch (normStatus) {
    case 'approved':
      variant = 'indigo';
      label = 'Approved';
      break;
    case 'rejected':
      // Amber, bukan merah: merah berarti final/gagal, dan status ini bukan
      // keduanya — bolanya ada di peneliti, dan admin masih bisa approve.
      variant = 'amber';
      label = 'Menunggu Perbaikan';
      break;
    case 'spam':
      variant = 'orange';
      label = 'Tidak Valid';
      break;
    case 'cancelled':
      variant = 'slate';
      label = 'Dibatalkan';
      break;
    case 'slot_cancelled':
      // Sumbu review-nya sebenarnya tetap 'approved' (sql/62 §2). Chip ini
      // hanya dipakai kalau ada pemanggil yang mengoper nilai mentahnya.
      variant = 'slate';
      label = 'Slot Dibatalkan';
      break;
    case 'in_review':
    case 'pending':
    default:
      variant = 'blue';
      label = 'Need Review';
      pulse = true;
      break;
  }

  return (
    <Chip variant={variant} size={size} dot pulse={pulse}>
      {label}
    </Chip>
  );
}
