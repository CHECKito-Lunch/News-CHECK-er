import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

type State = 'none' | 'confirmed' | 'waitlist';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await supabaseServer();
  const user = await getUserFromRequest();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const event_id = Number(params.id);
  const { data } = await s
    .from('event_registrations')
    .select('state')
    .eq('event_id', event_id)
    .eq('user_id', user.id) // RLS + Cast in Policy
    .maybeSingle();

  return NextResponse.json({ ok: true, state: (data?.state as State) ?? 'none' });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await supabaseServer();
  const user = await getUserFromRequest();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const event_id = Number(params.id);
  const { action } = await req.json().catch(() => ({} as any)); // 'join' | 'leave' | 'waitlist'

  if (action === 'leave') {
    await s.from('event_registrations')
      .delete()
      .eq('event_id', event_id)
      .eq('user_id', user.id);
    return NextResponse.json({ ok: true, state: 'none' });
  }

  // Kapazität prüfen
  let nextState: State = 'confirmed';
  const { data: ev } = await s.from('events').select('capacity').eq('id', event_id).maybeSingle();
  if (ev?.capacity != null) {
    const { count } = await s
      .from('event_registrations')
      .select('user_id', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .eq('state', 'confirmed');
    if ((count ?? 0) >= ev.capacity) nextState = 'waitlist';
  }

  if (action === 'waitlist') nextState = 'waitlist';

  // Upsert
  const { error } = await s.from('event_registrations').upsert(
    { event_id, user_id: user.id, state: nextState, updated_at: new Date().toISOString() },
    { onConflict: 'event_id,user_id' },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, state: nextState });
}
