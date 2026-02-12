import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import type { View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getScheduledAds, supabase } from '@/utils/supabase'; // Fixed import
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink } from 'lucide-react';

// Setup the localizer for react-big-calendar
const localizer = momentLocalizer(moment);

interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource: any; // Allow mixed types for now
}

export function SchedulingPage() {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<View>(Views.MONTH);
    const [date, setDate] = useState(new Date());

    const fetchEvents = async () => {
        setLoading(true);
        try {
            // 1. Fetch Scheduled Ads
            const ads = await getScheduledAds();
            const adEvents: CalendarEvent[] = ads.map((ad: any) => ({
                id: `ad-${ad.id}`,
                title: `Ad: ${ad.form_title}`,
                start: new Date(ad.start_date),
                end: new Date(ad.end_date),
                resource: {
                    ...ad,
                    type: 'ad'
                },
            }));

            // 2. Fetch Scheduled Survey Pages
            const { data: pages, error } = await supabase
                .from('survey_pages')
                .select(`
                    id,
                    title,
                    slug,
                    publish_start_date,
                    publish_end_date,
                    form_submissions (
                        full_name,
                        title
                    )
                `)
                .not('publish_start_date', 'is', null)
                .not('publish_end_date', 'is', null);

            if (error) throw error;

            const pageEvents: CalendarEvent[] = (pages || []).map((page: any) => ({
                id: `page-${page.id}`,
                title: `Survey: ${page.title}`,
                start: new Date(page.publish_start_date),
                end: new Date(page.publish_end_date),
                resource: {
                    id: page.id,
                    form_title: page.title,
                    researcher_name: page.form_submissions?.full_name || 'Unknown',
                    type: 'survey_page',
                    slug: page.slug
                }
            }));

            setEvents([...adEvents, ...pageEvents]);
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
        const isActive = new Date() >= event.start && new Date() <= event.end;
        const isSurvey = event.resource.type === 'survey_page';

        let backgroundColor = isActive ? '#dbeafe' : '#f3f4f6'; // blue-100 vs gray-100
        let color = isActive ? '#1e40af' : '#374151'; // blue-800 vs gray-700
        let borderColor = isActive ? '#93c5fd' : '#d1d5db';

        // Custom styling for Survey Pages
        if (isSurvey) {
            backgroundColor = isActive ? '#dcfce7' : '#f0fdf4'; // green-100 vs green-50
            color = isActive ? '#166534' : '#15803d'; // green-800 vs green-700
            borderColor = isActive ? '#86efac' : '#bbf7d0';
        }

        return {
            style: {
                backgroundColor,
                color,
                border: '1px solid',
                borderColor,
                borderRadius: '4px',
                fontSize: '0.85rem',
                fontWeight: '500',
            }
        };
    };

    const CustomEvent = ({ event }: { event: CalendarEvent }) => {
        return (
            <div className="flex flex-col h-full justify-center px-1" title={event.title}>
                <div className="font-semibold truncate flex items-center gap-1">
                    {event.resource.type === 'survey_page' && <span className="text-[9px] bg-white/50 px-1 rounded border border-current opacity-75">SURVEY</span>}
                    {event.resource.type === 'ad' && <span className="text-[9px] bg-white/50 px-1 rounded border border-current opacity-75">AD</span>}
                    {event.resource.form_title}
                </div>
                <div className="text-[10px] opacity-75 truncate">{event.resource.researcher_name}</div>
            </div>
        );
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto w-full space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Ad Scheduling</h1>
                    <p className="text-gray-500 text-sm">View and manage scheduled survey ads.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={fetchEvents} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open('https://calendar.google.com', '_blank')}
                    >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Google Calendar
                    </Button>
                </div>
            </div>

            <Card className="flex-1 flex flex-col shadow-sm border-gray-200 min-h-[600px]">
                <CardContent className="p-0 flex-1 relative">
                    {/* Calendar Container */}
                    <div className="absolute inset-0 p-4">
                        <Calendar
                            localizer={localizer}
                            events={events}
                            startAccessor="start"
                            endAccessor="end"
                            style={{ height: '100%' }}
                            view={view}
                            onView={(v: View) => setView(v)}
                            date={date}
                            onNavigate={setDate}
                            eventPropGetter={eventStyleGetter}
                            components={{
                                event: CustomEvent
                            }}
                            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                            popup
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
