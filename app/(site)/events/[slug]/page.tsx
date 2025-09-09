// app/(site)/events/[slug]/page.tsx
import { sql } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EventPage({ params }: { params: { slug: string } }) {
  const [row] = await sql<any[]>`
    select * from public.events_with_counts where slug = ${params.slug} limit 1
  `;
  if (!row) return <div className="container mx-auto py-8">Event nicht gefunden.</div>;

  return (
    <div className="container max-w-3xl mx-auto py-8 space-y-6">
      <Link href="/events" className="text-sm text-blue-600 hover:underline">← Zur Übersicht</Link>

      <h1 className="text-3xl font-bold">{row.title}</h1>
      <div className="text-sm text-gray-500">
        {new Date(row.starts_at).toLocaleString('de-DE')}
        {row.location ? <> · {row.location}</> : null}
      </div>

      {row.cover_url && (
        <img
          src={row.cover_url}
          alt=""
          className="w-full rounded-2xl border border-gray-200 dark:border-gray-800"
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
      {/* @ts-expect-error RSC/Client-Split */}
      <EventRsvpInner
        eventId={row.id}
        capacity={row.capacity}
        confirmed={row.confirmed_count}
        waitlist={row.waitlist_count}
      />
    </div>
  );
}
