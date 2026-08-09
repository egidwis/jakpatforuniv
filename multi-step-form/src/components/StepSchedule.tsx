import { useState, useEffect, useRef } from 'react';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { Loader2, AlertCircle } from 'lucide-react';
import { fetchSlotAvailability } from '../utils/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { SectionLabel } from './SurveyFieldRow';


import { MAX_REGULAR_ADS_PER_DAY, MAX_KILAT_ADS_PER_DAY } from '../utils/constants';
import { isBookingClosedForDate, toAiringStartIso, toAiringEndIso, toLocalYmd } from '../utils/airing-window';

// Helper to format date
const getDateString = toLocalYmd;

interface StepScheduleProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
  prevStep: () => void;
  mode?: 'regular' | 'kilat';
}

export function StepSchedule({ formData, updateFormData, nextStep, prevStep, mode = 'regular' }: StepScheduleProps) {
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    formData.startDate ? new Date(formData.startDate) : null
  );
  const [selectedTime, setSelectedTime] = useState<string>(formData.startTime || "15:00");

  const [regularCountsByDate, setRegularCountsByDate] = useState<Record<string, number>>({});
  const [slotDetails, setSlotDetails] = useState<Record<string, any[]>>({});
  const [isFetchingAds, setIsFetchingAds] = useState(false);

  const calendarRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Focus management on step load
  useEffect(() => {
    calendarRef.current?.focus();
  }, []);

  // Fetch slot availability from database (form_submissions table)
  useEffect(() => {
    async function loadSlotCounts() {
      setIsFetchingAds(true);
      try {
        const { regularCounts, details } = await fetchSlotAvailability(undefined, mode);
        setRegularCountsByDate(regularCounts);
        if (details) setSlotDetails(details);
      } catch (err) {
        console.error('Failed to fetch slot counts:', err);
      } finally {
        setIsFetchingAds(false);
      }
    }
    loadSlotCounts();
  }, []);

  // Compute available dates from today
  const availableDates: Date[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    availableDates.push(d);
  }

  // Double Check if date booking is closed (e.g. today after 13:00 WIB)
  const isDateClosed = (d: Date) => {
    return isBookingClosedForDate(getDateString(d));
  };

  // Safe Check range capacity
  const validateCapacityForRange = (startDate: Date, durationDays: number): boolean => {
    const maxAdsPerDay = mode === 'kilat' ? MAX_KILAT_ADS_PER_DAY : MAX_REGULAR_ADS_PER_DAY;
    const startIdx = availableDates.findIndex(d => getDateString(d) === getDateString(startDate));
    if (startIdx === -1) return true;

    for (let i = 0; i < durationDays; i++) {
      const checkDate = availableDates[startIdx + i];
      if (!checkDate) continue;
      const dateStr = getDateString(checkDate);
      const count = regularCountsByDate[dateStr] || 0;
      if (count >= maxAdsPerDay) {
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!selectedDate || !selectedTime) {
      toast.error(t('slotErrorNoDate'));
      return;
    }

    if (isDateClosed(selectedDate)) {
      toast.error(t('slotErrorPastCutoff'));
      setSelectedDate(null);
      return;
    }

    const effectiveDuration = mode === 'kilat' ? 1 : (formData.duration || 1);
    if (!validateCapacityForRange(selectedDate, effectiveDuration)) {
      toast.error(t('slotErrorFull'));
      return;
    }

    updateFormData({
      startDate: getDateString(selectedDate),
      startTime: selectedTime,
    });

    nextStep();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3.5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm overflow-hidden space-y-4">
        <div className="flex items-center justify-between">
          <SectionLabel>{mode === 'kilat' ? t('kilatScheduleTitle') : t('slotReservationTitle')}</SectionLabel>
          {isFetchingAds && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
        </div>

        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-800 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span dangerouslySetInnerHTML={{ __html: t('slotReservationInfo') }} />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">{t('slotStartDateLabel')}</label>
          <div ref={calendarRef} className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 py-1">
            {availableDates.map((date, i) => {
              const dateStr = getDateString(date);
              const maxAdsPerDay = mode === 'kilat' ? MAX_KILAT_ADS_PER_DAY : MAX_REGULAR_ADS_PER_DAY;
              const baseCount = regularCountsByDate[dateStr] || 0;
              const isFull = baseCount >= maxAdsPerDay;
              const isClosed = isBookingClosedForDate(dateStr);

              const selectedIndex = selectedDate ? availableDates.findIndex(d => getDateString(d) === getDateString(selectedDate)) : -1;
              const effectiveDuration = mode === 'kilat' ? 1 : (formData.duration || 1);
              const isSelectedInRange = selectedIndex !== -1 && i >= selectedIndex && i < selectedIndex + effectiveDuration;
              
              const displayCount = isSelectedInRange ? baseCount + 1 : baseCount;

              let statusColors = 'bg-white border-slate-200 hover:border-blue-400 shadow-sm';
              let textColor = 'text-slate-800';
              
              if (isSelectedInRange) {
                if (displayCount > maxAdsPerDay) {
                  statusColors = 'bg-red-50 border-red-500 ring-1 ring-red-500 shadow-md';
                  textColor = 'text-red-900';
                } else {
                  statusColors = mode === 'kilat' ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500 shadow-md' : 'bg-blue-50 border-blue-600 ring-1 ring-blue-600 shadow-md';
                  textColor = mode === 'kilat' ? 'text-amber-900' : 'text-blue-900';
                }
              } else if (isClosed) {
                statusColors = 'bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed';
                textColor = 'text-slate-500';
              } else if (isFull) {
                statusColors = 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed';
              }

              const dotColor = displayCount > maxAdsPerDay ? 'bg-red-500' : isFull && !isSelectedInRange ? 'bg-red-500' : displayCount > 0 ? 'bg-amber-500' : 'bg-emerald-500';

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isFull || isClosed}
                  onClick={() => {
                    setSelectedDate(date);
                    setSelectedTime("15:00");
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${statusColors}`}
                >
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    {date.toLocaleDateString('id-ID', { weekday: 'short' })}
                  </span>
                  <span className={`font-extrabold text-[15px] leading-tight mb-1 ${textColor}`}>
                    {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  </span>
                  {isClosed ? (
                    <div className="flex items-center gap-1 mt-auto bg-slate-200/60 px-1.5 py-0.5 rounded-full border border-slate-200">
                      <span className="text-[10px] font-semibold text-slate-500">{t('slotClosedTodayLabel')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-auto bg-slate-100/50 px-1.5 py-0.5 rounded-full border border-slate-100">
                      <div className={`w-1 h-1 rounded-full ${dotColor}`} />
                      <span className={`text-[10px] font-semibold ${displayCount > maxAdsPerDay ? 'text-red-700' : isFull && !isSelectedInRange ? 'text-red-700' : 'text-slate-600'}`}>
                        {displayCount}/{maxAdsPerDay}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selectedDate && (() => {
          const duration = mode === 'kilat' ? 1 : (formData.duration || 1);
          const ymd = getDateString(selectedDate);
          const startObj = new Date(toAiringStartIso(ymd));
          const endObj = new Date(toAiringEndIso(ymd, duration));
          const fmtDate = (d: Date) =>
            d.toLocaleDateString('id-ID', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Jakarta' });
          return (
            <div className="space-y-2 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Schedule Summary</p>
              <div className="flex flex-row gap-2 mt-1">
                <div className="flex-1 flex flex-col bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                  <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Start Date</span>
                  <span className="font-bold text-gray-900 text-sm">{fmtDate(startObj)} 15.00 WIB</span>
                </div>
                <div className="flex-1 flex flex-col bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                  <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">{t('slotDurationLabel')}</span>
                  <span className="font-bold text-gray-900 text-sm">{mode === 'kilat' ? t('kilatDuration') : `${duration} ${t('days')}`}</span>
                </div>
                <div className="flex-1 flex flex-col bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                  <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">End Date</span>
                  <span className="font-bold text-gray-900 text-sm">{fmtDate(endObj)} 15.00 WIB</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Submit Button */}
      <div ref={navRef} className="flex justify-end">
        <button
          onClick={handleNext}
          disabled={!selectedDate || isFetchingAds}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Review & Payment →
        </button>
      </div>

    </div>
  );
}
