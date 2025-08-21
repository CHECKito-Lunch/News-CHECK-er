import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = supabaseAdmin();
  const patch = await req.json(); // { name?, color? }
  const { error } = await s.from(T.categories).update(patch).eq('id', Number(params.id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const s = supabaseAdmin();
  const { error } = await s.from(T.categories).delete().eq('id', Number(params.id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
