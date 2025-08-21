import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = supabaseAdmin();
  const id = Number(params.id);
  const patch = await req.json(); // { name?: string }
  const { error } = await s.from(T.vendors).update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const s = supabaseAdmin();
  const id = Number(params.id);
  const { error } = await s.from(T.vendors).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}