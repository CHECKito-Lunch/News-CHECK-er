import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

// PATCH /api/admin/tools/:id
// body: { title?, href?, icon?, sort? }
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = supabaseAdmin();
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patch: any = {};

  if (typeof body.title === 'string') {
    const v = body.title.trim(); if (!v) return NextResponse.json({ error: 'title darf nicht leer sein.' }, { status: 400 });
    patch.title = v;
  }
  if (typeof body.href === 'string') {
    const v = body.href.trim(); if (!v) return NextResponse.json({ error: 'href darf nicht leer sein.' }, { status: 400 });
    patch.href = v;
  }
  if ('icon' in body) patch.icon = body.icon == null ? null : String(body.icon);
  if ('sort' in body) patch.sort = Number.isFinite(Number(body.sort)) ? Number(body.sort) : 0;

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Keine Änderungen übergeben.' }, { status: 400 });

  const { data, error } = await s.from(T.tools).update(patch).eq('id', id).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

// DELETE /api/admin/tools/:id
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const s = supabaseAdmin();
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });

  const { error } = await s.from(T.tools).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
