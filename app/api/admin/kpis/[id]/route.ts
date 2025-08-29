import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

// PATCH /api/admin/kpis/[id]
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = supabaseAdmin();
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const patch = await req.json().catch(() => ({}));
  const { error } = await s.from(T.kpis).update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/kpis/[id]
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const s = supabaseAdmin();
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const { error } = await s.from(T.kpis).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}