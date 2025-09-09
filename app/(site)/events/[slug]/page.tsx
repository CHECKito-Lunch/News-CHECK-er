// app/(site)/events/[slug]/page.tsx
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { sql } from '@/lib/db';

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
  gallery_json: any | null;
  confirmed_count: number;
  waitlist_count: number;
};

export default async function EventPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

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

  return (
    <div className="container max-w-3xl mx-auto py-8 space-y-6">
      <Link href="/events" className="text-sm text-blue-600 hover:underline">← Zur Übersicht</Link>

      <h1 className="text-3xl font-bold">{row.title}</h1>

      <div className="text-sm text-gray-500">
        {new Date(row.starts_at).toLocaleString('de-DE')}
        {row.location ? <> · {row.location}</> : null}
      </div>

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
    </div>
  );
}

// kleiner Wrapper damit wir ein Client-Component-Widget einhängen können
function EventRsvpClient(props: {
  eventId: number;
  capacity: number | null;
  confirmed: number;
  waitlist: number;
}) {
  // @ts-expect-error Server/Client split ist beabsichtigt
  return <EventRsvpInner {...props} />;
}
