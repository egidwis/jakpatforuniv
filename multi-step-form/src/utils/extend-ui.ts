import type { TranslationKey } from '@/i18n/translations';

// Shared status color styles for duration-extension UI (user readonly + airing bar).
// Mirrors the admin ExtendSection palette for visual consistency.
export const EXTEND_STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  // Fase awal periode asli (review/slot) di section Periode Tayang
  in_review: { bg: 'bg-sky-50 border-sky-200/80', text: 'text-sky-700', dot: 'bg-sky-500' },
  waiting_payment: { bg: 'bg-amber-50 border-amber-200/80', text: 'text-amber-800', dot: 'bg-amber-500' },
  paid: { bg: 'bg-emerald-50 border-emerald-200/80', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  scheduled: { bg: 'bg-indigo-50 border-indigo-200/80', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  live: { bg: 'bg-emerald-50 border-emerald-200/80', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  completed: { bg: 'bg-slate-100 border-slate-200/80', text: 'text-slate-700', dot: 'bg-slate-400' },
  cancelled: { bg: 'bg-rose-50 border-rose-200/80', text: 'text-rose-700', dot: 'bg-rose-500' },
  expired: { bg: 'bg-rose-50 border-rose-200/80', text: 'text-rose-700', dot: 'bg-rose-500' },
};

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  in_review: 'statusInReview',
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
