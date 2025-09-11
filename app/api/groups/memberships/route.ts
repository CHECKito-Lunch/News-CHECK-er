// app/api/groups/memberships/route.ts
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
      select m.group_id as "groupId",
             g.name     as "groupName",
             m.role,
             m.joined_at as "joinedAt"
        from public.group_members m
        join public.groups g on g.id = m.group_id
       where m.user_id = ${me.sub}::uuid
       order by g.name asc
    `;

    return json({ ok:true, memberships: rows });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized', memberships: [] }, 200);
    console.error('[groups/memberships GET]', e);
    return json({ ok:true, memberships: [] }, 200);
  }
}
