// app/api/groups/mine/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

type Row = {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
};

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req);
    if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

    const rows = await sql<Row[]>`
      select
        g.id,
        g.name,
        g.description,
        coalesce(mc.member_count, 0)::int as "memberCount"
      from public.group_members m
      join public.groups g on g.id = m.group_id
      left join (
        select group_id, count(*)::int as member_count
        from public.group_members
        group by group_id
      ) mc on mc.group_id = g.id
      where m.user_id::text = ${me.sub}
        and g.is_active = true
      order by g.name asc
    `;

    // Frontend erwartet isMember=true
    const data = rows.map(r => ({ ...r, isMember: true }));

    return json({ ok: true, data });
  } catch (e) {
    console.error('[groups/mine GET]', e);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
