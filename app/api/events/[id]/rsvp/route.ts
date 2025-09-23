// app/api/events/[id]/rsvp/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

// GET: aktuellen RSVP-Status der eingeloggten Person holen
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const s = await supabaseServer();
  const u = await getUserFromRequest();
  if (!u) return NextResponse.json({ ok: false, state: 'none' });

  const { id } = await params;
  const event_id = Number(id);

  const { data, error } = await s
    .from('event_registrations')
    .select('state')
    .eq('event_id', event_id)
    .eq('user_id', u.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, state: 'none' });
  return NextResponse.json({ ok: true, state: data?.state ?? 'none' });
}

// POST: { action: 'join' | 'leave' }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const s = await supabaseServer();
  const u = await getUserFromRequest();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { action } = await req.json().catch(() => ({} as { action?: string }));
  const { id } = await params;
  const event_id = Number(id);

  if (action === 'leave') {
    const { error } = await s
      .from('event_registrations')
      .delete()
      .eq('event_id', event_id)
      .eq('user_id', u.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, state: 'none' });
  }

  if (action !== 'join') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // 1) Event holen (Kapazität)
  const { data: ev } = await s
    .from('events')
    .select('capacity')
    .eq('id', event_id)
    .maybeSingle();

  // 2) Anzahl bestätigter Plätze zählen
  const { count: confirmedCount } = await s
    .from('event_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', event_id)
    .eq('state', 'confirmed');

  const cap = ev?.capacity ?? null;
  const shouldWaitlist =
    cap !== null && typeof confirmedCount === 'number' && confirmedCount >= cap;

  // 3) Falls Warteliste: nächste Position berechnen
  let position: number | null = null;
  if (shouldWaitlist) {
    const { data: posRow } = await s
      .from('event_registrations')
      .select('position')
      .eq('event_id', event_id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    position = (posRow?.position ?? 0) + 1;
  }

  // 4) Upsert mit erlaubtem state
  const state: 'confirmed' | 'waitlist' = shouldWaitlist ? 'waitlist' : 'confirmed';

  const { error } = await s
    .from('event_registrations')
    .upsert(
      { event_id, user_id: u.id, state, position, updated_at: new Date().toISOString() },
      { onConflict: 'event_id,user_id' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, state });
}