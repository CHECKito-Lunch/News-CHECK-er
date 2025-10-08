// app/api/me/team/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const me = await getUserFromCookies(req);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const head = await sql/*sql*/`
    select t.id, t.name
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = ${me.sub}::uuid and tm.active = true
    limit 1
  `;
  const team = head?.[0] ?? null;
  if (!team) return NextResponse.json({ ok:true, team: null, members: [] });

  const members = await sql/*sql*/`
    select tm.user_id::text, tm.is_teamleiter, tm.active, u.email, u.name
    from public.team_memberships tm
    left join public.app_users u on u.user_id = tm.user_id
    where tm.team_id = ${team.id}
    order by u.name nulls last, u.email
  `;
  return NextResponse.json({ ok:true, team, members });
}
