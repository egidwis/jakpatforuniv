import type { TranslationKey } from '@/i18n/translations';

// Shared status color styles for duration-extension UI (user readonly + airing bar).
// Mirrors the admin ExtendSection palette for visual consistency.
export const EXTEND_STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  waiting_payment: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  paid: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  scheduled: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
  live: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
  completed: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', dot: 'bg-gray-400' },
  cancelled: { bg: 'bg-red-50 border-red-200', text: 'text-red-600', dot: 'bg-red-400' },
  expired: { bg: 'bg-red-50 border-red-200', text: 'text-red-600', dot: 'bg-red-400' },
};

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  waiting_payment: 'extStatusWaitingPayment',
  paid: 'extStatusPaid',
  scheduled: 'extStatusScheduled',
  live: 'extStatusLive',
  completed: 'extStatusCompleted',
  cancelled: 'extStatusCancelled',
  expired: 'extStatusExpired',
};

export function extendStatusStyle(status?: string | null) {
  return EXTEND_STATUS_STYLES[(status || '').toLowerCase()] || EXTEND_STATUS_STYLES.scheduled;
}

export function extendStatusLabelKey(status?: string | null): TranslationKey {
  return STATUS_LABEL_KEYS[(status || '').toLowerCase()] || 'extStatusWaitingPayment';
}
