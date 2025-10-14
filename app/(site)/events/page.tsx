/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/(site)/events/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type State = 'none' | 'confirmed' | 'waitlist';

type EventRow = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  starts_at: string;           // ISO
  ends_at: string | null;      // ISO
  location: string | null;
  hero_image_url: string | null;
  capacity?: number | null;    // optional (wird, falls vorhanden, angezeigt)
};

type FeedShape =
  | { items?: EventRow[] }     // /api/events?feed=1 (empfohlen)
  | { data?: EventRow[] }
  | { events?: EventRow[] }
  | EventRow[];

const card = 'rounded-2xl shadow-sm bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800';
const input = 'px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10';
const btn   = 'px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700';

export default function EventsIndexPage() {
  const [all, setAll] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [onlyMine, setOnlyMine] = useState(false);
  const [rsvp, setRsvp] = useState<Record<number, State>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [authWarn, setAuthWarn] = useState(false);

  // Events laden (robust gegen unterschiedliche API-Shapes)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/events?feed=1', { cache: 'no-store' });
        const j: FeedShape = await r.json().catch(() => ({} as any));
        const items =
          Array.isArray(j) ? j :
          Array.isArray((j as any).items) ? (j as any).items :
          Array.isArray((j as any).data)  ? (j as any).data  :
          Array.isArray((j as any).events)? (j as any).events: [];
        if (alive) setAll(items as EventRow[]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // RSVP-Status für geladene Events holen (wenn eingeloggt)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = all.map(async ev => {
        try {
          const r = await fetch(`/api/events/${ev.id}/rsvp`, { credentials: 'include', cache: 'no-store' });
          if (r.status === 401) { if (!cancelled) setAuthWarn(true); return [ev.id, 'none' as State] as const; }
          const j = await r.json().catch(() => ({}));
          const st: State = (j?.ok && j?.state) ? j.state : 'none';
          return [ev.id, st] as const;
        } catch {
          return [ev.id, 'none' as State] as const;
        }
      });
      const pairs = await Promise.all(entries);
      if (!cancelled) {
        const map: Record<number, State> = {};
        pairs.forEach(([id, st]) => (map[id] = st));
        setRsvp(map);
      }
    })();
    return () => { cancelled = true; };
  }, [all]);

  // Helpers ------------------------------------------------------------

  function fmtDateRange(startsISO: string, endsISO: string | null) {
    const s = new Date(startsISO);
    const e = endsISO ? new Date(endsISO) : null;
    const sameDay = e ? s.toDateString() === e.toDateString() : true;

    const date = s.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const tStart = s.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (!e) return `${date}, ${tStart}`;
    const tEnd = e.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return sameDay ? `${date}, ${tStart}–${tEnd}` : `${date}, ${tStart} – ${e.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`;
  }

  function relCountdown(startsISO: string, endsISO: string | null) {
    const now = Date.now();
    const start = new Date(startsISO).getTime();
    const end = endsISO ? new Date(endsISO).getTime() : null;

    if (end && now > start && now < end) return { label: 'Jetzt live', tone: 'live' as const };
    if (now >= start && (!end || now >= end)) return { label: 'Beendet', tone: 'past' as const };

    const diff = start - now; // ms bis Start
    const min = Math.round(diff / 60000);
    if (min < 60) return { label: `in ${min} Min`, tone: 'soon' as const };
    const hours = Math.floor(min / 60);
    const remMin = min % 60;
    if (hours < 24) return { label: `in ${hours} h ${remMin} min`, tone: 'soon' as const };
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return { label: `in ${days} T ${remH} h`, tone: 'future' as const };
  }

  async function toggleRsvp(ev: EventRow) {
    setBusyId(ev.id);
    setAuthWarn(false);
    try {
      const current = rsvp[ev.id] ?? 'none';
      const action = current === 'none' ? 'join' : 'leave';
      const r = await fetch(`/api/events/${ev.id}/rsvp`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (r.status === 401) { setAuthWarn(true); return; }
      const j = await r.json().catch(() => ({}));
      if (j?.ok && j?.state) {
        setRsvp(m => ({ ...m, [ev.id]: j.state as State }));
      }
    } finally {
      setBusyId(null);
    }
  }

  // Filter + Suche
  const filtered = useMemo(() => {
    const now = Date.now();
    const ql = q.trim().toLowerCase();

    let list = all.slice();
    if (scope !== 'all') {
      list = list.filter(ev => {
        const start = new Date(ev.starts_at).getTime();
        const end = ev.ends_at ? new Date(ev.ends_at).getTime() : start;
        const isPast = end < now;
        return scope === 'past' ? isPast : !isPast;
      });
    }
    if (ql) {
      list = list.filter(ev =>
        ev.title.toLowerCase().includes(ql) ||
        (ev.summary ?? '').toLowerCase().includes(ql) ||
        (ev.location ?? '').toLowerCase().includes(ql)
      );
    }
    if (onlyMine) {
      list = list.filter(ev => (rsvp[ev.id] ?? 'none') !== 'none');
    }
    // Sortierung: kommende zuerst (nach Start), vergangene nach Start absteigend
    list.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    return list;
  }, [all, q, scope, onlyMine, rsvp]);

  // UI ----------------------------------------------------------------

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">Zur Startseite</Link>
      </header>

      {/* Filterleiste */}
      <section className={card + ' p-4'}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            placeholder="Suche nach Titel, Ort…"
            className={input + ' w-64'}
            value={q}
            onChange={e => setQ(e.target.value)}
          />

          <div className="inline-flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
            <button
              className={`px-3 py-1.5 text-sm ${scope==='upcoming' ? 'bg-white dark:bg-white/10' : ''}`}
              onClick={() => setScope('upcoming')}
            >Kommend</button>
            <button
              className={`px-3 py-1.5 text-sm border-l border-gray-200 dark:border-gray-800 ${scope==='past' ? 'bg-white dark:bg-white/10' : ''}`}
              onClick={() => setScope('past')}
            >Vergangen</button>
            <button
              className={`px-3 py-1.5 text-sm border-l border-gray-200 dark:border-gray-800 ${scope==='all' ? 'bg-white dark:bg-white/10' : ''}`}
              onClick={() => setScope('all')}
            >Alle</button>
          </div>

          <label className="ml-auto inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={onlyMine}
              onChange={e => setOnlyMine(e.target.checked)}
            />
            nur meine Anmeldungen
          </label>
        </div>

        {authWarn && (
          <div className="text-sm text-amber-600 mt-2">
            Bitte einloggen, um Anmeldungen zu sehen/ändern. <Link href="/auth/login" className="underline">Login</Link>
          </div>
        )}
      </section>

      {/* Liste / Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={card + ' h-44 animate-pulse'} />
        ))}

        {!loading && filtered.length === 0 && (
          <div className="col-span-full text-sm text-gray-500">Keine passenden Events.</div>
        )}

        {!loading && filtered.map(ev => {
          const rel = relCountdown(ev.starts_at, ev.ends_at);
          const state = rsvp[ev.id] ?? 'none';
          const busy = busyId === ev.id;

          return (
            <article key={ev.id} className={card + ' overflow-hidden'}>
              {/* Bild */}
              {ev.hero_image_url ? (
                <img
                  src={ev.hero_image_url}
                  alt=""
                  className="h-36 w-full object-cover border-b border-gray-200 dark:border-gray-800"
                />
              ) : (
                <div className="h-36 w-full bg-gradient-to-br from-blue-100 to-emerald-100 dark:from-blue-900/20 dark:to-emerald-900/20 border-b border-gray-200 dark:border-gray-800" />
              )}

              <div className="p-4 space-y-2">
                {/* Kopfzeile: Badges */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-green-300 text-green-700 dark:border-green-600/50 dark:text-green-300">Event</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border
                    ${rel.tone==='live'
                      ? 'border-red-300 text-red-700 dark:border-red-600/50 dark:text-red-300'
                      : rel.tone==='past'
                      ? 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
                      : 'border-blue-300 text-blue-700 dark:border-blue-600/50 dark:text-blue-300'}`}>
                    {rel.label}
                  </span>
                  {state !== 'none' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-700 dark:border-emerald-600/50 dark:text-emerald-300">
                      {state === 'confirmed' ? 'angemeldet' : 'Warteliste'}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-gray-500">
                    {fmtDateRange(ev.starts_at, ev.ends_at)}{ev.location ? ` · ${ev.location}` : ''}
                  </span>
                </div>

                {/* Titel */}
                <h3 className="text-lg font-semibold leading-snug">
                  <Link href={`/events/${ev.slug}`} className="hover:underline">
                    {ev.title}
                  </Link>
                </h3>

                {/* Summary */}
                {ev.summary && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">{ev.summary}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <Link href={`/events/${ev.slug}`} className={btn}>Zum Event</Link>
                  <button
                    disabled={busy}
                    onClick={() => toggleRsvp(ev)}
                    className={`px-3 py-2 rounded-lg text-sm shadow-sm
                      ${state==='none'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60'
                        : 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 disabled:opacity-60'
                      }`}
                    title={state==='none' ? 'Jetzt anmelden' : 'Abmelden'}
                  >
                    {busy ? '…' : state === 'none' ? 'Anmelden' : 'Abmelden'}
                  </button>

                  {/* Kapazität falls vorhanden */}
                  {typeof ev.capacity === 'number' && (
                    <span className="ml-auto text-xs text-gray-500">Kapazität: {ev.capacity}</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
