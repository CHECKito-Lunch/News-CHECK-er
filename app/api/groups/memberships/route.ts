// app/api/groups/memberships/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const rows = await sql<{ group_id:number }[]>`
      select group_id from public.group_members where user_id = ${u.sub}::uuid
    `;
    return json({ ok:true, groupIds: rows.map(r => r.group_id) });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized' }, 401);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}

/** join/leave */
export async function POST(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const b = await req.json().catch(()=> ({}));
    const groupId = Number(b?.groupId);
    const action  = (b?.action ?? '').toString();

    if (!Number.isFinite(groupId)) return json({ ok:false, error:'invalid_group' }, 400);

    if (action === 'join') {
      await sql`insert into public.group_members (group_id, user_id)
                values (${groupId}, ${u.sub}::uuid) on conflict do nothing`;
      return json({ ok:true });
    }
    if (action === 'leave') {
      await sql`delete from public.group_members where group_id=${groupId} and user_id=${u.sub}::uuid`;
      return json({ ok:true });
    }
    return json({ ok:false, error:'invalid_action' }, 400);
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized' }, 401);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}

/** kompletten Satz speichern (Replace) */
export async function PUT(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const b = await req.json().catch(()=> ({}));
    const groupIds: number[] = Array.isArray(b?.groupIds) ? b.groupIds.map(Number).filter(Number.isFinite) : [];

    await sql.begin(async tx => {
      await tx`delete from public.group_members where user_id=${u.sub}::uuid`;
      if (groupIds.length) {
        await tx`
          insert into public.group_members (group_id, user_id)
          select x::int, ${u.sub}::uuid
          from unnest(${groupIds}::int[]) x
          on conflict do nothing
        `;
      }
    });

    return json({ ok:true });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized' }, 401);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
