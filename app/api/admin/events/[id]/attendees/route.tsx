import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

async function requireAdmin() {
  const s = await supabaseServer();
  const u = await getUserFromRequest();
  if (!u) return { s, ok: false as const };
  const { data } = await s.from('app_users').select('role').eq('user_id', u.id).maybeSingle();
  return { s, ok: data?.role === 'admin' };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { s, ok } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const event_id = Number(params.id);

  // Wenn du die View angelegt hast, ist das hier am bequemsten:
  const { data, error } = await s
    .from('event_registrations_with_user')
    .select('*')
    .eq('event_id', event_id)
    .order('state', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { s, ok } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const event_id = Number(params.id);
  const { user_id, state } = await req.json().catch(() => ({} as any)); // 'confirmed' | 'waitlist'
  if (!user_id || !['confirmed','waitlist'].includes(state)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const { error } = await s
    .from('event_registrations')
    .update({ state, updated_at: new Date().toISOString() })
    .eq('event_id', event_id)
    .eq('user_id', user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { s, ok } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const event_id = Number(params.id);
  const { user_id } = await req.json().catch(() => ({} as any));
  if (!user_id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const { error } = await s
    .from('event_registrations')
    .delete()
    .eq('event_id', event_id)
    .eq('user_id', user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
