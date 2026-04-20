import { useState, useEffect, useRef } from 'react';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { Calendar, Clock, Loader2, AlertCircle } from 'lucide-react';
import { fetchSlotAvailability } from '../utils/supabase';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

// Helper to format date
const getDateString = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const MAX_REGULAR_ADS_PER_DAY = 3;

interface StepThreeSlotReservationProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
  prevStep: () => void;
}

export function StepThreeSlotReservation({ formData, updateFormData, nextStep, prevStep }: StepThreeSlotReservationProps) {
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    formData.startDate ? new Date(formData.startDate) : null
  );
  const [isFetchingAds, setIsFetchingAds] = useState(false);
  const [regularCountsByDate, setRegularCountsByDate] = useState<Record<string, number>>({});
  const [slotDetails, setSlotDetails] = useState<Record<string, Array<{ id: string, title: string, isExtra: boolean, status: string }>>>({});
  const calendarRef = useRef<HTMLDivElement>(null);

  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const clickedOutsideCalendar = calendarRef.current && !calendarRef.current.contains(event.target as Node);
      const clickedOutsideNav = navRef.current && !navRef.current.contains(event.target as Node);
      if (clickedOutsideCalendar && clickedOutsideNav) {
        setSelectedDate(null);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    loadAvailability();
  }, []);

  const loadAvailability = async () => {
    setIsFetchingAds(true);
    try {
      const { regularCounts, details } = await fetchSlotAvailability();
      setRegularCountsByDate(regularCounts);
      if (details) {
        setSlotDetails(details);
      }
    } catch (error) {
      toast.error(t('slotErrorLoad'));
    } finally {
      setIsFetchingAds(false);
    }
  };

  // Generate next 14 days
  const availableDates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    availableDates.push(d);
  }

  const validateCapacityForRange = (startDay: Date, duration: number): boolean => {
    const current = new Date(startDay);
    current.setHours(0, 0, 0, 0);
    for (let i = 0; i < duration; i++) {
      const dateStr = getDateString(current);
      const count = regularCountsByDate[dateStr] || 0;
      if (count >= MAX_REGULAR_ADS_PER_DAY) {
        return false;
      }
      current.setDate(current.getDate() + 1);
    }
    return true;
  };

  const handleNext = () => {
    if (!selectedDate || !selectedTime) {
      toast.error(t('slotErrorNoDate'));
      return;
    }

    // Capacity Validation
    if (!validateCapacityForRange(selectedDate, formData.duration || 1)) {
      toast.error(t('slotErrorFull'));
      return;
    }

    updateFormData({
      startDate: getDateString(selectedDate),
      startTime: selectedTime,
    });

    // Auto-calculate endDate here or let StepFour calculate it? 
    // Usually StepFour/Dashboard does it based on start time UTC, but let's safely set it if needed.

    nextStep();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              <Calendar size={18} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('slotReservationTitle')}</h3>
          </div>
          {isFetchingAds && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
        </div>

        <div className="p-6">
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-800 text-sm mb-6">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span dangerouslySetInnerHTML={{ __html: t('slotReservationInfo') }} />
          </div>

          <div className="space-y-4">
            <label className="text-sm font-medium text-gray-700">{t('slotStartDateLabel')}</label>
            <div ref={calendarRef} className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 py-1">
              {availableDates.map((date, i) => {
                const dateStr = getDateString(date);
                const baseCount = regularCountsByDate[dateStr] || 0;
                const isFull = baseCount >= MAX_REGULAR_ADS_PER_DAY;
                
                const selectedIndex = selectedDate ? availableDates.findIndex(d => getDateString(d) === getDateString(selectedDate)) : -1;
                const isSelectedInRange = selectedIndex !== -1 && i >= selectedIndex && i < selectedIndex + (formData.duration || 1);
                
                const displayCount = isSelectedInRange ? baseCount + 1 : baseCount;

                let statusColors = 'bg-white border-slate-200 hover:border-blue-400 shadow-sm';
                let textColor = 'text-slate-800';
                
                if (isSelectedInRange) {
                  if (displayCount > MAX_REGULAR_ADS_PER_DAY) {
                    statusColors = 'bg-red-50 border-red-500 ring-1 ring-red-500 shadow-md';
                    textColor = 'text-red-900';
                  } else {
                    statusColors = 'bg-blue-50 border-blue-600 ring-1 ring-blue-600 shadow-md';
                    textColor = 'text-blue-900';
                  }
                } else if (isFull) {
                  statusColors = 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed';
                }

                const dotColor = displayCount > MAX_REGULAR_ADS_PER_DAY ? 'bg-red-500' : isFull && !isSelectedInRange ? 'bg-red-500' : displayCount > 0 ? 'bg-amber-500' : 'bg-emerald-500';

                const detailsForDate = slotDetails[dateStr] || [];

                return (
                  <TooltipProvider key={dateStr} delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={isFull}
                          onClick={() => setSelectedDate(date)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${statusColors}`}
                        >
                          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                            {date.toLocaleDateString('id-ID', { weekday: 'short' })}
                          </span>
                          <span className={`font-extrabold text-[15px] leading-tight mb-1 ${textColor}`}>
                            {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </span>
                          <div className="flex items-center gap-1 mt-auto bg-slate-100/50 px-1.5 py-0.5 rounded-full border border-slate-100">
                            <div className={`w-1 h-1 rounded-full ${dotColor}`} />
                            <span className={`text-[10px] font-semibold ${displayCount > MAX_REGULAR_ADS_PER_DAY ? 'text-red-700' : isFull && !isSelectedInRange ? 'text-red-700' : 'text-slate-600'}`}>
                              {displayCount}/{MAX_REGULAR_ADS_PER_DAY}
                            </span>
                          </div>
                        </button>
                      </TooltipTrigger>
                      {detailsForDate.length > 0 && (
                        <TooltipContent side="top" className="max-w-[280px] p-0 overflow-hidden shadow-xl" align="center">
                          <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                            Slots booked on {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </div>
                          <div className="flex flex-col max-h-[220px] overflow-y-auto">
                            {detailsForDate.map((ad, idx) => (
                              <div key={idx} className="p-3 text-sm border-b last:border-0 border-slate-100 bg-white hover:bg-slate-50 transition-colors text-left">
                                <div className="font-semibold text-sm text-slate-800 leading-tight mb-1.5">{ad.title}</div>
                                <div className="flex items-center gap-2">
                                  {ad.isExtra ? (
                                    <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Extra Ad</span>
                                  ) : (
                                    <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">Reg Ad</span>
                                  )}
                                  <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                                    {ad.status.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </div>

          {/* Fixed 15:00 WIB info banner */}
          <div className="flex items-center gap-3 mt-6 p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
            <Clock className="w-4 h-4 text-blue-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800">{t('slotFixedTimeTitle')}</p>
              <p className="text-xs text-blue-600 mt-0.5">{t('slotFixedTimeDesc')}</p>
            </div>
          </div>

          {selectedDate && (() => {
            const duration = formData.duration || 1;
            const startObj = new Date(selectedDate);
            startObj.setHours(15, 0, 0, 0);
            const endObj = new Date(startObj);
            endObj.setDate(endObj.getDate() + duration);
            const fmtDate = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'numeric', year: 'numeric' });
            return (
              <div className="mt-6 space-y-2 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Schedule Summary</p>
                <div className="flex flex-row gap-2 mt-1">
                  <div className="flex-1 flex flex-col bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                    <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Start Date</span>
                    <span className="font-bold text-gray-900 text-sm">{fmtDate(startObj)} 15:00</span>
                  </div>
                  <div className="flex-1 flex flex-col bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                    <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">{t('slotDurationLabel')}</span>
                    <span className="font-bold text-gray-900 text-sm">{duration} {t('days')}</span>
                  </div>
                  <div className="flex-1 flex flex-col bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                    <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">End Date</span>
                    <span className="font-bold text-gray-900 text-sm">{fmtDate(endObj)} 15:00</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div ref={navRef} className="flex justify-between items-center pt-4">
        <button
          type="button"
          className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 flex items-center gap-2"
          onClick={prevStep}
        >
          ← {t('backButton')}
        </button>
        <button
          onClick={handleNext}
          disabled={!selectedDate || isFetchingAds}
          className="px-6 py-2.5 rounded-xl text-white font-medium shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)', boxShadow: '0 4px 12px rgba(0, 145, 255, 0.3)' }}
        >
          Review & Payment →
        </button>
      </div>

    </div>
  );
}
