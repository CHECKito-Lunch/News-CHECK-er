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
      select gi.id,
             gi.group_id,
             g.name as group_name,
             gi.message,
             gi.created_at
        from public.group_invitations gi
   left join public.groups g on g.id = gi.group_id
       where gi.invited_user_id = ${me.sub}::uuid
         and gi.accepted_at is null
         and gi.declined_at is null
         and gi.revoked_at is null
       order by gi.created_at desc
    `;

    return json({ ok: true, items: rows });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized', items: [] }, 200);
    console.error('[me/invitations GET]', e);
    return json({ ok:true, items: [] }, 200);
  }
}
