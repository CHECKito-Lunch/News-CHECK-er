export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const me = await getUserFromCookies(req).catch(() => null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const rows = await sql/*sql*/`
    select t.id, t.name, tm.is_teamleiter, tm.active,
           coalesce(json_agg(json_build_object(
             'user_id', tm2.user_id,
             'is_teamleiter', tm2.is_teamleiter,
             'active', tm2.active
           ) order by tm2.is_teamleiter desc) filter (where tm2.user_id is not null), '[]'::json) as members
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    left join public.team_memberships tm2 on tm2.team_id = tm.team_id and tm2.active
    where tm.user_id = ${me.user_id}::uuid and tm.active
    group by t.id, tm.is_teamleiter, tm.active
    limit 1
  `;
  return NextResponse.json({ ok:true, item: rows[0] ?? null });
}
