// app/api/events/[id]/rsvp/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth';

function extractId(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // …/api/events/:id/rsvp
    const idStr = parts[parts.length - 2];
    const id = Number(idStr);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  // 1) einfacher Cookie, falls gesetzt
  const explicit = jar.get('user_id')?.value;
  if (explicit) return explicit;
  // 2) unser eigenes JWT (siehe lib/auth.ts)
  const token = jar.get(AUTH_COOKIE)?.value;
  const sess = await verifyToken(token);
  return sess?.sub ?? null;
}

/** Aktuellen RSVP-Status des eingeloggten Users zurückgeben */
export async function GET(req: NextRequest) {
  const eventId = extractId(req.url);
  if (eventId === null) {
    return NextResponse.json({ ok: false, error: 'invalid_event_id' }, { status: 400 });
  }
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const [row] = await sql<{ state: string | null; position: number | null }[]>`
    select state, position
      from public.event_registrations
     where event_id = ${eventId} and user_id = ${userId}
     limit 1
  `;
  return NextResponse.json({ ok: true, state: row?.state ?? null, position: row?.position ?? null });
}

/** Anmelden – setzt automatisch Warteliste, wenn Kapazität erreicht ist */
export async function POST(req: NextRequest) {
  const eventId = extractId(req.url);
  if (eventId === null) {
    return NextResponse.json({ ok: false, error: 'invalid_event_id' }, { status: 400 });
  }
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const [info] = await sql<{ capacity: number | null; confirmed: number }[]>`
      select
        e.capacity,
        coalesce((
          select count(*) from public.event_registrations er
           where er.event_id = e.id and er.state = 'confirmed'
        ), 0) as confirmed
      from public.events e
     where e.id = ${eventId}
     limit 1
    `;
    if (!info) {
      return NextResponse.json({ ok: false, error: 'event_not_found' }, { status: 404 });
    }

    const nextState: 'confirmed' | 'waitlist' =
      info.capacity === null || info.confirmed < info.capacity ? 'confirmed' : 'waitlist';

    let position: number | null = null;

    await sql.begin(async (tx) => {
      // bestehende Anmeldung bereinigen
      await tx`delete from public.event_registrations where event_id = ${eventId} and user_id = ${userId}`;

      if (nextState === 'waitlist') {
        const [p] = await tx<{ pos: number }[]>`
          select coalesce(max(position), 0) + 1 as pos
            from public.event_registrations
           where event_id = ${eventId} and state = 'waitlist'
        `;
        position = p?.pos ?? 1;
      }

      await tx`
        insert into public.event_registrations (event_id, user_id, state, position)
        values (${eventId}, ${userId}, ${nextState}, ${position})
      `;
    });

    return NextResponse.json({ ok: true, state: nextState, position });
  } catch (e: any) {
    console.error('[events/:id/rsvp POST]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

/** Abmelden */
export async function DELETE(req: NextRequest) {
  const eventId = extractId(req.url);
  if (eventId === null) {
    return NextResponse.json({ ok: false, error: 'invalid_event_id' }, { status: 400 });
  }
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    await sql`delete from public.event_registrations where event_id = ${eventId} and user_id = ${userId}`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[events/:id/rsvp DELETE]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
