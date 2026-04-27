import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import type { View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './SchedulingPage.css'; // Add custom CSS overrides
import { getScheduledPages, getPendingSlotsWithoutPage, supabase } from '@/utils/supabase'; // Added supabase
import { PageBuilderModal } from '@/components/PageBuilder/PageBuilderModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink, Activity, CalendarClock, ListTodo, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

// Setup the localizer for react-big-calendar
const localizer = momentLocalizer(moment);

/**
 * Normalize a schedule date string for accurate time comparison.
 * Date-only strings (e.g. "2026-04-13") are parsed as midnight UTC by JS,
 * which equals 07:00 WIB — before the intended 15:00 WIB go-live time.
 * This detects date-only values and sets the time to 08:00 UTC (= 15:00 WIB).
 */
function normalizeScheduleDate(dateStr: string): Date {
    const d = new Date(dateStr);
    if (!dateStr.includes('T')) {
        d.setUTCHours(8, 0, 0, 0);
    }
    return d;
}

// Semantic Status Color Palettes
const STATUS_PALETTES = {
    upcomingNoPage: { bg: '#f0f9ff', border: '#e0f2fe', leftBorder: '#7dd3fc', text: '#0369a1', badgeBg: '#bae6fd', badgeText: '#0284c7' }, // Soft Sky Blue
    upcomingDraft: { bg: '#fffbeb', border: '#fde68a', leftBorder: '#f59e0b', text: '#92400e', badgeBg: '#fef3c7', badgeText: '#b45309' }, // Amber
    upcomingScheduled: { bg: '#faf5ff', border: '#e9d5ff', leftBorder: '#a855f7', text: '#6b21a8', badgeBg: '#f3e8ff', badgeText: '#7e22ce' }, // Purple
    live: { bg: '#f0fdf4', border: '#bbf7d0', leftBorder: '#22c55e', text: '#166534', badgeBg: '#dcfce7', badgeText: '#15803d' }, // Green
    completed: { bg: '#f8fafc', border: '#e2e8f0', leftBorder: '#475569', text: '#1e293b', badgeBg: '#cbd5e1', badgeText: '#334155' } // Dark Gray
};

interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource: any; // Allow mixed types for now
}

export // Extracted so the reference stays stable across renders
    const DEFAULT_SCROLL_TIME = new Date(1970, 1, 1, 12, 0, 0);

const CustomDateHeader = ({ label, date }: { label: string, date: Date }) => {
    const isToday = moment(date).isSame(moment(), 'day');
    return (
        <div className="flex justify-end p-1">
            <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold transition-colors ${isToday ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' : 'text-slate-700 hover:bg-slate-100'}`}>
                {label}
            </div>
        </div>
    );
};

const CustomWeekHeader = ({ date }: { date: Date }) => {
    const isToday = moment(date).isSame(moment(), 'day');
    const weekdayName = moment(date).format('ddd');
    const dayNumber = moment(date).format('D');

    return (
        <div className="flex flex-col items-center justify-center py-2.5 gap-1.5 w-full">
            <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider leading-none ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                {weekdayName}
            </span>
            <div className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full text-sm sm:text-[15px] font-bold transition-all leading-none ${isToday ? 'bg-blue-600 text-white shadow-md shadow-blue-200/50 ring-2 ring-blue-50 ring-offset-2' : 'text-slate-700 hover:bg-slate-100'}`}>
                {dayNumber}
            </div>
        </div>
    );
};

const CustomAgendaEvent = ({ event, onSelectEvent }: { event: CalendarEvent, onSelectEvent?: (e: CalendarEvent) => void }) => {
    const theme = event.resource.colorTheme || STATUS_PALETTES.upcomingNoPage;
    let status = '';
    if (!event.resource.page_id) {
        status = new Date() < event.start ? 'Pending' : 'Overdue';
    } else {
        status = new Date() >= event.start && new Date() <= event.end ? 'Active' : new Date() < event.start ? 'Upcoming' : 'Completed';
    }
    
    return (
        <div className="flex flex-col rounded-xl border bg-white border-slate-200 shadow-sm my-1 transition-all overflow-hidden">
            <div className="flex flex-col gap-2 p-3 sm:p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1.5">
                        <div className="font-semibold text-sm sm:text-base text-slate-900 flex items-start gap-2">
                            <span
                                className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-bold tracking-wider uppercase leading-none mt-[0.2rem] shrink-0"
                                style={{ backgroundColor: theme.badgeBg, color: theme.badgeText }}
                            >
                                AD
                            </span>
                            <span className="line-clamp-2 leading-snug break-words" title={event.resource.form_title}>
                                {event.resource.form_title}
                            </span>
                        </div>
                        {event.resource.researcher_name && (
                            <div className="text-xs text-slate-500 flex items-center gap-1.5">
                                <span className="font-medium">Researcher:</span> {event.resource.researcher_name}
                            </div>
                        )}
                    </div>
                    {status === 'Active' ? (
                        <div className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1.5 rounded-full flex items-center gap-1.5 uppercase tracking-widest shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Active
                        </div>
                    ) : status === 'Upcoming' ? (
                        <div className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1.5 rounded-full flex items-center gap-1.5 uppercase tracking-widest shrink-0">
                            Upcoming
                        </div>
                    ) : status === 'Pending' ? (
                        <div className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1.5 rounded-full flex items-center gap-1.5 uppercase tracking-widest shrink-0">
                            Pending Page
                        </div>
                    ) : status === 'Overdue' ? (
                        <div className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-1.5 rounded-full flex items-center gap-1.5 uppercase tracking-widest shrink-0">
                            Overdue
                        </div>
                    ) : (
                        <div className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1.5 rounded-full flex items-center gap-1.5 uppercase tracking-widest shrink-0">
                            Completed
                        </div>
                    )}
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-1 pt-3 border-t border-slate-100">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Start Date</span>
                        <span className="text-xs font-medium text-slate-700">
                            {(() => {
                                const d = normalizeScheduleDate(event.resource.start_date);
                                return (
                                    <>
                                        {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        <span className="text-slate-400 ml-1">{d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</span>
                                    </>
                                );
                            })()}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">End Date</span>
                        <span className="text-xs font-medium text-slate-700">
                            {(() => {
                                const d = normalizeScheduleDate(event.resource.end_date);
                                return (
                                    <>
                                        {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        <span className="text-slate-400 ml-1">{d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</span>
                                    </>
                                );
                            })()}
                        </span>
                    </div>
                </div>
            </div>
            
            {/* Accent line dividing main content and footer */}
            <div style={{ backgroundColor: theme.leftBorder, height: '3px', width: '100%' }}></div>

            {/* Page Status Footer */}
            <div className="bg-slate-50/80 px-4 py-2.5 flex items-center justify-between gap-3 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-1 overflow-hidden">
                    {event.resource.page_id ? (
                        <>
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></div>
                            <span className="text-[11px] font-medium text-slate-600 truncate" title={event.resource.page_title}>
                                <span className="text-slate-400 mr-1">Page:</span> {event.resource.page_title}
                            </span>
                        </>
                    ) : (
                        <>
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"></div>
                            <span className="text-[11px] font-medium text-rose-600/90 italic truncate">
                                Page belum dibuat
                            </span>
                        </>
                    )}
                </div>
                
                {!event.resource.page_id && (
                    <div 
                        className="text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors px-2.5 py-1 rounded shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer select-none"
                        onClick={() => onSelectEvent?.(event)}
                    >
                        <Plus className="w-3 h-3" />
                        <span>Create Page</span>
                    </div>
                )}
                {event.resource.page_id && (
                    <div 
                        className="text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors px-2 py-1 flex items-center gap-1 shrink-0 cursor-pointer select-none"
                        onClick={() => onSelectEvent?.(event)}
                    >
                        <span>Edit</span>
                        <ExternalLink className="w-3 h-3" />
                    </div>
                )}
            </div>
        </div>
    );
};

const CustomAgendaListView = memo(({ events, currentDate, onSelectEvent }: { events: CalendarEvent[], currentDate: Date, onSelectEvent: (e: CalendarEvent) => void }) => {
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Scroll to today if present, but only ONCE per date view to avoid jumping on data reload
    const hasScrolledRef = useRef(false);
    
    // Reset scroll state if the user navigates calendar dates
    useEffect(() => {
        hasScrolledRef.current = false;
    }, [currentDate]);

    useEffect(() => {
        if (hasScrolledRef.current || events.length === 0) return;
        
        const todayElement = document.getElementById('agenda-today');
        if (todayElement) {
            setTimeout(() => {
                const y = todayElement.getBoundingClientRect().top + window.scrollY - 100;
                const container = todayElement.closest('.overflow-y-auto');
                if (container) {
                    container.scrollTo({ top: todayElement.offsetTop - 20, behavior: 'smooth' });
                } else {
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
                hasScrolledRef.current = true;
            }, 100);
        } else {
            // If today is not in this month's render scope, mark as scrolled
            hasScrolledRef.current = true;
        }
    }, [events, currentDate]);
    
    const sortedDates: { date: Date, ending: CalendarEvent[], starting: CalendarEvent[] }[] = [];
    
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(currentYear, currentMonth, i);
        const currentDayTime = date.getTime();
        
        const ending: CalendarEvent[] = [];
        const starting: CalendarEvent[] = [];
        
        events.forEach(event => {
            const eventStart = new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate()).getTime();
            const eventEnd = new Date(event.end.getFullYear(), event.end.getMonth(), event.end.getDate()).getTime();
            
            if (currentDayTime === eventEnd) {
                ending.push(event);
            } 
            if (currentDayTime >= eventStart && (currentDayTime < eventEnd || eventStart === eventEnd)) {
                starting.push(event);
            }
        });
        
        if (ending.length > 0 || starting.length > 0) {
            sortedDates.push({ date, ending, starting });
        }
    }
    
    if (sortedDates.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-slate-500 font-medium pt-10">
                No events scheduled for {currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-10 pb-10 max-w-7xl pt-2">
            {sortedDates.map(({ date, starting, ending }) => {
                const isToday = moment(date).isSame(moment(), 'day');
                const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                
                return (
                    <div key={date.toDateString()} id={isToday ? 'agenda-today' : undefined} className="flex flex-col md:flex-row gap-6 relative">
                        <div className="w-full md:w-36 shrink-0 md:sticky md:top-0 h-fit z-10 bg-white/80 py-2">
                            <div className={`mt-0 ${isToday ? 'bg-blue-600 text-white px-3 py-1.5 rounded-lg inline-block shadow-sm ring-4 ring-blue-50 font-bold' : 'text-slate-700 font-semibold py-1.5'} text-sm`}>
                                {label}
                            </div>
                        </div>
                        
                        <div className="flex-1 grid grid-cols-2 gap-4 lg:gap-8 border-l-2 border-slate-100 pl-4 lg:pl-8 py-2">
                            {/* Left Column: Ending */}
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                                    <span className="text-[11px] font-bold text-rose-600 uppercase tracking-widest leading-none">Berakhir Hari Ini ({ending.length})</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {ending.map(event => (
                                        <div key={`end-${event.id}`} className="block w-full">
                                            <CustomAgendaEvent event={event} onSelectEvent={onSelectEvent} />
                                        </div>
                                    ))}
                                    {ending.length === 0 && (
                                        <div className="text-xs text-slate-400 italic p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex justify-center items-center h-20">Tidak ada event yang berakhir</div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Right Column: Starting */}
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                                    <span className="text-[11px] font-bold text-teal-600 uppercase tracking-widest leading-none">Tayang Hari Ini ({starting.length})</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {starting.map(event => (
                                        <div key={`start-${event.id}`} className="block w-full">
                                            <CustomAgendaEvent event={event} onSelectEvent={onSelectEvent} />
                                        </div>
                                    ))}
                                    {starting.length === 0 && (
                                        <div className="text-xs text-slate-400 italic p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex justify-center items-center h-20">Tidak ada event yang tayang</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

export function SchedulingPage() {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<View>(Views.AGENDA);
    const [date, setDate] = useState(new Date());

    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [focusedEventIds, setFocusedEventIds] = useState<string[]>([]);

    // Publish Page State
    const [isPublishPageModalOpen, setIsPublishPageModalOpen] = useState(false);
    const [existingPublishPage, setExistingPublishPage] = useState<any>(null);

    // Stats & Filters State
    const [stats, setStats] = useState({
        activeToday: 0,
        upcomingWeek: 0,
        totalScheduled: 0
    });


    const fetchEvents = async () => {
        setLoading(true);
        try {
            // 1. Fetch pages that have a submission (ads with pages created)
            const pages = await getScheduledPages();

            // 2. Fetch slots that are booked but don't have a page yet
            const pendingSlots = await getPendingSlotsWithoutPage();

            // 3. Convert pages to calendar events
            const pageEvents: CalendarEvent[] = (pages || []).map((page: any) => {
                const startDate = normalizeScheduleDate(page.start_date || page.publish_start_date);
                const endDate = normalizeScheduleDate(page.end_date || page.publish_end_date);

                // Determine Semantic Status Color
                const now = new Date();
                let eventStatus: keyof typeof STATUS_PALETTES = 'upcomingNoPage';

                if (now > endDate) {
                    eventStatus = 'completed';
                } else if (now >= startDate && now <= endDate) {
                    eventStatus = 'live';
                } else {
                    if (!page.is_published) {
                        eventStatus = 'upcomingDraft';
                    } else {
                        eventStatus = 'upcomingScheduled';
                    }
                }

                return {
                    id: `page-${page.id}`,
                    title: `Ad: ${page.form_title}`,
                    start: startDate,
                    end: endDate,
                    resource: {
                        ...page,
                        type: 'ad',
                        form_submission_id: page.submission_id,
                        colorTheme: STATUS_PALETTES[eventStatus],
                        page_id: page.id,
                        page_title: page.title,
                        page_is_published: page.is_published,
                    },
                };
            });

            // 4. Convert pending slots (no page yet) to calendar events
            const slotEvents: CalendarEvent[] = (pendingSlots || []).map((slot: any) => {
                const startDate = normalizeScheduleDate(slot.start_date);
                const endDate = normalizeScheduleDate(slot.end_date);

                return {
                    id: `slot-${slot.id}`,
                    title: `Ad: ${slot.form_title}`,
                    start: startDate,
                    end: endDate,
                    resource: {
                        ...slot,
                        type: 'ad',
                        form_submission_id: slot.id,
                        colorTheme: STATUS_PALETTES.upcomingNoPage, // Amber-ish for no page
                        page_id: null,
                        page_title: null,
                        page_is_published: false,
                    },
                };
            });

            const allEvents = [...pageEvents, ...slotEvents];

            // Calculate stats
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

            const nextWeek = new Date(todayStart);
            nextWeek.setDate(nextWeek.getDate() + 7);

            let activeToday = 0;
            let upcomingWeek = 0;

            allEvents.forEach(event => {
                const isCurrentlyActive = event.start <= todayEnd && event.end >= todayStart;
                const isUpcomingThisWeek = event.start > todayEnd && event.start <= nextWeek;

                if (isCurrentlyActive) activeToday++;
                if (isUpcomingThisWeek) upcomingWeek++;
            });

            setStats({
                activeToday,
                upcomingWeek,
                totalScheduled: allEvents.length
            });

            setEvents(allEvents);
        } catch (error) {
            console.error('Error fetching schedules:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const eventStyleGetter = useCallback((event: CalendarEvent) => {
        const theme = event.resource.colorTheme || STATUS_PALETTES.upcomingNoPage;
        const isFocused = focusedEventIds.includes(event.id);

        if (view === Views.AGENDA) {
            return {
                style: {
                    border: 'none',
                    backgroundColor: 'transparent',
                }
            };
        }

        if (isFocused && view === Views.MONTH) {
            return {
                style: {
                    backgroundColor: '#2563eb', // solid blue-600
                    border: '1px solid #1d4ed8',
                    borderLeft: '4px solid #1e3a8a',
                    borderRadius: '6px',
                    color: '#ffffff',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
                    outline: 'none',
                    zIndex: 10,
                    position: 'relative' as 'relative'
                }
            };
        }

        return {
            style: {
                backgroundColor: theme.bg,
                border: '1px solid',
                borderColor: theme.border,
                borderLeft: `4px solid ${theme.leftBorder}`,
                borderRadius: '6px',
                color: theme.text,
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
                outline: 'none',
                transition: 'all 0.2s',
            }
        };
    }, [view, focusedEventIds]);

    const CustomEvent = useCallback(({ event }: { event: CalendarEvent }) => {
        const theme = event.resource.colorTheme || STATUS_PALETTES.upcomingNoPage;
        const isFocused = focusedEventIds.includes(event.id);

        if (view === Views.MONTH) {
            const startTimeStr = new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return (
                <div className="flex items-center px-1 py-0 w-full h-full focus:outline-none overflow-hidden" style={{ color: isFocused ? '#ffffff' : theme.text }}>
                    <span
                        className="text-[7px] px-1 rounded-[2px] font-bold tracking-wider uppercase flex-shrink-0 leading-none mr-1 py-[1.5px]"
                        style={isFocused ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#ffffff' } : { backgroundColor: theme.badgeBg, color: theme.badgeText }}
                    >
                        AD
                    </span>
                    <span className={`text-[8px] font-bold mr-1 flex-shrink-0 tracking-wide ${isFocused ? 'text-blue-100 opacity-90' : 'opacity-70'}`}>
                        {startTimeStr}
                    </span>
                    <span className={`truncate text-[9px] leading-tight flex-1 ${isFocused ? 'font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)]' : 'font-semibold'}`}>
                        {event.resource.form_title}
                    </span>
                </div>
            );
        }

        return (
            <div className="flex flex-col h-full justify-start p-1.5 focus:outline-none overflow-hidden" style={{ color: theme.text }}>
                <div className="font-semibold flex xl:items-center xl:flex-row flex-col items-start gap-1 xl:gap-1.5 text-[10px] sm:text-[11px] w-full">
                    <span
                        className="text-[9px] px-1 py-0.5 rounded-[4px] font-bold tracking-wider uppercase flex-shrink-0 leading-none"
                        style={{ backgroundColor: theme.badgeBg, color: theme.badgeText }}
                    >
                        AD
                    </span>
                    <span className="truncate w-full xl:w-auto leading-tight">{event.resource.form_title}</span>
                </div>
                <div className="text-[9px] opacity-70 truncate mt-1 hidden sm:block">
                    {event.resource.researcher_name}
                </div>
            </div>
        );
    }, [view, focusedEventIds]);

    const calendarComponents = useMemo(() => ({
        event: CustomEvent,
        month: { dateHeader: CustomDateHeader },
        week: { header: CustomWeekHeader },
        day: { header: CustomWeekHeader }
    }), [CustomEvent]);

    const handleSelectEvent = async (event: CalendarEvent) => {
        setSelectedEvent(event);
        setLoading(true); // show feedback while checking
        setExistingPublishPage(null);
        try {
            const { data } = await supabase
                .from('survey_pages')
                .select('*')
                .eq('submission_id', event.resource.form_submission_id)
                .single();
            if (data) {
                setExistingPublishPage(data);
            }
        } catch (err) {
            // Ignore error if not found or other issue
        } finally {
            setLoading(false);
            setIsPublishPageModalOpen(true);
        }
    };

    const filteredEvents = events;

    const displayEvents = view === Views.MONTH ? filteredEvents.map(event => {
        const spanEnd = new Date(event.end);

        // If the event ends exactly at 15:00 the next day, it spans 24 hours (1 visual day).
        // For Month view ONLY, we truncate the visual boundary to 23:59:59 of the previous day,
        // so it doesn't spill over and overlap with vertically stacking adjacent contiguous events.
        if (spanEnd.getHours() === 15 && spanEnd.getMinutes() === 0) {
            spanEnd.setDate(spanEnd.getDate() - 1);
            spanEnd.setHours(23, 59, 59, 999);
        }

        return { ...event, end: spanEnd };
    }) : filteredEvents;

    return (
        <div className="space-y-6">            {/* Unified Toolbar Container */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4">
                
                {/* Top Row: Navigation & View */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* Left: Month Selector & Navigation */}
                    <div className="flex items-center gap-3 bg-gray-50/80 p-1.5 rounded-lg border border-gray-200/50 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-white hover:shadow-sm"
                            onClick={() => {
                                const newDate = new Date(date);
                                if (view === Views.MONTH || view === Views.AGENDA) newDate.setMonth(newDate.getMonth() - 1);
                                else newDate.setDate(newDate.getDate() - 1);
                                setDate(newDate);
                            }}
                        >
                            <ChevronLeft className="h-4 w-4 text-gray-600" />
                        </Button>
                        <h2 className="text-sm font-semibold min-w-[140px] text-center text-gray-700 select-none">
                            {view === Views.MONTH || view === Views.AGENDA ? date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </h2>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-white hover:shadow-sm"
                            onClick={() => {
                                const newDate = new Date(date);
                                if (view === Views.MONTH || view === Views.AGENDA) newDate.setMonth(newDate.getMonth() + 1);
                                else newDate.setDate(newDate.getDate() + 1);
                                setDate(newDate);
                            }}
                        >
                            <ChevronRight className="h-4 w-4 text-gray-600" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 ml-2 text-xs font-medium text-slate-600 hover:text-blue-600 hover:bg-white border border-transparent hover:border-slate-200 hover:shadow-sm"
                            onClick={() => setDate(new Date())}
                        >
                            Today
                        </Button>
                    </div>

                    {/* Right: View Selector */}
                    <div className="flex bg-slate-200/50 p-1 rounded-lg shrink-0">
                        <button
                            onClick={() => setView(Views.MONTH)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === Views.MONTH ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Calendar
                        </button>
                        <button
                            onClick={() => setView(Views.AGENDA)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === Views.AGENDA ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            List
                        </button>
                    </div>
                </div>

                <div className="h-px bg-gray-100 w-full" />

                {/* Bottom Row: Stats & Action */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* Left: Stats Pills (Rounded Full to denote Info, not Button) */}
                    <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-white text-gray-600 border border-gray-200 select-none">
                            <Activity className="w-3.5 h-3.5 text-blue-600" />
                            Active Today
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[18px] text-center bg-blue-50 text-blue-700">{stats.activeToday}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-white text-gray-600 border border-gray-200 select-none">
                            <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
                            Upcoming This Week
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[18px] text-center bg-amber-50 text-amber-700">{stats.upcomingWeek}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-white text-gray-600 border border-gray-200 select-none">
                            <ListTodo className="w-3.5 h-3.5 text-slate-500" />
                            Total Scheduled
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[18px] text-center bg-slate-100 text-slate-700">{stats.totalScheduled}</span>
                        </div>
                    </div>

                    {/* Right: Refresh Action */}
                    <div className="flex items-center gap-2 shrink-0 ml-auto">
                        <Button
                            onClick={fetchEvents}
                            variant="outline"
                            size="sm"
                            disabled={loading}
                            className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200 shrink-0"
                            title="Refresh schedules"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Calendar & Filters */}
            <Card className="flex-1 flex flex-col shadow-sm border-slate-200 min-h-[750px] overflow-hidden bg-white">
                <CardContent className="p-0 flex-1 relative rounded-b-xl">
                    {/* Calendar Container */}
                    <div className="absolute inset-0 p-4 overflow-y-auto">
                        {loading && events.length === 0 ? (
                            <div className="flex flex-col gap-8 w-full h-full animate-pulse p-4 pt-8">
                                {Array(3).fill(0).map((_, i) => (
                                    <div key={`sched-skeleton-${i}`} className="flex flex-col md:flex-row gap-6 w-full">
                                        <div className="w-full md:w-36 shrink-0 md:sticky md:top-0 h-fit py-2">
                                            <div className="h-8 w-3/4 bg-slate-200 rounded-lg"></div>
                                        </div>
                                        <div className="flex-1 grid grid-cols-2 gap-4 lg:gap-8 border-l-2 border-slate-100 pl-4 lg:pl-8 py-2">
                                            <div className="flex flex-col gap-3">
                                                <div className="h-3 w-40 bg-rose-200 rounded-full mb-1"></div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="h-32 w-full bg-slate-100 rounded-xl border border-slate-200"></div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                <div className="h-3 w-40 bg-teal-200 rounded-full mb-1"></div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="h-32 w-full bg-slate-100 rounded-xl border border-slate-200"></div>
                                                    <div className="h-32 w-full bg-slate-100 rounded-xl border border-slate-200"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : view === Views.AGENDA ? (
                            <CustomAgendaListView events={filteredEvents} currentDate={date} onSelectEvent={handleSelectEvent} />
                        ) : (
                            <Calendar
                                toolbar={false}
                                localizer={localizer}
                                events={displayEvents}
                                startAccessor="start"
                                endAccessor="end"
                                style={{ height: '100%' }}
                                view={view}
                                onView={(v: View) => setView(v)}
                                date={date}
                                onNavigate={setDate}
                                scrollToTime={DEFAULT_SCROLL_TIME}
                                onSelectEvent={(e, syntheticEvent) => {
                                    const mouseEvent = syntheticEvent as unknown as React.MouseEvent;
                                    const isMulti = mouseEvent.ctrlKey || mouseEvent.metaKey;
                                    if (isMulti) {
                                        setFocusedEventIds(prev => 
                                            prev.includes(e.id) 
                                                ? prev.filter(id => id !== e.id)
                                                : [...prev, e.id]
                                        );
                                    } else {
                                        setFocusedEventIds(prev => 
                                            prev.length === 1 && prev[0] === e.id ? [] : [e.id]
                                        );
                                    }
                                }}
                                eventPropGetter={eventStyleGetter}
                                showMultiDayTimes
                                components={calendarComponents}
                                views={[Views.MONTH, Views.AGENDA]}
                                popup
                            />
                        )}
                    </div>
                </CardContent>
            </Card>

            {isPublishPageModalOpen && selectedEvent && (
                <PageBuilderModal
                    isOpen={isPublishPageModalOpen}
                    onClose={() => setIsPublishPageModalOpen(false)}
                    onSuccess={() => {
                        setIsPublishPageModalOpen(false);
                        // Refetch the page status so button updates to "Edit" next time
                        handleSelectEvent(selectedEvent);
                    }}
                    submissionId={selectedEvent.resource.form_submission_id}
                    submissionTitle={selectedEvent.resource.form_title}
                    submissionStartDate={selectedEvent.resource.start_date}
                    submissionEndDate={selectedEvent.resource.end_date}
                    submissionPrizePerWinner={selectedEvent.resource.prize_per_winner}
                    submissionWinnerCount={selectedEvent.resource.winner_count}
                    initialData={existingPublishPage || undefined}
                />
            )}
        </div>
    );
}
