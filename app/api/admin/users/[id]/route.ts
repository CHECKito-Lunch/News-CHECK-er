// app/api/admin/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

type Role = 'admin' | 'moderator' | 'user';

// Hilfsfunktion: params sicher parsen (Next 15: params kann async sein)
async function getNumericId(params: Promise<{ id: string }> | { id: string }) {
  const p = 'then' in (params as any) ? await (params as Promise<{ id: string }>) : (params as { id: string });
  const n = Number(p.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  const id = await getNumericId(ctx.params);
  if (!id) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.appUsers)
    .select('id,email,name,role,active,created_at,updated_at')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  const id = await getNumericId(ctx.params);
  if (!id) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const body = await req.json().catch(() => ({} as Partial<{ email: string; name: string | null; role: Role; active: boolean }>) );

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.email === 'string') update.email = body.email.trim().toLowerCase();
  if (body.name !== undefined)       update.name  = body.name === '' ? null : body.name;
  if (typeof body.role === 'string' && ['admin','moderator','user'].includes(body.role)) update.role = body.role as Role;
  if (typeof body.active === 'boolean') update.active = body.active;

  const hasRealChanges = Object.keys(update).some(k => k !== 'updated_at');
  if (!hasRealChanges) return NextResponse.json({ error: 'Nichts zu aktualisieren.' }, { status: 400 });

  const s = supabaseAdmin();
  const { error } = await s.from(T.appUsers).update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  const id = await getNumericId(ctx.params);
  if (!id) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const s = supabaseAdmin();
  const { error } = await s.from(T.appUsers).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}