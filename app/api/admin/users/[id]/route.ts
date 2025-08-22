// app/api/admin/users/[id]/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest, RouteContext } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

type Role = 'admin' | 'moderator' | 'user';

function parseId(id: unknown): number | null {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// GET /api/admin/users/[id]
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const num = parseId(id);
  if (!num) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.appUsers)
    .select('id,email,name,role,active,created_at,updated_at')
    .eq('id', num)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data });
}

// PATCH /api/admin/users/[id]
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const num = parseId(id);
  if (!num) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const body = await req.json().catch(() => ({} as Partial<{ email: string; name: string | null; role: Role; active: boolean }>) );

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.email === 'string') update.email = body.email.trim().toLowerCase();
  if (body.name !== undefined) update.name = body.name === '' ? null : body.name;
  if (typeof body.role === 'string' && ['admin','moderator','user'].includes(body.role)) update.role = body.role as Role;
  if (typeof body.active === 'boolean') update.active = body.active;

  const hasChanges = Object.keys(update).some(k => k !== 'updated_at');
  if (!hasChanges) return NextResponse.json({ error: 'Nichts zu aktualisieren.' }, { status: 400 });

  const s = supabaseAdmin();
  const { error } = await s.from(T.appUsers).update(update).eq('id', num);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/users/[id]
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const num = parseId(id);
  if (!num) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const s = supabaseAdmin();
  const { error } = await s.from(T.appUsers).delete().eq('id', num);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}