// app/api/invitations/[id]/decline/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await requireUser(req);                // <-- HIER: req übergeben
    const id = Number(params.id);
    if (!Number.isFinite(id)) return json({ ok: false, error: 'bad_id' }, 400);

    const rows = await sql<{ id: number }[]>`
      update public.group_invitations
         set status = 'declined'
       where id = ${id}
         and invited_user = ${me.sub}::uuid
         and coalesce(status,'pending') = 'pending'
      returning id
    `;
    if (rows.length === 0) return json({ ok: false, error: 'not_found' }, 404);

    return json({ ok: true });
  } catch (e: any) {
    if (e?.message === 'unauthorized') return json({ ok: false, error: 'unauthorized' }, 401);
    console.error('[invitations decline]', e);
    return json({ ok: false, error: e?.message ?? 'server_error' }, 500);
  }
}
