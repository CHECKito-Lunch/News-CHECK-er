// app/api/me/invitations/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d, { status: s });

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const rows = await sql<any[]>`
      select i.id, i.group_id, g.name as group_name, i.created_at, i.status
        from public.invitations i
   left join public.groups g on g.id = i.group_id
       where i.invited_user_id = ${me.sub}::uuid
         and i.status = 'pending'
       order by i.created_at desc
    `;
    return json({ ok: true, items: rows });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized', items: [] }, 200);
    console.error('[me/invitations GET]', e);
    return json({ ok:true, items: [] }, 200); // nie 500
  }
}
