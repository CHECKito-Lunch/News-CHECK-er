// app/api/checkiade/teams/[id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

function parseId(ctx: any): number | null {
  const raw = ctx?.params?.id;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function PUT(req: Request, context: any) {
  const me = await requireUser(req as any);
  if (!me || (me.role !== 'admin' && me.role !== 'moderator')) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const id = parseId(context);
  if (id === null) return json({ ok: false, error: 'invalid_id' }, 400);

  const body = await req.json().catch(() => ({} as any));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return json({ ok: false, error: 'name_required' }, 400);

  try {
    const [row] = await sql<any[]>/*sql*/`
      update public.checkiade_teams
         set name = ${name}, updated_at = now()
       where id = ${id}
       returning id, name, created_at, updated_at
    `;
    if (!row) return json({ ok: false, error: 'not_found' }, 404);
    return json({ ok: true, item: row });
  } catch (e: any) {
    console.error('[teams PUT]', e);
    return json({ ok: false, error: e?.message ?? 'server_error' }, 500);
  }
}

export async function DELETE(req: Request, context: any) {
  const me = await requireUser(req as any);
  if (!me || (me.role !== 'admin' && me.role !== 'moderator')) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const id = parseId(context);
  if (id === null) return json({ ok: false, error: 'invalid_id' }, 400);

  try {
    await sql/*sql*/`delete from public.checkiade_teams where id = ${id}`;
    return json({ ok: true, deleted: 1 });
  } catch (e: any) {
    console.error('[teams DELETE]', e);
    return json({ ok: false, error: e?.message ?? 'server_error' }, 500);
  }
}
