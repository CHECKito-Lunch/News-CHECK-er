export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { supabaseServer } from '@/lib/supabase-server';

async function requireUserId() {
  const s = await supabaseServer();
  const { data, error } = await s.auth.getUser();
  if (error || !data?.user) throw new Response('Unauthorized', { status: 401 });
  return data.user.id;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await requireUserId();
  const eid = Number(params.id);
  const [row] = await sql<{ state: string }[]>`
    select state from public.event_registrations
    where event_id = ${eid} and user_id = ${userId}
    limit 1
  `;
  return NextResponse.json({ ok: true, state: row?.state ?? 'none' });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await requireUserId();
  const eid = Number(params.id);

  const body = await req.json().catch(() => ({}));
  const action: 'join' | 'leave' = body?.action;

  if (action === 'leave') {
    await sql`delete from public.event_registrations where event_id = ${eid} and user_id = ${userId}`;
  } else if (action === 'join') {
    // Kapazität + aktuelle Counts
    const [ev] = await sql<{ capacity: number | null; confirmed_count: number; waitlist_count: number }[]>`
      select capacity,
             (select count(*) from public.event_registrations er
                 where er.event_id = e.id and er.state = 'confirmed')::int as confirmed_count,
             (select count(*) from public.event_registrations er
                 where er.event_id = e.id and er.state = 'waitlist')::int as waitlist_count
      from public.events e
      where e.id = ${eid}
      limit 1
    `;
    if (!ev) return NextResponse.json({ ok: false, error: 'event_not_found' }, { status: 404 });

    const wantState = ev.capacity === null || ev.confirmed_count < ev.capacity ? 'confirmed' : 'waitlist';

    // position = letztes+1
    const [pos] = await sql<{ p: number }[]>`
      select coalesce(max(position), 0)+1 as p
      from public.event_registrations
      where event_id = ${eid}
    `;

    // Upsert
    await sql`
      insert into public.event_registrations (event_id, user_id, state, position)
      values (${eid}, ${userId}, ${wantState}, ${pos.p})
      on conflict (event_id, user_id)
      do update set state = excluded.state
    `;
  } else {
    return NextResponse.json({ ok: false, error: 'invalid_action' }, { status: 400 });
  }

  // neue Stats zurück
  const [stats] = await sql<{ confirmed_count: number; waitlist_count: number }[]>`
    select
      (select count(*) from public.event_registrations where event_id=${eid} and state='confirmed')::int as confirmed_count,
      (select count(*) from public.event_registrations where event_id=${eid} and state='waitlist')::int  as waitlist_count
  `;

  const [me] = await sql<{ state: string | null }[]>`
    select state from public.event_registrations
    where event_id = ${eid} and user_id = ${userId}
    limit 1
  `;

  return NextResponse.json({
    ok: true,
    state: me?.state ?? 'none',
    ...stats
  });
}
