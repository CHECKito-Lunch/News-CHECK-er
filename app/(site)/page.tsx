'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import iCalendarPlugin from '@fullcalendar/icalendar';
import listPlugin from '@fullcalendar/list';

// ❌ CSS-Imports entfernt – alles kommt via CDN über layout.tsx

type Badge = { id: number; name: string; color: string; kind: string | null };
type Vendor = { id: number; name: string };
type Item = {
  id: number; slug: string | null; title: string;
  summary: string | null; content: string | null;
  vendor: Vendor | null;
  post_badges: { badge: Badge }[];
};

type KPI = {
  id: number; key: string; label: string; value: string; unit: string | null;
  trend: 'up' | 'down' | 'flat' | null; color: string | null;
};

type Tool = { id: number; title: string; icon: string; href: string };
type Termin = { id: number; date: string; title: string };

const card = 'p-4 rounded-2xl shadow-sm bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800';

export default function HomePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [meta, setMeta] = useState<{ badges: Badge[] }>({ badges: [] });

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  const startBadgeId = useMemo(() => {
    const byKind = meta.badges.find(b => (b.kind ?? '').toLowerCase() === 'start');
    if (byKind) return byKind.id;
    const byName = meta.badges.find(b => b.name.toLowerCase().includes('start'));
    return byName?.id;
  }, [meta.badges]);

  useEffect(() => {
    fetch('/api/meta').then(r => r.json()).then(setMeta);
  }, []);

  useEffect(() => {
    (async () => {
      fetch('/api/kpis').then(r => r.json()).then(j => setKpis(j.data ?? []));
      fetch('/api/tools').then(r => r.json()).then(j => setTools(j.data ?? []));
      fetch('/api/termine').then(r => r.json()).then(j => setTermine(j.data ?? []));

      if (!startBadgeId) { setItems([]); return; }
      const p = new URLSearchParams();
      p.append('badge', String(startBadgeId));
      p.set('page', '1'); p.set('pageSize', '50');
      const r = await fetch(`/api/news?${p}`);
      const j = await r.json();
      setItems(j.data ?? []);
    })();
  }, [startBadgeId]);

  const events = [
    ...termine.map(t => ({
      title: '📌 ' + t.title,
      start: t.date,
      allDay: true,
      backgroundColor: '#2563eb',
      textColor: '#fff',
    })),
    {
      url: 'https://feiertage-api.de/api/?bundesland=SN&out=ical',
      format: 'ics',
    },
    {
      url: 'https://www.schulferien.org/iCal/Ferien/ical/Sachsen.ics',
      format: 'ics',
    },
  ];

  return (
    <div className="container max-w-7xl mx-auto py-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Was gibt's Neues? */}
        <section>
          <h2 className="text-xl font-semibold mb-2">Was gibt&apos;s Neues?</h2>
          <div className={card + ' max-h-[400px] overflow-y-auto'}>
            {items.length === 0 && <div>Keine Start-News.</div>}
            <ul className="grid gap-3">
              {items.map(it => (
                <li key={it.id} className="border border-gray-200 dark:border-gray-700 rounded p-4 bg-gray-50 dark:bg-gray-800">
                  <div className="text-lg font-semibold text-blue-700 dark:text-blue-400">
                    {it.slug ? (
                      <Link href={`/news/${it.slug}`} className="hover:underline">
                        {it.title}
                      </Link>
                    ) : (
                      it.title
                    )}
                  </div>
                  {it.vendor && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{it.vendor.name}</div>
                  )}
                  {it.summary && (
                    <p className="text-gray-700 dark:text-gray-300 mt-2 text-sm">{it.summary}</p>
                  )}
                  {!it.summary && it.content && (
                    <div className="prose dark:prose-invert max-w-none prose-p:my-2 mt-2 text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {it.content.slice(0, 300)}
                      </ReactMarkdown>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* KPIs */}
        <section>
          <h2 className="text-xl font-semibold mb-2">Kennzahlen</h2>
          <div className={card + ' max-h-[400px] overflow-y-auto'}>
            <div className="space-y-3">
              {kpis.length === 0 && <div>Noch keine KPIs hinterlegt.</div>}
              {kpis.map(k => (
                <div key={k.id} className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded p-3 bg-gray-50 dark:bg-gray-800">
                  <div>
                    <div className="text-sm text-gray-500">{k.label}</div>
                    <div className="text-2xl font-semibold">
                      {k.value}{k.unit && <span className="text-base font-normal ml-1">{k.unit}</span>}
                    </div>
                  </div>
                  {k.trend && (
                    <span
                      className="text-xl"
                      style={{ color: k.color || undefined }}
                      title={k.trend}
                    >
                      {k.trend === 'up' ? '▲' : k.trend === 'down' ? '▼' : '→'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tools */}
        <section>
          <h2 className="text-xl font-semibold mb-2">Die wichtigsten Tools</h2>
          <div className={card + ' max-h-[400px] overflow-y-auto'}>
            <ul className="space-y-3">
              {tools.length === 0 && <li>Keine Tools gefunden.</li>}
              {tools.map(tool => (
                <li key={tool.id}>
                  <Link href={tool.href} className="flex items-center gap-2 hover:underline">
                    <span>{tool.icon}</span>
                    {tool.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Kalender */}
        <section>
          <h2 className="text-xl font-semibold mb-2">Termine, Ferien & Feiertage</h2>
          <div className={card}>
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin, iCalendarPlugin, listPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                start: 'prev,next today',
                center: 'title',
                end: 'dayGridMonth,listWeek',
              }}
              locale="de"
              height={400}
              events={events}
              eventClick={(info) => {
                const clickedDate = info.event.start;
                if (clickedDate) setSelectedDate(clickedDate);
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
