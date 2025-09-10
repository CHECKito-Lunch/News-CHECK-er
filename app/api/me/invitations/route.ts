export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { sql } from '@/lib/db';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function GET(req: Request) {
  try {
    const me = await requireUser(req);
    const rows = await sql<any[]>`
      select
        i.id,
        i.group_id,
        g.name as group_name,
        i.message,
        i.created_at,
        i.invited_by,
        u.name  as invited_by_name,
        u.email as invited_by_email
      from public.group_invitations i
      join public.groups g on g.id = i.group_id
      left join public.app_users u on u.user_id = i.invited_by
      where i.invited_user_id = ${me.userId}
         or (i.invited_email is not null and lower(i.invited_email) = lower(${me.email ?? ''}))
      order by i.created_at desc
    `;
    const items = rows.map(r => ({
      id: r.id,
      group_id: Number(r.group_id),
      group_name: r.group_name,
      message: r.message,
      created_at: r.created_at,
      invited_by: r.invited_by,
      invited_by_name: r.invited_by_name,
      invited_by_email: r.invited_by_email,
    }));
    return json({ ok:true, items });
  } catch {
    return json({ ok:false, error:'unauthorized' }, 401);
  }
}
