// app/(site)/events/[slug]/page.tsx
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { sql } from '@/lib/db';

// Client-Komponenten (eigene Dateien, siehe unten)
import EventRsvpClient from './EventRsvpClient';
import EventGallery from './EventGallery';
import EventComments from './EventComments';

type Row = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  content: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  status: string;
  hero_image_url: string | null;
  gallery_json: any | null; // jsonb (Array<String>) oder null
  confirmed_count: number;
  waitlist_count: number;
};

function parseGallery(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  if (typeof v === 'string') {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? j.filter((x) => typeof x === 'string') : [];
    } catch { return []; }
  }
  return [];
}

function formatWhen(startISO: string, endISO: string | null, loc?: string | null) {
  const tz = 'Europe/Berlin';
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : null;

  const dateFmt = new Intl.DateTimeFormat('de-DE', { timeZone: tz, dateStyle: 'medium' });
  const timeFmt = new Intl.DateTimeFormat('de-DE', { timeZone: tz, timeStyle: 'short' });

  const dateStr = dateFmt.format(start);
  const startTime = timeFmt.format(start);

  let range = `${dateStr}, ${startTime}`;
  if (end) {
    const sameDay = dateFmt.format(start) === dateFmt.format(end);
    const endTime = timeFmt.format(end);
    range = sameDay ? `${dateStr}, ${startTime}–${endTime}` : `${dateStr}, ${startTime} – ${dateFmt.format(end)}, ${endTime}`;
  }

  return loc ? `${range} · ${loc}` : range;
}

export default async function EventPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;

  const [row] = await sql<Row[]>`
    select
      e.*,
      coalesce(c.confirmed_count, 0) as confirmed_count,
      coalesce(c.waitlist_count, 0)  as waitlist_count
    from public.events e
    left join (
      select
        er.event_id,
        count(*) filter (where er.state = 'confirmed') as confirmed_count,
        count(*) filter (where er.state not in ('confirmed','cancelled')) as waitlist_count
      from public.event_registrations er
      group by er.event_id
    ) c on c.event_id = e.id
    where e.slug = ${slug}
    limit 1
  `;

  if (!row) {
    return <div className="container mx-auto py-8">Event nicht gefunden.</div>;
  }

  const gallery = parseGallery(row.gallery_json);
  const when = formatWhen(row.starts_at, row.ends_at, row.location);

  return (
    <div className="container max-w-3xl mx-auto py-8 space-y-6">
      <Link href="/events" className="text-sm text-blue-600 hover:underline">← Zur Übersicht</Link>

      <h1 className="text-3xl font-bold">{row.title}</h1>

      <div className="text-sm text-gray-500">
        {when}
      </div>

      {/* Titelbild + Galerie */}
      {(row.hero_image_url || gallery.length > 0) && (
        <EventGallery
          heroUrl={row.hero_image_url}
          images={gallery}
          title={row.title}
        />
      )}

      {row.summary && <p className="text-lg">{row.summary}</p>}

      {row.content && (
        <div
          className="prose dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: row.content.replace(/\n/g, '<br/>') }}
        />
      )}

      {/* RSVP Widget (Client) */}
      <EventRsvpClient
        eventId={row.id}
        capacity={row.capacity}
        confirmed={row.confirmed_count}
        waitlist={row.waitlist_count}
      />

      {/* Kommentare */}
      <EventComments eventId={row.id} />
    </div>
  );
}
