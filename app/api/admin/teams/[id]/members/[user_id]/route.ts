// app/api/teams/[id]/members/[user_id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

function parsePath(url: string): { teamId: number | null; userId: string | null } {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // .../teams/[id]/members/[user_id]
    const teamId = Number(parts[parts.length - 3]);
    const userId = parts[parts.length - 1] || null;
    return { teamId: Number.isFinite(teamId) ? teamId : null, userId };
  } catch { return { teamId: null, userId: null }; }
}

export async function PATCH(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me || (me.role !== 'admin' && me.role !== 'moderator')) {
    return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });
  }
  const { teamId, userId } = parsePath(req.url);
  if (!teamId || !isUUID(userId)) return NextResponse.json({ ok:false, error:'bad_path' }, { status:400 });

  let b: any = {};
  try { b = await req.json(); } catch {}
  const setLeader = b?.is_teamleiter as boolean | undefined;
  const setActive = b?.active as boolean | undefined;

  try {
    await sql.begin(async (tx: any) => {
      if (setActive === true) {
        // max. 1 aktives Team -> alle anderen deaktivieren
        await tx/*sql*/`
          update public.team_memberships
          set active = false
          where user_id = ${userId}::uuid and team_id <> ${teamId} and active = true
        `;
      }
      await tx/*sql*/`
        insert into public.team_memberships (team_id, user_id, is_teamleiter, active)
        values (${teamId}, ${userId}::uuid, coalesce(${setLeader}::boolean, false), coalesce(${setActive}::boolean, true))
        on conflict (team_id, user_id)
        do update set
          is_teamleiter = coalesce(${setLeader}::boolean, public.team_memberships.is_teamleiter),
          active = coalesce(${setActive}::boolean, public.team_memberships.active)
      `;
    });
    return NextResponse.json({ ok:true });
  } catch (e) {
    console.error('member patch failed', e);
    return NextResponse.json({ ok:false, error:'db_error' }, { status:500 });
  }
}
