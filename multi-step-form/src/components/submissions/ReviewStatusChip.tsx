import { Chip } from '../ui/chip';

interface ReviewStatusChipProps {
  status?: string | null;
  size?: 'sm' | 'md';
}

export function ReviewStatusChip({ status, size = 'md' }: ReviewStatusChipProps) {
  const normStatus = status || 'in_review';

  let variant: 'blue' | 'green' | 'red' | 'orange' | 'slate' = 'blue';
  let label = 'Need Review';

  switch (normStatus) {
    case 'approved':
      variant = 'green';
      label = 'Approved';
      break;
    case 'rejected':
      variant = 'red';
      label = 'Rejected';
      break;
    case 'spam':
      variant = 'orange';
      label = 'Spam';
      break;
    case 'in_review':
    default:
      variant = 'blue';
      label = 'Need Review';
      break;
  }

  return (
    <Chip variant={variant} size={size} dot>
      {label}
    </Chip>
  );
}
