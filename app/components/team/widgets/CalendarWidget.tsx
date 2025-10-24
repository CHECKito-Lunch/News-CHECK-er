/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Clock, MapPin, Plus } from 'lucide-react';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { de } from 'date-fns/locale';
import Link from 'next/link';

interface CalendarWidgetProps {
  teamId: string;
  config: any;
  widgetId: string;
}

interface Event {
  id: number;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  location?: string;
  all_day: boolean;
  color?: string;
}

export function CalendarWidget({ teamId, config }: CalendarWidgetProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const daysAhead = (config?.daysAhead as number) || 14;

  const fetchEvents = useCallback(async () => {
    try {
      const startDate = new Date().toISOString();
      const endDate = addDays(new Date(), daysAhead).toISOString();

      const res = await fetch(
        `/api/events?start=${startDate}&end=${endDate}&team_id=${teamId}`
      );
      const data = await res.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error('Fehler beim Laden der Events:', error);
    } finally {
      setLoading(false);
    }
  }, [teamId, daysAhead]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Heute';
    if (isTomorrow(date)) return 'Morgen';
    return format(date, 'EEE, dd. MMM', { locale: de });
  };

  const groupEventsByDate = (events: Event[]) => {
    const grouped: Record<string, Event[]> = {};
    events.forEach((event) => {
      const dateKey = format(new Date(event.start_date), 'yyyy-MM-dd');
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(event);
    });
    return grouped;
  };

  const groupedEvents = groupEventsByDate(events);

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Kommende Events
        </CardTitle>
        <Button size="sm" asChild>
          <Link href={`/events`}>
            <Plus className="h-4 w-4 mr-2" />
            Event
          </Link>
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i}>
                <div className="h-4 w-24 bg-gray-200 rounded mb-2 animate-pulse" />
                <div className="h-16 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8">
            <CalendarIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">Keine anstehenden Events</p>
            <Button size="sm" asChild>
              <Link href={`/events`}>Events anzeigen</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedEvents)
              .slice(0, 5)
              .map(([dateKey, dayEvents]) => (
                <div key={dateKey}>
                  <div className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                    {getDateLabel(dayEvents[0].start_date)}
                  </div>
                  <div className="space-y-2">
                    {dayEvents.map((event) => (
                      <Link
                        key={event.id}
                        href={`/events/${event.id}`}
                        className="block p-3 rounded-lg border bg-white hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {/* Color indicator */}
                          <div
                            className="w-1 h-full rounded-full flex-shrink-0 mt-1"
                            style={{
                              backgroundColor: event.color || '#3b82f6',
                              minHeight: '2rem',
                            }}
                          />

                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">
                              {event.title}
                            </h4>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                              {/* Time */}
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {event.all_day
                                    ? 'Ganztägig'
                                    : format(new Date(event.start_date), 'HH:mm', {
                                        locale: de,
                                      })}
                                </span>
                              </div>

                              {/* Location */}
                              {event.location && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate">{event.location}</span>
                                </div>
                              )}
                            </div>

                            {/* Description preview */}
                            {event.description && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                                {event.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

            {events.length > 5 && (
              <Button variant="outline" className="w-full mt-4" asChild>
                <Link href={`/events`}>
                  Alle Events anzeigen ({events.length})
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </>
  );
}
