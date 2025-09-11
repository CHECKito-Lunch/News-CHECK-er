// app/api/groups/mine/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const rows = await sql<any[]>`
      select g.id, g.name, g.description,
             coalesce(mc.member_count,0)::int as member_count
      from public.group_members m
      join public.groups g on g.id = m.group_id
      left join (
        select group_id, count(*) as member_count
        from public.group_members
        group by group_id
      ) mc on mc.group_id = g.id
      where m.user_id = ${u.sub}::uuid
      order by g.name asc
    `;
    return json({ ok:true, data: rows.map(r => ({
      id: r.id, name: r.name, description: r.description,
      memberCount: r.member_count, isMember: true
    }))});
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized' }, 401);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
