// app/api/events/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/**
 * Unterstützte Modi:
 *  - ?calendar=1     → Events für FullCalendar (zukünftig)
 *  - ?feed=1&limit=N → kompakte Eventcards für "Was gibt's Neues?"
 *
 * Rückgaben:
 *  - calendar: { ok:true, events: Array<FullCalendarEvent> }
 *  - feed:     { ok:true, items:  Array<{id,slug,title,summary,starts_at,location,hero_image_url}> }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isCalendar = searchParams.has('calendar');
  const isFeed     = searchParams.has('feed');
  const limit      = Math.min(Math.max(Number(searchParams.get('limit') ?? (isFeed ? 5 : 100)), 1), 500);

  try {
    if (isCalendar) {
      // Ab heute (00:00) nur veröffentlichte, zukünftig
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const startIso = start.toISOString();

      const rows = await sql<any[]>`
        select id, slug, title, starts_at, ends_at
        from public.events
        where status = 'published'
          and starts_at >= ${startIso}
        order by starts_at asc
        limit ${limit}
      `;

      // FullCalendar-Objekte (dein Style kommt aus der Komponente, Farben sind optional)
      const events = rows.map(r => ({
        title: `🟢 ${r.title}`,
        start: r.starts_at,
        end:   r.ends_at ?? undefined,
        url:   `/events/${r.slug}`,
        // diese Felder werden von deiner eventClassNames überschrieben – bleiben aber harmlos
        backgroundColor: '#059669',
        textColor: '#fff',
      }));

      return NextResponse.json({ ok: true, events });
    }

    if (isFeed) {
      // Für den Feed: veröffentlichte Events im Fenster [heute-60d .. Zukunft], sortiert nach Datum (neu/nah zuerst)
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString();

      const rows = await sql<any[]>`
        select id, slug, title, summary, starts_at, location, hero_image_url
        from public.events
        where status = 'published'
          and starts_at >= ${since}
        order by starts_at desc
        limit ${limit}
      `;

      return NextResponse.json({ ok: true, items: rows });
    }

    // Fallback: einfache Liste (z. B. wenn jemand /api/events ohne Query aufruft)
    const rows = await sql<any[]>`
      select id, slug, title, summary, starts_at, location, hero_image_url
      from public.events
      where status = 'published'
      order by starts_at desc
      limit ${limit}
    `;
    return NextResponse.json({ ok: true, items: rows });
  } catch (e: any) {
    console.error('[events GET]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
