import { useLanguage } from '@/i18n/LanguageContext';
import { type FormSubmission, type FormSubmissionExtend } from '@/utils/supabase';
import { normalizeScheduleDate } from '@/components/ProgressTracker';
import { extendStatusStyle } from '@/utils/extend-ui';
import { ArrowRight } from 'lucide-react';

const CONFIRMED_STATUSES = ['paid', 'scheduled', 'live', 'completed'];

interface Segment {
  key: string;
  start: Date | null;
  end: Date | null;
  status: string; // live | scheduled | completed
  isOriginal: boolean;
}

/**
 * Readonly "Airing Periods" bar — shows the original survey period plus each
 * confirmed (paid) duration extension as connected, color-coded segments.
 * Renders nothing when there is no confirmed extension (UI stays unchanged).
 */
export function AiringPeriodsBar({
  submission,
  extends_,
}: {
  submission: FormSubmission;
  extends_: FormSubmissionExtend[];
}) {
  const { t } = useLanguage();
  const now = new Date();

  const confirmed = (extends_ || []).filter((e) =>
    CONFIRMED_STATUSES.includes((e.submission_status || '').toLowerCase())
  );
  if (confirmed.length === 0) return null;

  const periodStatus = (start: Date | null, end: Date | null): string => {
    if (start && end) {
      if (start <= now && end >= now) return 'live';
      if (end < now) return 'completed';
      return 'scheduled';
    }
    return 'scheduled';
  };

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—';

  const segments: Segment[] = [];

  const oStart = submission.start_date ? normalizeScheduleDate(submission.start_date) : null;
  const oEnd = submission.end_date ? normalizeScheduleDate(submission.end_date) : null;
  segments.push({
    key: 'original',
    start: oStart,
    end: oEnd,
    status: periodStatus(oStart, oEnd),
    isOriginal: true,
  });

  [...confirmed]
    .sort((a, b) => {
      const as = a.start_date ? normalizeScheduleDate(a.start_date).getTime() : 0;
      const bs = b.start_date ? normalizeScheduleDate(b.start_date).getTime() : 0;
      return as - bs;
    })
    .forEach((e, i) => {
      const s = e.start_date ? normalizeScheduleDate(e.start_date) : null;
      const en = e.end_date ? normalizeScheduleDate(e.end_date) : null;
      segments.push({
        key: e.id || `ext-${i}`,
        start: s,
        end: en,
        status: periodStatus(s, en),
        isOriginal: false,
      });
    });

  return (
    <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30 p-3">
      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">
        {t('airingPeriods')}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {segments.map((seg, idx) => {
          const style = extendStatusStyle(seg.status);
          return (
            <div key={seg.key} className="flex items-center gap-1.5">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] ${style.bg}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  {fmt(seg.start)}–{fmt(seg.end)}
                </span>
                {seg.isOriginal && (
                  <span className="text-gray-400 dark:text-gray-500">· {t('airingOriginal')}</span>
                )}
                <span className={`uppercase tracking-wide font-semibold ${style.text}`}>
                  {seg.status === 'live'
                    ? t('extStatusLive')
                    : seg.status === 'completed'
                      ? t('extStatusCompleted')
                      : t('extStatusScheduled')}
                </span>
              </div>
              {idx < segments.length - 1 && (
                <ArrowRight className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
