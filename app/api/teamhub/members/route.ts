/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/teamhub/members/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

export async function GET(_req: NextRequest) {
  const me = await getUserFromCookies().catch(() => null);
  if (!me) return json({ ok: false, error: 'unauthorized' }, 401);
  if (me.role !== 'teamleiter') return json({ ok: false, error: 'forbidden' }, 403);

  // alle aktiven Mitglieder aus allen Teams, die ich leite
  const rows = await sql/*sql*/`
    with my_teams as (
      select tm.team_id
      from public.team_memberships tm
      where tm.user_id = ${me.user_id}::uuid and tm.active and tm.is_teamleiter
    )
    select distinct u.user_id, coalesce(u.name, u.email, '—') as name
    from public.team_memberships m
    join my_teams t on t.team_id = m.team_id
    join public.app_users u on u.user_id = m.user_id
    where m.active and m.user_id <> ${me.user_id}::uuid
    order by name asc
  `;
  return json({ ok: true, members: rows.map((r: any) => ({ user_id: String(r.user_id), name: r.name })) });
}
