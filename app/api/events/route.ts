export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const forCal = u.searchParams.get('calendar') === '1';

  const now = new Date();
  const rows = await sql<any[]>`
    select * from public.events_with_counts
    where status = 'published' and starts_at >= ${now.toISOString()}
    order by starts_at asc
    limit 200
  `;

  if (forCal) {
    const events = rows.map(r => ({
      id: r.id,
      title: (r.title as string),
      start: r.starts_at,
      end: r.ends_at ?? null,
      allDay: false,
      backgroundColor: '#22c55e',
      textColor: '#fff',
      extendedProps: { slug: r.slug, kind: 'event' }
    }));
    return NextResponse.json({ ok: true, events });
  }

  return NextResponse.json({ ok:true, data: rows });
}
