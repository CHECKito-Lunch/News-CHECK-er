// app/api/events/[id]/rsvp/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

async function requireUser() {
  const s = await supabaseServer();
  const u = await getUserFromRequest();
  if (!u) return { s, user: null as null };
  return { s, user: u };
}

export async function GET(_req: Request, { params }: any) {
  const { s, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const event_id = Number(params?.id);
  if (!Number.isFinite(event_id)) {
    return NextResponse.json({ error: 'bad_event_id' }, { status: 400 });
  }

  const { data, error } = await s
    .from('event_registrations')
    .select('event_id,user_id,state,created_at,updated_at')
    .eq('event_id', event_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }); // data = null wenn (noch) nicht registriert
}

export async function POST(req: Request, { params }: any) {
  const { s, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const event_id = Number(params?.id);
  if (!Number.isFinite(event_id)) {
    return NextResponse.json({ error: 'bad_event_id' }, { status: 400 });
  }

  // optional: state aus Body (default 'confirmed')
  const body = await req.json().catch(() => ({}));
  const state: 'confirmed' | 'waitlist' = ['confirmed', 'waitlist'].includes(body?.state)
    ? body.state
    : 'confirmed';

  // versuche Update; wenn keine Zeile betroffen, Insert
  const { data: upd, error: updErr } = await s
    .from('event_registrations')
    .update({ state, updated_at: new Date().toISOString() })
    .eq('event_id', event_id)
    .eq('user_id', user.id)
    .select('id');

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  if (!upd?.length) {
    const { error: insErr } = await s.from('event_registrations').insert({
      event_id,
      user_id: user.id,
      state,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, state });
}

export async function DELETE(_req: Request, { params }: any) {
  const { s, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const event_id = Number(params?.id);
  if (!Number.isFinite(event_id)) {
    return NextResponse.json({ error: 'bad_event_id' }, { status: 400 });
  }

  const { error } = await s
    .from('event_registrations')
    .delete()
    .eq('event_id', event_id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
