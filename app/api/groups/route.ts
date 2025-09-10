export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { sql } from '@/lib/db';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function GET(req: Request) {
  try {
    const me = await requireUser(req);

    // Meine Gruppen
    const my = await sql<{group_id:number}[]>`
      select group_id from public.group_members
      where user_id = ${me.userId}
    `;
    const myIds = new Set(my.map(x => x.group_id));

    // Alle aktiven Gruppen + Membercount
    const rows = await sql<any[]>`
      select
        g.id, g.name, g.description, g.is_private, g.is_active,
        coalesce(mc.member_count,0)::int as member_count
      from public.groups g
      left join (
        select group_id, count(*) as member_count
        from public.group_members
        group by group_id
      ) mc on mc.group_id = g.id
      where g.is_active = true
      order by g.name asc
    `;

    const data = rows
      // private nur, wenn Mitglied
      .filter(r => !r.is_private || myIds.has(r.id))
      .map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        memberCount: r.member_count,
        isMember: myIds.has(r.id),
      }));

    return json({ ok:true, data });
  } catch {
    return json({ ok:false, error:'unauthorized' }, 401);
  }
}
