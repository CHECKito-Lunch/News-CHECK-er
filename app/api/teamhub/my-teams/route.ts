/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/teamhub/my-teams/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: unknown, s = 200) => NextResponse.json(d, { status: s });

type Row = { team_id: string; name: string };

export async function GET(_req: NextRequest) {
  try {
    const me = await getUserFromCookies().catch(() => null);
    if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

    if (me.role !== 'teamleiter' && me.role !== 'admin') {
      return json({ ok: false, error: 'forbidden' }, 403);
    }

    const rows = await sql<Row[]>/*sql*/`
      select distinct
        t.id::text as team_id,
        coalesce(t.name, '—') as name
      from public.team_memberships tm
      join public.teams t
        on t.id = tm.team_id
      where tm.user_id = ${me.user_id}::uuid
        and tm.is_teamleiter
        and tm.active
      order by 2 asc nulls last  -- ✅ alias/Positionsindex statt t.name
    `;

    return json({ ok: true, items: rows ?? [] });
  } catch (err: any) {
    console.error('my-teams error:', err?.message || err);
    return json({ ok: false, error: err?.message ?? 'internal_error' }, 500);
  }
}
