import { Chip } from '../ui/chip';

interface ReviewStatusChipProps {
  status?: string | null;
  size?: 'sm' | 'md';
}

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
      variant = 'amber';
      label = 'Menunggu Revisi';
      break;
    case 'spam':
      variant = 'orange';
      label = 'Spam';
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
