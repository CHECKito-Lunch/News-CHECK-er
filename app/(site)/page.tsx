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

/* ➕ Recharts für Mini-Charts in KPI-Karten */
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, Tooltip,
} from 'recharts';

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

/* ➕ KPI-Typ erweitert um Vergleich & Verlauf */
type KPI = {
  id: number; key: string; label: string; value: string; unit: string | null;
  trend: 'up' | 'down' | 'flat' | null; color: string | null;

  compare_value?: number | null;
  compare_label?: string | null;
  chart_type?: 'bar' | 'line' | null;
  history?: number[] | null;
};

type Tool = { id: number; title: string; icon: string; href: string };

// ⬇︎ Termin-Typ erweitert, mit Fallbacks für alte Daten
type Termin = {
  id: number;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  icon?: string | null;
  date?: string; start?: string; end?: string | null;
};

// FEED: events
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

/* ---------- Helpers ---------- */
const isAgentNews = (it: Item) =>
  (it.post_badges || []).some(pb => {
    const n = (pb?.badge?.name || '').toLowerCase();
    return n.includes('agent') || n.includes('⚡');
  });

const uniqById = <T extends { id: number }>(arr: T[]) => {
  const seen = new Set<number>();
  return arr.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
};

/* ➕ Zahl aus String sicher parsen (entfernt z. B. „%“, „.“ als Tausender, usw.) */
const parseNum = (s?: string | null) => {
  if (!s) return NaN;
  const norm = s.replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(norm);
};

/* ➕ Mini-Komponente: Chart im KPI-Kärtchen */
function KPIChart({ k }: { k: KPI }) {
  const primary = k.color || '#2563eb';

  if (k.chart_type === 'bar') {
    const a = parseNum(k.value);
    const b = typeof k.compare_value === 'number' ? k.compare_value : NaN;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const data = [
      { name: k.label, value: a },
      { name: k.compare_label || 'Vergleich', value: b },
    ];
    return (
      <div className="mt-2 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="name" hide />
            <YAxis hide />
            <Tooltip />
            <Bar dataKey="value" fill={primary} radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (k.chart_type === 'line') {
    const hist = (k.history ?? []).filter(v => Number.isFinite(v));
    if (!hist.length) return null;
    const data = hist.map((v, i) => ({ idx: i + 1, value: v }));
    return (
      <div className="mt-2 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="idx" hide />
            <YAxis hide />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke={primary} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}

export default function HomePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [meta, setMeta] = useState<{ badges: Badge[] }>({ badges: [] });

  // Events aus DB
  const [dbEvents, setDbEvents] = useState<any[]>([]);
  const [feedEvents, setFeedEvents] = useState<EventFeedRow[]>([]);

  // Agent-News (unten)
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

  // KPIs/Tools/Termine + Events + News (Start + jüngste News)
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

  // Agent-News (unten)
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

  // Kalender-Events (Termine + DB-Events + ICS)
  const events = useMemo(() => ([
    ...termine.map(t => ({
      id: String(t.id),
      title: t.title,
      start: t.starts_at || t.start || t.date,
      end:   (t.ends_at || t.end) || undefined,
      allDay: true,
      backgroundColor: '#2563eb',
      textColor: '#fff',
      extendedProps: { icon: t.icon || '📌' },
    })),
    ...dbEvents,
    { url: 'https://feiertage-api.de/api/?bundesland=SN&out=ical', format: 'ics' as const },
    { url: 'https://www.schulferien.org/iCal/Ferien/ical/Sachsen.ics', format: 'ics' as const },
  ]), [termine, dbEvents]);

  // FEED: News + Events bündeln & sortieren
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
      {/* OBERER BEREICH: Drei Kacheln (KPIs, Tools, Kalender) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* KPIs */}
        <section className={card + ' p-4'}>
          <div className={header}><h2 className="text-lg font-semibold">Kennzahlen</h2></div>
          {loadingSide ? (
            <div className="grid grid-cols-2 gap-3 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-gray-50/70 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {kpis.length === 0 && <div className="text-sm text-gray-500 col-span-2">Noch keine KPIs hinterlegt.</div>}
              {kpis.slice(0, 6).map(k => (
                <div key={k.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 p-3">
                  <div className="text-[12px] text-gray-500">{k.label}</div>
                  <div className="mt-0.5 text-2xl font-semibold tracking-tight">
                    {k.value}{k.unit && <span className="text-sm font-normal ml-1">{k.unit}</span>}
                  </div>
                  {k.trend && (
                    <div className="text-xs mt-1" style={{ color: k.color || undefined }}>
                      {k.trend === 'up' ? '▲' : k.trend === 'down' ? '▼' : '→'} Trend
                    </div>
                  )}

                  {/* ➕ Mini-Chart, falls Vergleich/Verlauf vorhanden */}
                  {(k.compare_value != null && k.chart_type === 'bar') || (k.history?.length && k.chart_type === 'line') ? (
                    <KPIChart k={k} />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tools */}
        <section className={card + ' p-4'}>
          <div className={header}><h2 className="text-lg font-semibold">Die wichtigsten Tools</h2></div>
          {loadingSide ? (
            <div className="grid grid-cols-2 gap-3 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-gray-50/70 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800" />
              ))}
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tools.length === 0 && <li className="text-sm text-gray-500">Keine Tools gefunden.</li>}
              {tools.map(tool => (
                <li key={tool.id}>
                  <Link
                    href={tool.href}
                    className="group flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 hover:bg-white/70 dark:hover:bg-white/10"
                  >
                    <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-white/10">
                      {tool.icon}
                    </span>
                    <span className="truncate">{tool.title}</span>
                    <svg className="ml-auto h-4 w-4 opacity-60 group-hover:opacity-100" viewBox="0 0 24 24">
                      <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Kalender */}
        <section className={card + ' p-4'}>
          <div className={header}><h2 className="text-lg font-semibold">Termine, Ferien & Feiertage</h2></div>
          <CalendarModern events={events} />
        </section>
      </div>

      {/* MITTE: Was gibt's Neues? */}
      <section className={card + ' p-4'}>
        <div className={header}>
          <h2 className="text-lg font-semibold">Was gibt&apos;s Neues?</h2>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/events" className="text-blue-600 hover:underline">Alle Events →</Link>
            <Link href="/news" className="text-blue-600 hover:underline">Alle News →</Link>
          </div>
        </div>

        {loadingFeed && (
          <ul className="grid gap-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50 h-20" />
            ))}
          </ul>
        )}

        {!loadingFeed && unifiedFeed.length === 0 && (
          <div className="text-sm text-gray-500 px-2 py-2">Keine Einträge.</div>
        )}

        {!loadingFeed && unifiedFeed.length > 0 && (
          <ul className="grid gap-3">
            {unifiedFeed.map(entry => (
              <li key={entry.key} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 p-4">
                {entry.kind === 'news'
                  ? <NewsCard it={entry.data as Item} />
                  : <EventCard ev={entry.data as EventFeedRow} />
                }
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* TOURISTISCHE NEWS */}
      <section className={card + ' p-4'}>
        <div className={header}>
          <h2 className="text-lg font-semibold">Touristische News (automatisch)</h2>
          <Link href="/news" className="text-sm text-blue-600 hover:underline">Alle News ansehen →</Link>
        </div>

        {tourLoading && (
          <ul className="grid gap-3 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="h-20 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50" />
            ))}
          </ul>
        )}
        {!tourLoading && tourErr && <div className="text-sm text-red-600">{tourErr}</div>}
        {!tourLoading && !tourErr && tourNews.length === 0 && (
          <div className="text-sm text-gray-500">Aktuell keine Einträge.</div>
        )}
        {!tourLoading && !tourErr && tourNews.length > 0 && (
          <ul className="grid gap-3">
            {tourNews.map(it => (
              <li key={it.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-base font-semibold text-blue-700 dark:text-blue-400 leading-snug">
                    {it.slug ? <Link href={`/news/${it.slug}`} className="hover:underline">{it.title}</Link> : it.title}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 dark:border-blue-500/40 dark:text-blue-300">⚡ Agent</span>
                </div>
                {it.vendor && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{it.vendor.name}</div>}
                {it.summary ? (
                  <p className="text-gray-700 dark:text-gray-300 mt-2 text-sm">{it.summary}</p>
                ) : it.content ? (
                  <div className="prose dark:prose-invert max-w-none prose-p:my-2 mt-2 text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{it.content.slice(0, 320)}</ReactMarkdown>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---- Kartenrenderer ------------------------------------------------- */

function NewsCard({ it }: { it: Item }) {
  const imgs = Array.isArray(it.images) ? [...it.images].sort((a,b)=> (a.sort_order ?? 0) - (b.sort_order ?? 0)) : [];
  const thumb = imgs[0]?.url ?? null;
  const date = new Date((it as any).published_at || (it as any).created_at || 0);
  const dateStr = isNaN(date.getTime()) ? null : date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="flex gap-3">
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="h-16 w-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border border-blue-300 text-blue-700 dark:border-blue-600/50 dark:text-blue-300">News</span>
          {dateStr && <span className="text-xs text-gray-500">{dateStr}</span>}
        </div>

        <div className="text-base font-semibold leading-snug mt-0.5">
          {it.slug ? (
            <Link href={`/news/${it.slug}`} className="text-blue-700 dark:text-blue-300 hover:underline">
              {it.title}
            </Link>
          ) : (
            <span className="text-blue-700 dark:text-blue-300">{it.title}</span>
          )}
        </div>

        {it.vendor && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{it.vendor.name}</div>}

        {(it.summary || it.content) && (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 line-clamp-3">
            {it.summary || (it.content ? it.content.replace(/\s+/g,' ').slice(0, 220) : '')}
          </p>
        )}

        {it.post_badges?.length ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {it.post_badges.slice(0,3).map(({ badge }) => (
              <span key={badge.id} className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200">
                {badge.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EventCard({ ev }: { ev: EventFeedRow }) {
  const start = new Date(ev.starts_at);
  const dateStr = start.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="flex gap-3">
      {ev.hero_image_url && (
        <img src={ev.hero_image_url} alt="" className="h-16 w-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border border-green-300 text-green-700 dark:border-green-600/50 dark:text-green-300">Event</span>
          <span className="text-xs text-gray-500">{dateStr}{ev.location ? ` · ${ev.location}` : ''}</span>
        </div>
        <div className="text-base font-semibold leading-snug mt-0.5">
          <Link href={`/events/${ev.slug}`} className="text-emerald-700 dark:text-emerald-300 hover:underline">
            {ev.title}
          </Link>
        </div>
        {ev.summary && <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 line-clamp-3">{ev.summary}</p>}
      </div>
    </div>
  );
}

/* ---- Kalender ------------------------------------------------------- */

function CalendarModern({ events }: { events: any[] }) {
  const calRef = useRef<FullCalendar | null>(null);
  const [title, setTitle] = useState<string>('');

  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const api = () => calRef.current?.getApi();

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function renderEventContent(arg: any) {
    const { event: ev, view, isStart } = arg;
    const isAllDay = ev.allDay;
    const start: Date | null = ev.start ? new Date(ev.start) : null;
    const endEx: Date | null = ev.end ? new Date(ev.end) : null;
    const endIn = endEx && isAllDay ? new Date(endEx.getTime() - 86400000) : endEx;

    let icon = (ev.extendedProps && (ev.extendedProps as any).icon) || '';
    if (!icon) {
      const url: string | undefined = (ev as any).source?.url;
      if (url?.includes('schulferien')) icon = '🏖️';
      else if (url?.includes('feiertage-api')) icon = '🎌';
      else icon = '📅';
    }

    let progressPct = 0;
    if (view.type === 'dayGridMonth' || view.type === 'listUpcoming') {
      if (isAllDay && start && endIn && start <= todayStart && todayStart <= endIn) {
        const one = 86400000;
        const totalDays = Math.max(1, Math.round((endIn.getTime() - start.getTime()) / one) + 1);
        const elapsed = Math.min(
          totalDays,
          Math.max(0, Math.round((todayStart.getTime() - start.getTime()) / one) + 1)
        );
        progressPct = Math.round((elapsed / totalDays) * 100);
      }
    }

    if (view.type === 'dayGridMonth') {
      return (
        <div className="w-full px-1 py-0.5">
          <div className="h-1.5 w-full rounded-full bg-blue-500/15 overflow-hidden border border-blue-500/20">
            <div className="h-full bg-blue-600" style={{ width: '100%' }} />
          </div>
          {isStart && (
            <div className="mt-1 flex items-center gap-1 text-[11px] font-medium leading-none">
              <span className="leading-none">{icon}</span>
              <span className="truncate">{ev.title}</span>
            </div>
          )}
        </div>
      );
    }

    let timeText = arg.timeText || '';
    if (isAllDay && start) {
      timeText =
        endIn && start.toDateString() !== endIn.toDateString()
          ? `${fmtDate(start)} – ${fmtDate(endIn)}`
          : 'ganztägig';
    }

    return (
      <div className="w-full">
        <div className="flex items-center gap-2 px-2 py-1 text-sm">
          {timeText && <span className="opacity-70 whitespace-nowrap">{timeText}</span>}
          <span className="opacity-40">·</span>
          <span className="text-base leading-none">{icon}</span>
          <span className="font-medium truncate">{ev.title}</span>
        </div>
        {progressPct > 0 && (
          <div className="px-2 pb-1">
            <div className="h-1.5 w-full rounded-full bg-blue-500/15 overflow-hidden border border-blue-500/20">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${progressPct}%` }} aria-label={`Fortschritt ${progressPct}%`} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
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
        initialView="listUpcoming"
        headerToolbar={false}
        height="auto"
        firstDay={1}
        dayMaxEvents
        stickyHeaderDates
        initialDate={todayStart}
        validRange={{ start: todayStart }}
        events={events}
        eventDisplay="block"
        displayEventTime={false}
        datesSet={(arg) => setTitle(arg.view.title)}
        eventClassNames={() => 'rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-900 dark:text-blue-200'}
        eventContent={renderEventContent}
        buttonText={{ today: 'Heute', month: 'Monat', list: 'Liste', week: 'Woche' }}
        noEventsText="Keine Termine im ausgewählten Zeitraum."
        views={{
          listUpcoming: { type: 'list', duration: { days: 60 }, buttonText: 'Liste' },
          dayGridMonth: { type: 'dayGridMonth' }
        }}
      />
    </>
  );
}
