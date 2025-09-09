// app/api/events/[id]/rsvp/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies as getCookies } from 'next/headers';
import { sql } from '@/lib/db';

type State = 'confirmed' | 'waitlist';
const json = (data: any, status = 200) => NextResponse.json(data, { status });

// URL-Helfer: .../api/events/:id/rsvp  -> number | null
function extractId(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // [..., 'events', ':id', 'rsvp']
    const idStr = parts[parts.length - 2];
    const id = Number(idStr);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

async function getUserIdFromCookies(): Promise<string | null> {
  try {
    const c = await getCookies();

    // 1) bevorzugt explizites user_id-Cookie
    const uid = c.get('user_id')?.value || null;
    if (uid) return uid;

    // 2) Fallback: aus "auth" (Supabase access_token) die sub extrahieren
    const auth = c.get('auth')?.value;
    if (!auth || !auth.includes('.')) return null;

    try {
      const payloadB64 = auth.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);
      const sub = typeof payload?.sub === 'string' ? payload.sub : null;
      return sub || null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function getCounts(eid: number) {
  const [row] = await sql<{ confirmed_count: number; waitlist_count: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE er.state = 'confirmed') AS confirmed_count,
      COUNT(*) FILTER (WHERE er.state NOT IN ('confirmed','cancelled')) AS waitlist_count
    FROM public.event_registrations er
    WHERE er.event_id = ${eid}
  `;
  return {
    confirmed_count: Number(row?.confirmed_count ?? 0),
    waitlist_count: Number(row?.waitlist_count ?? 0),
  };
}

// ------- GET: Status des eingeloggten Nutzers für dieses Event -------
export async function GET(req: NextRequest) {
  const eid = extractId(req.url);
  if (eid === null) return json({ ok: false, error: 'invalid_id' }, 400);

  const userId = await getUserIdFromCookies();
  if (!userId) return json({ ok: false, error: 'unauthorized' }, 401);

  const [row] = await sql<{ state: string }[]>`
    SELECT state
    FROM public.event_registrations
    WHERE event_id = ${eid} AND user_id = ${userId}
    LIMIT 1
  `;
  return json({ ok: true, state: (row?.state ?? 'none') });
}

// ------- POST: join/leave -------
export async function POST(req: NextRequest) {
  const eid = extractId(req.url);
  if (eid === null) return json({ ok: false, error: 'invalid_id' }, 400);

  const userId = await getUserIdFromCookies();
  if (!userId) return json({ ok: false, error: 'unauthorized' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch {}

  const action = String(body?.action ?? '');
  if (action !== 'join' && action !== 'leave') {
    return json({ ok: false, error: 'invalid_action' }, 400);
  }

  // Event (für capacity)
  const [ev] = await sql<{ capacity: number | null }[]>`
    SELECT capacity FROM public.events WHERE id = ${eid} LIMIT 1
  `;
  if (!ev) return json({ ok: false, error: 'event_not_found' }, 404);

  if (action === 'leave') {
    await sql`
      DELETE FROM public.event_registrations
      WHERE event_id = ${eid} AND user_id = ${userId}
    `;
    const after = await getCounts(eid);
    return json({
      ok: true,
      state: 'none',
      confirmed_count: after.confirmed_count,
      waitlist_count: after.waitlist_count,
      notice: 'Abmeldung gespeichert.',
    });
  }

  // action === 'join'
  const counts = await getCounts(eid);
  const isFull = ev.capacity != null && counts.confirmed_count >= Number(ev.capacity);
  const targetState: State = isFull ? 'waitlist' : 'confirmed';

  await sql`
    INSERT INTO public.event_registrations (event_id, user_id, state)
    VALUES (${eid}, ${userId}, ${targetState})
    ON CONFLICT (event_id, user_id) DO UPDATE
      SET state = EXCLUDED.state
  `;

  const after = await getCounts(eid);
  return json({
    ok: true,
    state: targetState,
    confirmed_count: after.confirmed_count,
    waitlist_count: after.waitlist_count,
    notice: isFull
      ? 'Event ist voll – du bist auf der Warteliste.'
      : 'Du bist angemeldet.',
  });
}
