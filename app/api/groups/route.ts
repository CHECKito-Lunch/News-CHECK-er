// app/api/groups/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';
const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req);

    const rows = await sql<any[]>`
      with mc as (
        select group_id, count(*)::int as member_count
          from public.group_members
         group by group_id
      )
      select g.id, g.name, g.description,
             coalesce(mc.member_count,0) as "memberCount",
             true as "isMember"
        from public.group_members m
        join public.groups g on g.id = m.group_id
   left join mc on mc.group_id = g.id
       where m.user_id = ${me.sub}::uuid
       order by g.name asc
    `;

    return json({ ok:true, data: rows });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized', data: [] }, 200);
    console.error('[groups GET]', e);
    return json({ ok:true, data: [] }, 200);
  }
}
