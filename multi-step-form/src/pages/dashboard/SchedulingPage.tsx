import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, Views, type View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getScheduledAds, type ScheduledAd } from '@/utils/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

// Setup the localizer for react-big-calendar
const localizer = momentLocalizer(moment);

interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource: ScheduledAd;
}

export function SchedulingPage() {
    // const { user } = useAuth();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<View>(Views.MONTH);
    const [date, setDate] = useState(new Date());

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const ads = await getScheduledAds();
            const formattedEvents: CalendarEvent[] = ads.map((ad: any) => ({
                id: ad.id,
                title: `Ads: ${ad.form_title}`,
                start: new Date(ad.start_date),
                end: new Date(ad.end_date),
                resource: ad,
            }));
            setEvents(formattedEvents);
        } catch (error) {
            console.error('Error fetching scheduled ads:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const eventStyleGetter = (event: CalendarEvent) => {
        const isActive = new Date() >= event.start && new Date() <= event.end;
        return {
            style: {
                backgroundColor: isActive ? '#dbeafe' : '#f3f4f6', // blue-100 vs gray-100
                color: isActive ? '#1e40af' : '#374151', // blue-800 vs gray-700
                border: '1px solid',
                borderColor: isActive ? '#93c5fd' : '#d1d5db',
                borderRadius: '4px',
                fontSize: '0.85rem',
                fontWeight: '500',
            }
        };
    };

    const CustomEvent = ({ event }: { event: CalendarEvent }) => {
        return (
            <div className="flex flex-col h-full justify-center px-1" title={event.title}>
                <div className="font-semibold truncate">{event.resource.form_title}</div>
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
                            onView={(v) => setView(v)}
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
