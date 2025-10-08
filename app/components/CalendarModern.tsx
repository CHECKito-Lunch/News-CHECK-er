'use client';

import { useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import iCalendarPlugin from '@fullcalendar/icalendar';
import interactionPlugin from '@fullcalendar/interaction';

type FCSource =
  | { id?: string; title?: string; start?: string; end?: string; allDay?: boolean; extendedProps?: any; backgroundColor?: string; textColor?: string }
  | { url: string; format: 'ics' };

export type CalendarModernProps = {
  /** Mische eigene Events und ICS-Quellen frei */
  events: FCSource[];
  /** Optional: Startansicht */
  initialView?: 'listUpcoming' | 'listMonth' | 'dayGridMonth';
  /** Optional: Höhe */
  height?: number | 'auto';
  /** Optional: Klick-Callbacks */
  onSelectRange?: (startISO: string, endISO: string) => void; // end = exklusiv (von FullCalendar)
  onEventClick?: (payload: { id?: string | number; extendedProps?: any }) => void;
  /** Optional: zusätzliche Klassen */
  className?: string;
};

function fmtDate(d: Date) {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function CalendarModern({
  events,
  initialView = 'listUpcoming',
  height = 'auto',
  onSelectRange,
  onEventClick,
  className,
}: CalendarModernProps) {
  const calRef = useRef<FullCalendar | null>(null);
  const [title, setTitle] = useState('');
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const api = () => calRef.current?.getApi();

  function renderEventContent(arg: any) {
    const { event: ev, view } = arg;
    const isAllDay = ev.allDay;
    const start: Date | null = ev.start ? new Date(ev.start) : null;
    const endExclusive: Date | null = ev.end ? new Date(ev.end) : null;
    const endInclusive = endExclusive && isAllDay ? new Date(endExclusive.getTime() - 86400000) : endExclusive;

    let timeText = arg.timeText || '';
    if (isAllDay && start) {
      timeText = endInclusive && start.toDateString() !== endInclusive.toDateString()
        ? `${fmtDate(start)} – ${fmtDate(endInclusive)}`
        : 'ganztägig';
    }

    let icon = (ev.extendedProps && (ev.extendedProps as any).icon) || '';
    if (!icon) {
      const url: string | undefined = (ev as any).source?.url;
      if (url?.includes('schulferien')) icon = '🏖️';
      else if (url?.includes('feiertage-api')) icon = '🎌';
      else icon = '📅';
    }

    // In der Monatskachel zusätzlich kleinen Fortschrittsbalken anzeigen:
    let progressPct = 0;
    if (view.type === 'dayGridMonth' && isAllDay && start && endInclusive && start <= todayStart && todayStart <= endInclusive) {
      const one = 86400000;
      const total = Math.max(1, Math.round((endInclusive.getTime() - start.getTime()) / one) + 1);
      const elapsed = Math.min(total, Math.max(0, Math.round((todayStart.getTime() - start.getTime()) / one) + 1));
      progressPct = Math.round((elapsed / total) * 100);
    }

    if (view.type === 'dayGridMonth') {
      return (
        <div className="w-full px-1 py-0.5">
          <div className="h-1.5 w-full rounded-full bg-blue-500/15 overflow-hidden border border-blue-500/20">
            <div className="h-full bg-blue-600" style={{ width: `${progressPct || 100}%` }} />
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] font-medium leading-none">
            <span className="leading-none">{icon}</span>
            <span className="truncate">{ev.title}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full">
        <div className="flex items-center gap-2 px-2 py-1 text-sm">
          {timeText && <span className="opacity-70 whitespace-nowrap">{timeText}</span>}
          <span className="opacity-40">·</span>
          <span className="text-base leading-none">{icon}</span>
          <span className="font-medium truncate">{ev.title}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Kopfzeile/Controls (nur Beispiel; bei Bedarf ausblendbar machen) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
          <button onClick={() => api()?.prev()} className="px-3 py-1.5 text-sm bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20">←</button>
          <button onClick={() => api()?.today()} className="px-3 py-1.5 text-sm bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 border-l border-gray-200 dark:border-gray-800">heute</button>
          <button onClick={() => api()?.next()} className="px-3 py-1.5 text-sm bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 border-l border-gray-200 dark:border-gray-800">→</button>
        </div>
        <div className="text-base font-semibold mx-2">{title}</div>
        <div className="ml-auto inline-flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
          <button onClick={() => api()?.changeView('listUpcoming')} className="px-3 py-1.5 text-sm bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20">Liste</button>
          <button onClick={() => api()?.changeView('dayGridMonth')} className="px-3 py-1.5 text-sm bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 border-l border-gray-200 dark:border-gray-800">Monat</button>
        </div>
      </div>

      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, interactionPlugin, iCalendarPlugin, listPlugin]}
        locale="de"
        headerToolbar={false}
        height={height}
        firstDay={1}
        dayMaxEvents
        stickyHeaderDates
        initialDate={todayStart}
        validRange={{ start: todayStart }}
        initialView={initialView}
        events={events as any}
        eventDisplay="block"
        displayEventTime={false}
        datesSet={(arg) => setTitle(arg.view.title)}
        eventClassNames={() => 'rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-900 dark:text-blue-200'}
        eventContent={renderEventContent}
        buttonText={{ today: 'Heute', month: 'Monat', list: 'Liste', week: 'Woche' }}

        selectable={!!onSelectRange}
        selectMirror={!!onSelectRange}
        select={(info) => onSelectRange?.(info.startStr, info.endStr)} // end ist exklusiv
        eventClick={(info) => {
          onEventClick?.({
            id: (info.event.extendedProps as any)?.terminId || info.event.id,
            extendedProps: info.event.extendedProps,
          });
        }}

        views={{
          // „listUpcoming“ = 60 Tage Liste (wie bei dir)
          listUpcoming: { type: 'list', duration: { days: 60 }, buttonText: 'Liste' },
          dayGridMonth: { type: 'dayGridMonth' },
          listMonth: { type: 'listMonth' },
        }}
        noEventsText="Keine Termine im ausgewählten Zeitraum."
      />
    </div>
  );
}
