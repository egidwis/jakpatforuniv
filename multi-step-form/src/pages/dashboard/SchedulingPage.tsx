import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import type { View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './SchedulingPage.css'; // Add custom CSS overrides
import { getScheduledAds, supabase } from '@/utils/supabase'; // Added supabase
import { PageBuilderModal } from '@/components/PageBuilder/PageBuilderModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { RefreshCw, ExternalLink, Activity, CalendarClock, ListTodo, ChevronLeft, ChevronRight } from 'lucide-react';

// Setup the localizer for react-big-calendar
const localizer = momentLocalizer(moment);

// Color Palettes for Events
const COLOR_PALETTES = [
    { bg: '#eff6ff', border: '#bfdbfe', leftBorder: '#3b82f6', text: '#1e40af', badgeBg: '#dbeafe', badgeText: '#1d4ed8' }, // blue
    { bg: '#f0fdf4', border: '#bbf7d0', leftBorder: '#22c55e', text: '#166534', badgeBg: '#dcfce7', badgeText: '#15803d' }, // green
    { bg: '#fdf2f8', border: '#fbcfe8', leftBorder: '#ec4899', text: '#9d174d', badgeBg: '#fce7f3', badgeText: '#be185d' }, // pink
    { bg: '#fffbeb', border: '#fde68a', leftBorder: '#f59e0b', text: '#92400e', badgeBg: '#fef3c7', badgeText: '#b45309' }, // amber
    { bg: '#faf5ff', border: '#e9d5ff', leftBorder: '#a855f7', text: '#6b21a8', badgeBg: '#f3e8ff', badgeText: '#7e22ce' }, // purple
    { bg: '#f0fdfa', border: '#ccfbf1', leftBorder: '#14b8a6', text: '#115e59', badgeBg: '#ccfbf1', badgeText: '#0f766e' }, // teal
    { bg: '#fff5f5', border: '#fecaca', leftBorder: '#ef4444', text: '#991b1b', badgeBg: '#fee2e2', badgeText: '#b91c1c' }, // red
];

interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource: any; // Allow mixed types for now
}

export // Extracted so the reference stays stable across renders
    const DEFAULT_SCROLL_TIME = new Date(1970, 1, 1, 12, 0, 0);

export function SchedulingPage() {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<View>(Views.MONTH);
    const [date, setDate] = useState(new Date());

    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);

    // Publish Page State
    const [isPublishPageModalOpen, setIsPublishPageModalOpen] = useState(false);
    const [existingPublishPage, setExistingPublishPage] = useState<any>(null);
    const [isLoadingPublishPage, setIsLoadingPublishPage] = useState(false);

    // Stats & Filters State
    const [stats, setStats] = useState({
        activeToday: 0,
        upcomingWeek: 0,
        totalScheduled: 0
    });


    const fetchEvents = async () => {
        setLoading(true);
        try {
            // 1. Fetch Scheduled Ads
            const ads = await getScheduledAds();
            const adEvents: CalendarEvent[] = ads.map((ad: any, index: number) => {
                const startDate = new Date(ad.start_date);
                startDate.setHours(15, 0, 0, 0);

                const endDate = new Date(ad.end_date);
                endDate.setHours(15, 0, 0, 0);

                return {
                    id: `ad-${ad.id}`,
                    title: `Ad: ${ad.form_title}`,
                    start: startDate,
                    end: endDate,
                    resource: {
                        ...ad,
                        type: 'ad',
                        colorTheme: COLOR_PALETTES[index % COLOR_PALETTES.length]
                    },
                };
            });

            const allEvents = [...adEvents];

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

    const eventStyleGetter = (event: CalendarEvent) => {
        const theme = event.resource.colorTheme || COLOR_PALETTES[0];

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
            }
        };
    };

    const CustomEvent = ({ event }: { event: CalendarEvent }) => {
        const theme = event.resource.colorTheme || COLOR_PALETTES[0];

        if (view === Views.MONTH) {
            const startTimeStr = new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return (
                <div className="flex items-center px-1.5 py-0.5 w-full h-full focus:outline-none overflow-hidden" style={{ color: theme.text }}>
                    <span
                        className="text-[8px] px-1 rounded-[3px] font-bold tracking-wider uppercase flex-shrink-0 leading-none mr-1.5 py-[2px]"
                        style={{ backgroundColor: theme.badgeBg, color: theme.badgeText }}
                    >
                        AD
                    </span>
                    <span className="text-[9px] font-bold mr-1.5 opacity-70 flex-shrink-0 tracking-wide">
                        {startTimeStr}
                    </span>
                    <span className="truncate text-[10px] font-semibold leading-tight flex-1">
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
    };

    const CustomDateHeader = ({ label, date }: { label: string, date: Date }) => {
        const isToday = moment(date).isSame(moment(), 'day');
        return (
            <div className="flex justify-end p-1.5">
                <div className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold transition-colors ${isToday ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' : 'text-slate-700 hover:bg-slate-100'}`}>
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

    const handleSelectEvent = async (event: CalendarEvent) => {
        setSelectedEvent(event);
        setIsEventDialogOpen(true);
        
        // Fetch existing publish page
        setIsLoadingPublishPage(true);
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
            setIsLoadingPublishPage(false);
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
        <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
                <div className="flex flex-row items-center justify-between gap-4 w-full">
                    {/* Left: Stats */}
                    <div className="flex items-center gap-4 flex-wrap">
                        {/* Active Today */}
                        <div className="flex items-center gap-3 bg-blue-50 pl-3 pr-4 py-2 rounded-xl border border-blue-100 hover:bg-blue-100/50 transition-all select-none">
                            <div className="h-9 w-9 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                                <Activity className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wide leading-none mb-1">Active Today</span>
                                <span className="text-lg font-bold text-blue-700 leading-none">{stats.activeToday}</span>
                            </div>
                        </div>

                        {/* Upcoming This Week */}
                        <div className="flex items-center gap-3 bg-amber-50 pl-3 pr-4 py-2 rounded-xl border border-amber-100 hover:bg-amber-100/50 transition-all select-none">
                            <div className="h-9 w-9 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                                <CalendarClock className="w-5 h-5 text-amber-600" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-amber-600 tracking-wide leading-none mb-1">Upcoming This Week</span>
                                <span className="text-lg font-bold text-amber-700 leading-none">{stats.upcomingWeek}</span>
                            </div>
                        </div>

                        {/* Total Scheduled */}
                        <div className="flex items-center gap-3 bg-gray-50 pl-3 pr-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-100/50 transition-all select-none">
                            <div className="h-9 w-9 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                                <ListTodo className="w-5 h-5 text-gray-600" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-gray-600 tracking-wide leading-none mb-1">Total Scheduled</span>
                                <span className="text-lg font-bold text-gray-700 leading-none">{stats.totalScheduled}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={fetchEvents} disabled={loading} className="h-9 px-3 bg-white hover:bg-gray-50 text-gray-700 border-gray-200">
                            <RefreshCw className={`w-4 h-4 mr-2 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>
            </div>

            {/* Calendar & Filters */}
            <Card className="flex-1 flex flex-col shadow-sm border-slate-200 min-h-[750px] overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-gray-50 hover:shadow-sm"
                            onClick={() => {
                                const newDate = new Date(date);
                                if (view === Views.MONTH) newDate.setMonth(newDate.getMonth() - 1);
                                else if (view === Views.WEEK) newDate.setDate(newDate.getDate() - 7);
                                else newDate.setDate(newDate.getDate() - 1);
                                setDate(newDate);
                            }}
                        >
                            <ChevronLeft className="h-4 w-4 text-gray-600" />
                        </Button>
                        <h2 className="text-sm font-semibold min-w-[140px] text-center text-gray-700 select-none">
                            {view === Views.MONTH ? date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </h2>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-gray-50 hover:shadow-sm"
                            onClick={() => {
                                const newDate = new Date(date);
                                if (view === Views.MONTH) newDate.setMonth(newDate.getMonth() + 1);
                                else if (view === Views.WEEK) newDate.setDate(newDate.getDate() + 7);
                                else newDate.setDate(newDate.getDate() + 1);
                                setDate(newDate);
                            }}
                        >
                            <ChevronRight className="h-4 w-4 text-gray-600" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 ml-2 text-xs font-medium text-slate-600 hover:text-blue-600 border border-slate-200"
                            onClick={() => setDate(new Date())}
                        >
                            Today
                        </Button>
                    </div>

                    <div className="flex bg-slate-200/50 p-1 rounded-lg">
                        <button
                            onClick={() => setView(Views.MONTH)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === Views.MONTH ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Month
                        </button>
                        <button
                            onClick={() => setView(Views.WEEK)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === Views.WEEK ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Week
                        </button>
                        <button
                            onClick={() => setView(Views.DAY)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === Views.DAY ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Day
                        </button>
                    </div>
                </div>

                <CardContent className="p-0 flex-1 relative">
                    {/* Calendar Container */}
                    <div className="absolute inset-0 p-4">
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
                            onSelectEvent={handleSelectEvent}
                            eventPropGetter={eventStyleGetter}
                            showMultiDayTimes
                            components={{
                                event: CustomEvent,
                                month: {
                                    dateHeader: CustomDateHeader
                                },
                                week: {
                                    header: CustomWeekHeader
                                },
                                day: {
                                    header: CustomWeekHeader
                                }
                            }}
                            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                            popup
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Event Details Dialog */}
            <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    {selectedEvent && (
                        <>
                            <DialogHeader>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ring-blue-200 uppercase tracking-widest">
                                        Ad Campaign
                                    </div>
                                    {new Date() >= selectedEvent.start && new Date() <= selectedEvent.end ? (
                                        <div className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-widest">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                            Active Now
                                        </div>
                                    ) : new Date() < selectedEvent.start ? (
                                        <div className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">
                                            Upcoming
                                        </div>
                                    ) : (
                                        <div className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">
                                            Completed
                                        </div>
                                    )}
                                </div>
                                <DialogTitle className="text-xl leading-tight">
                                    {selectedEvent.resource.form_title}
                                </DialogTitle>
                                <DialogDescription>
                                    Scheduled by {selectedEvent.resource.researcher_name}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Start Date</span>
                                        <p className="text-sm font-medium text-slate-900">
                                            {(() => {
                                                const d = new Date(selectedEvent.resource.start_date);
                                                d.setHours(15, 0, 0, 0);
                                                return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
                                            })()}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            15.00 WIB
                                        </p>
                                    </div>
                                    <div className="space-y-1 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">End Date</span>
                                        <p className="text-sm font-medium text-slate-900">
                                            {(() => {
                                                const d = new Date(selectedEvent.resource.end_date);
                                                d.setHours(15, 0, 0, 0);
                                                return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
                                            })()}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            15.00 WIB
                                        </p>
                                    </div>
                                </div>

                                {selectedEvent.resource.ad_link && (
                                    <div className="space-y-1 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                                        <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Ad Link</span>
                                        <a
                                            href={selectedEvent.resource.ad_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline flex items-center gap-1.5 break-all"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                                            {selectedEvent.resource.ad_link}
                                        </a>
                                    </div>
                                )}
                            </div>

                            <DialogFooter>
                                <Button
                                    variant="default"
                                    onClick={() => setIsPublishPageModalOpen(true)}
                                    disabled={isLoadingPublishPage}
                                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                >
                                    {isLoadingPublishPage ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                            Checking...
                                        </>
                                    ) : existingPublishPage ? (
                                        'Edit Publish Page'
                                    ) : (
                                        'Create Publish Page'
                                    )}
                                </Button>
                                <Button variant="outline" onClick={() => setIsEventDialogOpen(false)}>
                                    Close
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

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
