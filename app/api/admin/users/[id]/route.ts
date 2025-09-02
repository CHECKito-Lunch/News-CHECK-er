// app/api/admin/users/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

type Role = 'admin' | 'moderator' | 'user';

function toId(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// GET /api/admin/users/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const num = toId(id);
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
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const num = toId(id);
  if (!num) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const body = await req.json().catch(
    () => ({} as Partial<{ email: string; name: string | null; role: Role; active: boolean }>)
  );

  const update: Record<string, unknown> = {};
  if (typeof body.email === 'string') update.email = body.email.trim().toLowerCase();
  if ('name' in body) update.name = (body.name ?? '') === '' ? null : body.name;
  if (typeof body.role === 'string' && ['admin','moderator','user'].includes(body.role)) update.role = body.role as Role;
  if (typeof body.active === 'boolean') update.active = body.active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nichts zu aktualisieren.' }, { status: 400 });
  }

  const s = supabaseAdmin();
  const { error } = await s.from(T.appUsers).update(update).eq('id', num);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/users/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const num = toId(id);
  if (!num) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const s = supabaseAdmin();
  const { error } = await s.from(T.appUsers).delete().eq('id', num);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
