// app/api/me/invitations/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d, { status:s });

export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const rows = await sql<any[]>`
      select
        i.id,
        i.group_id,
        g.name as group_name,
        i.message,
        i.created_at,
        i.invited_by,
        p.name  as invited_by_name,
        p.email as invited_by_email
      from public.group_invitations i
      join public.groups g on g.id = i.group_id
      left join public.user_profiles p on p.user_id = i.invited_by
      where i.invited_user = ${u.sub}::uuid
        and coalesce(i.status,'pending') = 'pending'
      order by i.created_at desc
    `;
    return json({ ok:true, items: rows });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized' }, 401);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
