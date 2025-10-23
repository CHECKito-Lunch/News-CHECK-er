/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: unknown, s=200) => NextResponse.json(d, { status:s });

/**
 * 🔥 Intelligentes Name-Matching (identisch zur anderen Route)
 */
function normalizeNameForMatching(name: string): string[] {
  const clean = name.trim().replace(/\s+/g, ' ');
  const parts = clean.split(' ');
  const variants = new Set<string>();
  
  variants.add(clean.toLowerCase());
  
  if (parts.length >= 2) {
    variants.add(parts.reverse().join(' ').toLowerCase());
    parts.reverse();
  }
  
  const wordSet = parts.map(p => p.toLowerCase()).join('|');
  variants.add(wordSet);
  
  return Array.from(variants);
}

function namesMatch(name1: string, name2: string): boolean {
  const variants1 = normalizeNameForMatching(name1);
  const variants2 = normalizeNameForMatching(name2);
  
  for (const v1 of variants1) {
    for (const v2 of variants2) {
      if (v1 === v2) return true;
    }
  }
  
  const words1 = name1.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const words2 = name2.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const matches = words1.filter(w => words2.includes(w));
  
  return matches.length >= Math.min(2, Math.min(words1.length, words2.length));
}

/**
 * 🔥 Auto-Link Funktion für diese Route
 */
async function autoLinkRosterUsersForTeam(teamId: number) {
  try {
    // 1. Hole unverknüpfte Einträge für dieses Team
    const unlinked = await sql<{ id: number; employee_name: string }[]>`
      select id, employee_name
      from public.team_roster
      where team_id = ${teamId}::bigint
        and user_id is null
        and employee_name is not null
      limit 100
    `;

    if (!unlinked || unlinked.length === 0) return;

    // 2. Hole alle app_users
    const users = await sql<{ user_id: string; name: string; email: string }[]>`
      select user_id::text, name, email
      from public.app_users
      where name is not null
    `;

    if (!users || users.length === 0) return;

    // 3. Intelligentes Matching
    const updates: Array<{ id: number; user_id: string }> = [];

    for (const roster of unlinked) {
      const rosterName = roster.employee_name;
      if (!rosterName) continue;

      const match = users.find((u: { name: string; }) => namesMatch(rosterName, u.name));
      
      if (match) {
        updates.push({ id: roster.id, user_id: match.user_id });
        console.log(`[teamhub/roster] Match: "${rosterName}" -> "${match.name}" (${match.email})`);
      }
    }

    // 4. Batch-Update
    if (updates.length > 0) {
      for (const { id, user_id } of updates) {
        await sql`
          update public.team_roster
          set user_id = ${user_id}::uuid
          where id = ${id}
        `;
      }
      console.log(`[teamhub/roster] Auto-linked ${updates.length} users for team ${teamId}`);
    }
  } catch (e) {
    console.error('[teamhub/roster] Auto-link failed:', e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const me = await getUserFromCookies().catch(()=>null);
    if (!me) return json({ ok:false, error:'unauthorized' }, 401);

    const u = new URL(req.url);
    const teamId = Number(u.searchParams.get('team_id') ?? NaN);
    const from   = u.searchParams.get('from');
    const to     = u.searchParams.get('to');

    if (!Number.isFinite(teamId) || !teamId) return json({ ok:false, error:'invalid team_id' }, 400);
    if (!from || !to) return json({ ok:false, error:'missing range' }, 400);

    // Berechtigung
    const can = await sql<{ok:boolean}[]>`
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

    // 🔥 NEUE LOGIK: Auto-Link vor dem Query
    await autoLinkRosterUsersForTeam(teamId);

    // Daten holen & aufbereiten
    const rows = await sql<any[]>`
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
        case
          when lower(coalesce(status,'')) like '%feiertag%' then 'holiday'
          when start_min is not null and end_min is not null then 'work'
          when lower(coalesce(status,'')) ~ '(urlaub|krank|terminblocker)' then 'absent'
          when lower(coalesce(status,'')) like '%frei%' then 'free'
          else 'free'
        end as kind,
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
