'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import iCalendarPlugin from '@fullcalendar/icalendar';
import listPlugin from '@fullcalendar/list';

type Badge = { id: number; name: string; color: string; kind: string | null };
type Vendor = { id: number; name: string };
type Item = {
  id: number; slug: string | null; title: string;
  summary: string | null; content: string | null;
  vendor: Vendor | null;
  post_badges: { badge: Badge }[];
  created_at?: string | null;
  published_at?: string | null;
  images?: { url: string; caption?: string | null; sort_order?: number | null }[]; 
};

type KPI = {
  id: number; key: string; label: string; value: string; unit: string | null;
  trend: 'up' | 'down' | 'flat' | null; color: string | null;
};

type Tool = { id: number; title: string; icon: string; href: string };

// Termin jetzt mit start/end und optional Icon
export type Termin = {
  id: number;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  icon?: string | null;
  // Legacy
  date?: string; start?: string; end?: string | null;
};

type EventFeedRow = {
  id: number; slug: string; title: string;
  summary: string | null;
  starts_at: string; location: string | null;
  hero_image_url: string | null;
};

const card =
  'rounded-2xl shadow-sm bg-white/80 backdrop-blur border border-gray-200 ' +
  'dark:bg-gray-900/70 dark:border-gray-800';

const header =
  'flex items-center justify-between gap-3 mb-3 px-2';

const isAgentNews = (it: Item) =>
  (it.post_badges || []).some(pb => {
    const n = (pb?.badge?.name || '').toLowerCase();
    return n.includes('agent') || n.includes('⚡');
  });

const uniqById = <T extends { id: number }>(arr: T[]) => {
  const seen = new Set<number>();
  return arr.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
};

export default function HomePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [meta, setMeta] = useState<{ badges: Badge[] }>({ badges: [] });

  const [dbEvents, setDbEvents] = useState<any[]>([]);
  const [feedEvents, setFeedEvents] = useState<EventFeedRow[]>([]);
  const [tourNews, setTourNews] = useState<Item[]>([]);
  const [tourLoading, setTourLoading] = useState<boolean>(true);
  const [tourErr, setTourErr] = useState<string>('');
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingSide, setLoadingSide] = useState(true);

  const startBadgeId = useMemo(() => {
    const list: Badge[] = Array.isArray(meta?.badges) ? meta.badges : [];
    const byKind = list.find(b => (b?.kind ?? '').toLowerCase() === 'start');
    if (byKind) return byKind.id;
    const byName = list.find(b => (b?.name ?? '').toLowerCase().includes('start'));
    return byName?.id ?? null;
  }, [meta]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/meta', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        const badges =
          Array.isArray(j) ? j
          : Array.isArray(j?.badges) ? j.badges
          : Array.isArray(j?.data?.badges) ? j.data.badges
          : [];
        setMeta({ badges });
      } catch {
        setMeta({ badges: [] });
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingSide(true);
      setLoadingFeed(true);
      try {
        const [kpiRes, toolRes, termRes, evCalRes, evFeedRes] = await Promise.all([
          fetch('/api/kpis'),
          fetch('/api/tools'),
          fetch('/api/termine'),
          fetch('/api/events?calendar=1'),
          fetch('/api/events?feed=1'),
        ]);
        const [kpiJ, toolJ, termJ, evCalJ, evFeedJ] = await Promise.all([
          kpiRes.json().catch(() => ({})),
          toolRes.json().catch(() => ({})),
          termRes.json().catch(() => ({})),
          evCalRes.json().catch(() => ({})),
          evFeedRes.json().catch(() => ({})),
        ]);

        setKpis(kpiJ.data ?? []);
        setTools(toolJ.data ?? []);
        setTermine(termJ.data ?? []);
        setDbEvents(Array.isArray(evCalJ.events) ? evCalJ.events : []);
        setFeedEvents(Array.isArray(evFeedJ.items) ? evFeedJ.items : []);
      } finally {
        setLoadingSide(false);
      }

      try {
        const fetchStartNews = async (): Promise<Item[]> => {
          if (!startBadgeId) return [];
          const p = new URLSearchParams({ badge: String(startBadgeId), page: '1', pageSize: '50' });
          const r = await fetch(`/api/news?${p}`);
          const j = await r.json().catch(() => ({}));
          return Array.isArray(j?.data) ? (j.data as Item[]) : [];
        };

        const fetchRecentNews = async (): Promise<Item[]> => {
          let r = await fetch('/api/news?feed=1&page=1&pageSize=30');
          let j = await r.json().catch(() => ({}));
          if (r.ok && Array.isArray(j?.data)) return j.data as Item[];
          r = await fetch('/api/news?page=1&pageSize=30');
          j = await r.json().catch(() => ({}));
          return Array.isArray(j?.data) ? (j.data as Item[]) : [];
        };

        const [startNews, recentNews] = await Promise.all([fetchStartNews(), fetchRecentNews()]);
        const merged = uniqById([...startNews, ...recentNews].filter(n => !isAgentNews(n)));

        merged.sort((a, b) => {
          const da = new Date(a.published_at || a.created_at || 0).getTime();
          const db = new Date(b.published_at || b.created_at || 0).getTime();
          return db - da;
        });

        setItems(merged);
      } catch {
        setItems([]);
      } finally {
        setLoadingFeed(false);
      }
    })();
  }, [startBadgeId]);

  useEffect(() => {
    let cancelled = false;
    async function loadTourNews() {
      setTourLoading(true); setTourErr('');
      try {
        let r = await fetch('/api/news/agent?limit=20');
        let j = await r.json().catch(() => ({}));
        if (r.ok && Array.isArray(j.data) && j.data.length) { if (!cancelled) setTourNews(j.data); return; }
        r = await fetch('/api/news?agent=1&page=1&pageSize=20');
        j = await r.json().catch(() => ({}));
        if (r.ok && Array.isArray(j.data) && j.data.length) { if (!cancelled) setTourNews(j.data); return; }
        const tryBadge = async (name: string) => {
          const rr = await fetch(`/api/news?badgeName=${encodeURIComponent(name)}&page=1&pageSize=20`);
          const jj = await rr.json().catch(() => ({}));
          return rr.ok && Array.isArray(jj.data) ? (jj.data as Item[]) : [];
        };
        let data = await tryBadge('news-agent');
        if (!data.length) data = await tryBadge('tourismus');
        if (data.length) { if (!cancelled) setTourNews(data); return; }
        const rr = await fetch(`/api/news?categoryName=${encodeURIComponent('Touristische News')}&page=1&pageSize=20`);
        const jj = await rr.json().catch(() => ({}));
        if (rr.ok && Array.isArray(jj.data)) { if (!cancelled) setTourNews(jj.data); return; }
        if (!cancelled) { setTourNews([]); setTourErr('Keine Agent-News gefunden.'); }
      } catch (e: unknown) {
        if (!cancelled) setTourErr(e instanceof Error ? e.message : 'Fehler beim Laden der Agent-News.');
      } finally {
        if (!cancelled) setTourLoading(false);
      }
    }
    loadTourNews();
    return () => { cancelled = true; };
  }, []);

  // Kalender-Events ----------------------------------------------------
  const events = useMemo(() => ([
    ...termine.map(t => ({
      id: String(t.id),
      title: t.title,
      start: t.starts_at || t.start || t.date,
      end: (t.ends_at || t.end) || undefined,
      allDay: true,
      backgroundColor: '#2563eb',
      textColor: '#fff',
      extendedProps: { icon: t.icon || '📌' },
    })),
    ...dbEvents,
    { url: 'https://feiertage-api.de/api/?bundesland=SN&out=ical', format: 'ics' as const },
    { url: 'https://www.schulferien.org/iCal/Ferien/ical/Sachsen.ics', format: 'ics' as const },
  ]), [termine, dbEvents]);

  const unifiedFeed = useMemo(() => {
    const news = items.map(it => ({
      kind: 'news' as const,
      key: `n-${it.id}`,
      date: new Date((it.published_at || it.created_at || 0) as any).getTime() || 0,
      data: it,
    }));
    const evs = feedEvents.map(ev => ({
      kind: 'event' as const,
      key: `e-${ev.id}`,
      date: new Date(ev.starts_at).getTime(),
      data: ev,
    }));
    return [...news, ...evs].sort((a, b) => b.date - a.date);
  }, [items, feedEvents]);

  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-8">
      {/* ... oben unverändert ... */}
      <section className={card + ' p-4'}>
        <div className={header}><h2 className="text-lg font-semibold">Termine, Ferien & Feiertage</h2></div>
        <CalendarModern events={events} />
      </section>
      {/* ... restlicher Code unverändert ... */}
    </div>
  );
}

// Kalender mit Custom Renderer ----------------------------------------
function CalendarModern({ events }: { events: any[] }) {
  const calRef = useRef<FullCalendar | null>(null);
  const [title, setTitle] = useState('');
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const api = () => calRef.current?.getApi();

  function renderEventContent(arg: any) {
    const ev = arg.event;
    const isAllDay = ev.allDay;
    const start = ev.start ? new Date(ev.start) : null;
    const endEx = ev.end ? new Date(ev.end) : null;
    const endIn = endEx && isAllDay ? new Date(endEx.getTime() - 86400000) : endEx;

    let timeText = arg.timeText || '';
    if (isAllDay && start) {
      const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
      timeText = endIn && start.toDateString() !== endIn.toDateString()
        ? `${fmt(start)} – ${fmt(endIn)}`
        : 'ganztägig';
    }

    let icon = (ev.extendedProps && (ev.extendedProps as any).icon) || '';
    if (!icon) {
      const url: string | undefined = (ev as any).source?.url;
      if (url?.includes('schulferien')) icon = '🏖️';
      else if (url?.includes('feiertage-api')) icon = '🎌';
      else icon = '📅';
    }

    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm">
        {timeText && <span className="opacity-70 whitespace-nowrap">{timeText}</span>}
        <span className="opacity-40">·</span>
        <span className="text-base leading-none">{icon}</span>
        <span className="font-medium truncate">{ev.title}</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* Steuerung */}
        <div className="inline-flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
          <button onClick={() => api()?.prev()} className="px-3 py-1.5 text-sm">←</button>
          <button onClick={() => api()?.today()} className="px-3 py-1.5 text-sm border-l">heute</button>
          <button onClick={() => api()?.next()} className="px-3 py-1.5 text-sm border-l">→</button>
        </div>
        <div className="text-base font-semibold mx-2">{title}</div>
        <div className="ml-auto inline-flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
          <button onClick={() => api()?.changeView('listUpcoming')} className="px-3 py-1.5 text-sm">Liste</button>
          <button onClick={() => api()?.changeView('dayGridMonth')} className="px-3 py-1.5 text-sm border-l">Monat</button>
        </div>
      </div>

      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, interactionPlugin, iCalendarPlugin, listPlugin]}
        locale="de"
        initialView="listUpcoming"
        headerToolbar={false}
        height="auto"
        firstDay={1}
        dayMaxEvents
        stickyHeaderDates
        initialDate={todayStart}
        validRange={{ start: todayStart }}
        events={events}
        datesSet={(arg) => setTitle(arg.view.title)}
        eventClassNames={() => 'rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-900 dark:text-blue-200'}
        eventContent={renderEventContent}
        buttonText={{ today: 'Heute', month: 'Monat', list: 'Liste', week: 'Woche' }}
        noEventsText="Keine Termine im ausgewählten Zeitraum."
        views={{ listUpcoming: { type: 'list', duration: { days: 60 } }, dayGridMonth: { type: 'dayGridMonth' } }}
      />
    </>
  );
}
