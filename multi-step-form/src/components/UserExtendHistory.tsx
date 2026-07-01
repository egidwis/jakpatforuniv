import { useLanguage } from '@/i18n/LanguageContext';
import { type FormSubmissionExtend } from '@/utils/supabase';
import { type ExtendPaymentInfo, normalizeScheduleDate } from '@/components/ProgressTracker';
import { extendStatusStyle, extendStatusLabelKey } from '@/utils/extend-ui';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, DollarSign, CreditCard, ExternalLink, AlertCircle } from 'lucide-react';

/**
 * Readonly collapsible list of all duration extensions for a survey.
 * Shows a pay button for extensions still awaiting payment with a valid link,
 * and an expired notice (no dead button) when the payment link has lapsed.
 */
export function UserExtendHistory({
  extends_,
  payments,
}: {
  extends_: FormSubmissionExtend[];
  payments: Record<string, ExtendPaymentInfo>;
}) {
  const { t } = useLanguage();
  if (!extends_ || extends_.length === 0) return null;

  const fmt = (d?: string | null) =>
    d ? normalizeScheduleDate(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="mt-4">
      <Accordion type="single" collapsible>
        <AccordionItem value="extend-history" className="border rounded-lg px-3">
          <AccordionTrigger className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:no-underline">
            {t('extendHistory')} ({extends_.length})
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-2">
              {extends_.map((ext, i) => {
                const pay = ext.id ? payments[ext.id] : null;
                const status = (ext.submission_status || 'waiting_payment').toLowerCase();
                const isExpiredLink = status === 'waiting_payment' && pay?.status === 'expired';
                const displayStatus = isExpiredLink ? 'expired' : status;
                const canPay = status === 'waiting_payment' && pay?.status === 'pending' && !!pay?.paymentUrl;
                const style = extendStatusStyle(displayStatus);

                return (
                  <div
                    key={ext.id || `ext-${i}`}
                    className={`flex flex-col gap-1.5 px-2.5 py-2 rounded-md border text-[11px] ${style.bg}`}
                  >
                    {/* Row 1: status + period batch */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                        <span className={`font-semibold uppercase tracking-wider ${style.text}`}>
                          {t(extendStatusLabelKey(displayStatus))}
                        </span>
                      </div>
                      {ext.period_batch && (
                        <span className="text-gray-400 font-mono text-[10px]">{ext.period_batch}</span>
                      )}
                    </div>

                    {/* Row 2: date range + duration */}
                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span>{fmt(ext.start_date)} → {fmt(ext.end_date)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>{ext.duration} {t('days')}</span>
                      </div>
                    </div>

                    {/* Row 3: incentive details */}
                    {ext.is_new_month && ext.prize_per_winner && ext.prize_per_winner > 0 ? (
                      <div className="flex items-center gap-1 text-emerald-600">
                        <DollarSign className="w-3 h-3" />
                        <span>Rp {ext.prize_per_winner.toLocaleString('id-ID')} × {ext.winner_count}</span>
                        <Badge variant="outline" className="ml-1 px-1 py-0 h-3.5 text-[8px] bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full">
                          NEW
                        </Badge>
                      </div>
                    ) : ext.additional_prize_per_winner && ext.additional_prize_per_winner > 0 ? (
                      <div className="flex items-center gap-1 text-blue-600">
                        <DollarSign className="w-3 h-3" />
                        <span>+Rp {ext.additional_prize_per_winner.toLocaleString('id-ID')}/winner</span>
                      </div>
                    ) : null}

                    {/* Row 4: pay button / expired hint */}
                    {canPay && (
                      <a
                        href={pay!.paymentUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-0.5 w-fit px-3 py-1 text-[11px] font-semibold text-white rounded-full hover:opacity-90 transition-opacity shadow-sm"
                        style={{ backgroundColor: '#0091ff' }}
                      >
                        <CreditCard className="w-3 h-3" />
                        {t('payExtension')}
                        <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                      </a>
                    )}
                    {isExpiredLink && (
                      <div className="flex items-start gap-1.5 mt-0.5 text-[10px] text-red-600">
                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{t('extendExpiredHint')}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
