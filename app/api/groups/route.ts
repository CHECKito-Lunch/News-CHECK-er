// app/api/groups/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req); // optional, nur um isMember zu markieren
  const { searchParams } = new URL(req.url);
  const ids = (searchParams.get('ids') ?? '')
    .split(',')
    .map(s => Number(s))
    .filter(n => Number.isFinite(n));

  // nur aktive, nicht-private Gruppen
  const rows = await sql<any[]>`
    select
      g.id, g.name, g.description,
      g.is_private,
      coalesce(mc.member_count,0)::int as member_count,
      ${user?.sub ? sql`exists(select 1 from public.group_members m where m.group_id=g.id and m.user_id=${user.sub}::uuid)` : sql`false`} as is_member
    from public.groups g
    left join (
      select group_id, count(*) as member_count
      from public.group_members
      group by group_id
    ) mc on mc.group_id = g.id
    where g.is_active = true
      and g.is_private = false
      ${ids.length ? sql`and g.id = any(${ids}::int[])` : sql``}
    order by g.name asc
  `;

  return json({
    ok: true,
    data: rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      memberCount: r.member_count,
      isMember: !!r.is_member,
    }))
  });
}
