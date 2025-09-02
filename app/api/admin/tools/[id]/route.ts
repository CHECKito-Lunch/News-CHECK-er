// app/api/admin/tools/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

// PATCH /api/admin/tools/:id
// body: { title?, href?, icon?, sort? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const patch: Partial<{ title: string; href: string; icon: string | null; sort: number }> = {};

  if (typeof body.title === 'string') {
    const v = body.title.trim();
    if (!v) return NextResponse.json({ error: 'title darf nicht leer sein.' }, { status: 400 });
    patch.title = v;
  }

  if (typeof body.href === 'string') {
    const v = body.href.trim();
    if (!v) return NextResponse.json({ error: 'href darf nicht leer sein.' }, { status: 400 });
    patch.href = v;
  }

  if ('icon' in body) {
    const v = String((body as any).icon ?? '').trim();
    patch.icon = v ? v : null;
  }

  if ('sort' in body) {
    const n = Number((body as any).sort);
    patch.sort = Number.isFinite(n) ? n : 0;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen übergeben.' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.from(T.tools).update(patch).eq('id', numId).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data!.id });
}

// DELETE /api/admin/tools/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db.from(T.tools).delete().eq('id', numId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
