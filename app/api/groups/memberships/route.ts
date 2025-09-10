export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { sql } from '@/lib/db';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function GET(req: Request) {
  try {
    const me = await requireUser(req);
    const rows = await sql<{group_id:number}[]>`
      select group_id from public.group_members where user_id = ${me.userId}
    `;
    return json({ ok:true, groupIds: rows.map(r => r.group_id) });
  } catch {
    return json({ ok:false, error:'unauthorized' }, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const b = await req.json().catch(() => ({}));
    const groupId = Number(b?.groupId ?? 0);
    const action = String(b?.action ?? '');

    if (!groupId || !['join','leave'].includes(action)) {
      return json({ ok:false, error:'bad_request' }, 400);
    }

    // private Gruppe nur mit Einladung zulassen (einfacher Check)
    const [g] = await sql<{is_private:boolean}[]>`
      select is_private from public.groups where id = ${groupId} and is_active = true limit 1
    `;
    if (!g) return json({ ok:false, error:'not_found' }, 404);

    if (action === 'join') {
      if (g.is_private) {
        const [inv] = await sql<{id:number}[]>`
          select id from public.group_invitations
          where group_id = ${groupId}
            and (invited_user_id = ${me.userId}
              or (invited_email is not null and lower(invited_email) = lower(${me.email ?? ''})))
          limit 1
        `;
        if (!inv) return json({ ok:false, error:'private_group' }, 403);
      }
      await sql`insert into public.group_members (group_id, user_id) values (${groupId}, ${me.userId})
                on conflict (group_id, user_id) do nothing`;
      return json({ ok:true });
    } else {
      await sql`delete from public.group_members where group_id=${groupId} and user_id=${me.userId}`;
      return json({ ok:true });
    }
  } catch {
    return json({ ok:false, error:'unauthorized' }, 401);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const b = await req.json().catch(() => ({}));
    const groupIds = Array.isArray(b?.groupIds) ? b.groupIds.map(Number).filter(Boolean) : [];

    await sql`delete from public.group_members where user_id=${me.userId}`;
    if (groupIds.length) {
      await sql`insert into public.group_members (group_id, user_id)
                select * from unnest(${groupIds}::int[], array_fill(${me.userId}, array[${groupIds.length}]))`;
    }
    return json({ ok:true });
  } catch {
    return json({ ok:false, error:'unauthorized' }, 401);
  }
}
