// app/api/admin/badges/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

// id sicher aus der URL (/api/admin/badges/[id]) lesen
function getId(req: NextRequest): number {
  const last = req.nextUrl.pathname.split('/').pop() || '';
  const id = Number(last);
  if (!Number.isFinite(id)) throw new Error('Invalid id');
  return id;
}

export async function PATCH(req: NextRequest) {
  try {
    const id = getId(req);
    const patch = await req.json(); // { name?, color?, kind? }

    const s = supabaseAdmin();
    const { error } = await s.from(T.badges).update(patch).eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = getId(req);

    const s = supabaseAdmin();
    const { error } = await s.from(T.badges).delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
