import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

type Params = { params: { id: string } };

// PATCH /api/admin/termine/:id
// body optional: { title?: string; starts_at?: string; ends_at?: string|null; all_day?: boolean; icon?: string|null; color?: string|null }
export async function PATCH(req: Request, { params }: Params) {
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });

  const s = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const patch: any = {};

  if (typeof body.title === 'string') patch.title = body.title.trim();

  if (body.starts_at !== undefined) {
    if (!body.starts_at) return NextResponse.json({ error: 'starts_at darf nicht leer sein.' }, { status: 400 });
    try {
      const iso = new Date(String(body.starts_at)).toISOString();
      patch.starts_at = iso;
      patch.date = iso.slice(0, 10); // Legacy absichern
    } catch {
      return NextResponse.json({ error: 'starts_at ist kein gültiges Datum.' }, { status: 400 });
    }
  }

  if (body.ends_at !== undefined) {
    patch.ends_at = body.ends_at === null || body.ends_at === '' ? null : new Date(String(body.ends_at)).toISOString();
  }

  if (body.all_day !== undefined) patch.all_day = !!body.all_day;
  if (body.icon !== undefined) patch.icon = typeof body.icon === 'string' && body.icon.trim() ? String(body.icon) : null;
  if (body.color !== undefined) patch.color = typeof body.color === 'string' && body.color.trim() ? String(body.color) : null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen.' }, { status: 400 });
  }

  const { error } = await s.from(T.termine).update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/termine/:id
export async function DELETE(_req: Request, { params }: Params) {
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });
  const s = supabaseAdmin();
  const { error } = await s.from(T.termine).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
