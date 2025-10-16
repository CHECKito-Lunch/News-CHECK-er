/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: unknown, s=200) => NextResponse.json(d, { status:s });

export async function GET(req: NextRequest) {
  try {
    const me = await getUserFromCookies().catch(()=>null);
    if (!me) return json({ ok:false, error:'unauthorized' }, 401);

    const u = new URL(req.url);
    const teamId = Number(u.searchParams.get('team_id') ?? NaN);
    const from   = u.searchParams.get('from'); // YYYY-MM-DD
    const to     = u.searchParams.get('to');   // YYYY-MM-DD

    if (!Number.isFinite(teamId) || !teamId) return json({ ok:false, error:'invalid team_id' }, 400);
    if (!from || !to) return json({ ok:false, error:'missing range' }, 400);

    // Berechtigung: Teamleiter dieses Teams (oder Admin)
    const can = await sql<{ok:boolean}[]>/*sql*/`
      select exists(
        select 1
        from public.team_memberships tm
        where tm.team_id = ${teamId}::bigint
          and tm.user_id = ${me.user_id}::uuid
          and tm.is_teamleiter
          and tm.active
      ) as ok
    `;
    if (!can?.[0]?.ok && me.role !== 'admin') return json({ ok:false, error:'forbidden' }, 403);

    // Daten holen & aufbereiten
    const rows = await sql<any[]>/*sql*/`
      with base as (
        select
          r.id,
          r.team_id,
          r.roster_date::date as day,
          r.start_time,
          r.end_time,
          r.role,
          r.status,
          r.raw_cell,
          r.user_id,
          r.employee_name
        from public.team_roster r
        where r.team_id = ${teamId}::bigint
          and r.roster_date::date >= ${from}::date
          and r.roster_date::date <= ${to}::date
      ), with_user as (
        select
          b.*,
          u.name as app_name,
          u.email as app_email
        from base b
        left join public.app_users u
          on u.user_id = b.user_id
      ), calc as (
        select
          id::text as id,
          coalesce(user_id::text, null) as user_id,
          coalesce(app_name, app_email, employee_name, '—') as user_name,
          day::text as day,
          case when start_time is not null
               then (extract(hour from start_time)::int*60 + extract(minute from start_time)::int)
               else null end as start_min,
          case when end_time is not null
               then (extract(hour from end_time)::int*60 + extract(minute from end_time)::int)
               else null end as end_min,
          -- Minuten unter Berücksichtigung von "über Mitternacht" (end < start)
          case when start_time is not null and end_time is not null then
            ((case when end_time < start_time then 24*60 else 0 end)
              + (extract(hour from end_time)::int*60 + extract(minute from end_time)::int)
              - (extract(hour from start_time)::int*60 + extract(minute from start_time)::int))
          else null end as minutes_worked,
          role as label,
          status,
          raw_cell
        from with_user
      )
      select
        id,
        user_id,
        user_name,
        day,
        start_min,
        end_min,
        minutes_worked,
        label,
        -- kind: work/absent/holiday/free
        case
          when lower(coalesce(status,'')) like '%feiertag%' then 'holiday'
          when start_min is not null and end_min is not null then 'work'
          when lower(coalesce(status,'')) ~ '(urlaub|krank|terminblocker)' then 'absent'
          when lower(coalesce(status,'')) like '%frei%' then 'free'
          else 'free'
        end as kind,
        -- note: Status (fallback: raw text wenn vorhanden)
        case
          when coalesce(status,'') <> '' then status
          when coalesce(raw_cell,'') <> '' then raw_cell
          else null
        end as note
      from calc
      order by day asc, user_name asc, id asc
    `;

    return json({ ok:true, items: rows ?? [] });
  } catch (e:any) {
    console.error('[teamhub/roster GET]', e);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
