import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

type Role = 'admin' | 'moderator' | 'user';

// GET /api/admin/users/[id]
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = supabaseAdmin();

  const { data, error } = await s
    .from(T.appUsers)
    .select('id,email,name,role,active,created_at,updated_at')
    .eq('id', Number(id))
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ data });
}

// PATCH /api/admin/users/[id]
// body: Partial<{ email,name,role,active }>
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};
  if (typeof body.email === 'string') patch.email = String(body.email).trim().toLowerCase();
  if (typeof body.name === 'string') patch.name = body.name.trim() || null;
  if (['admin', 'moderator', 'user'].includes(body.role)) patch.role = body.role as Role;
  if (typeof body.active === 'boolean') patch.active = body.active;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nichts zu ändern.' }, { status: 400 });
  }

  const { error } = await s.from(T.appUsers).update(patch).eq('id', Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/users/[id]
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = supabaseAdmin();

  const { error } = await s.from(T.appUsers).delete().eq('id', Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}