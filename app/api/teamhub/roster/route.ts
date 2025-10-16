/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: unknown, s=200) => NextResponse.json(d, { status: s });

function toISODateOnly(d: string | null): string | null {
  if (!d) return null;
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t.toISOString().slice(0,10);
}

export async function GET(req: NextRequest) {
  try {
    const me = await getUserFromCookies().catch(()=>null);
    if (!me) return json({ ok:false, error:'unauthorized' }, 401);
    if (me.role!=='teamleiter' && me.role!=='admin') return json({ ok:false, error:'forbidden' }, 403);

    const { searchParams } = new URL(req.url);
    const teamId = Number(searchParams.get('team_id'));
    const fromISO = toISODateOnly(searchParams.get('from'));
    const toISO   = toISODateOnly(searchParams.get('to'));

    if (!Number.isFinite(teamId)) return json({ ok:false, error:'bad_team_id' }, 400);

    if (me.role !== 'admin') {
      const can = await sql<{ ok:boolean }[]>/*sql*/`
        select exists(
          select 1 from public.team_memberships tm
          where tm.user_id = ${me.user_id}::uuid
            and tm.team_id = ${teamId}::bigint
            and tm.is_teamleiter
            and tm.active
        ) as ok
      `;
      if (!can?.[0]?.ok) return json({ ok:false, error:'forbidden' }, 403);
    }

    let q = sql/*sql*/`
      select
        r.id::text,
        r.user_id::text,
        a.name as user_name,
        r.day,
        r.start_min,
        r.end_min,
        r.minutes_worked,
        r.label,
        r.kind,
        r.note
      from public.team_roster_entries r
      join public.app_users a on a.user_id = r.user_id
      where r.team_id = ${teamId}::bigint
    `;
    if (fromISO) q = sql`${q} and r.day >= ${fromISO}::date`;
    if (toISO)   q = sql`${q} and r.day < (${toISO}::date + interval '1 day')`;
    q = sql`${q} order by r.day asc, a.name asc nulls last`;

    const rows = await q;
    return json({ ok:true, items: rows ?? [] });
  } catch (e:any) {
    console.error('[teamhub/roster GET]', e);
    return json({ ok:false, error:'internal' }, 500);
  }
}
