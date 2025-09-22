// app/api/groups/mine/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withAuth } from '@/lib/with-auth';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

type Row = {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  isMember: true;
};

export const GET = withAuth(async (_req, _ctx, me) => {
  const rows: Row[] = await sql<Row[]>`
    select
      g.id,
      g.name,
      g.description,
      coalesce(mc.member_count, 0)::int as "memberCount",
      true as "isMember"
    from group_members m
    join groups g on g.id = m.group_id
    left join (
      select group_id, count(*)::int as member_count
      from group_members
      group by group_id
    ) mc on mc.group_id = g.id
    where m.user_id::text = ${me.sub}
      and g.is_active = true
    order by g.name asc
  `;

  // optional: zusätzlich IDs für Legacy-Clients
  return json({
    ok: true,
    data: rows,
    groupIds: rows.map((r: Row) => r.id), // TS7006 fix
  });
});
