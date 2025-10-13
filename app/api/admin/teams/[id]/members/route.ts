/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/teams/[id]/members/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

function getTeamId(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // .../teams/[id]/members
    const id = Number(parts[parts.length - 2]);
    return Number.isFinite(id) ? id : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const teamId = getTeamId(req.url);
  if (!teamId) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  // Zugriff: admin/mod immer; teamleiter nur für Teams, in denen er Mitglied ist
  if (!me || (me.role !== 'admin' && me.role !== 'moderator' && me.role !== 'teamleiter')) {
    const r = await sql/*sql*/`
      select 1 from public.team_memberships
      where team_id = ${teamId} and user_id = ${me.sub}::uuid
      limit 1
    `;
    if (!r?.length) return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });
  }

  const rows = await sql/*sql*/`
    select
      tm.user_id::text,
      tm.is_teamleiter,
      tm.active,
      tm.assigned_at,
      u.email,
      u.name
    from public.team_memberships tm
    left join public.app_users u on u.user_id = tm.user_id
    where tm.team_id = ${teamId}
    order by u.name nulls last, u.email asc
  `;

  return NextResponse.json({ ok:true, members: rows });
}

/** POST = BULK-REPLACE Mitglieder dieses Teams
 * Body: { members: [{ user_id: uuid, is_teamleiter?: boolean }] }
 * Garantiert "max 1 aktives Team pro User" (deaktiviert vorherige akt. Mitgliedschaft).
 */
export async function POST(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me || (me.role !== 'admin' && me.role !== 'moderator' && me.role !== 'teamleiter')) {
    return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });
  }
  const teamId = getTeamId(req.url);
  if (!teamId) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const members: Array<{ user_id: string; is_teamleiter?: boolean }> =
    Array.isArray(body?.members) ? body.members : [];

  const cleaned = members
    .filter((m) => isUUID(m?.user_id))
    .map((m) => ({ user_id: m.user_id, is_teamleiter: !!m.is_teamleiter }));

  try {
    await sql.begin(async (tx: any) => {
      // 1) Vorhandene Mitgliedschaften des Teams löschen (wir ersetzen komplett)
      await tx/*sql*/`delete from public.team_memberships where team_id = ${teamId}`;

      // 2) Insert jedes Mitglied; vorher andere aktive Teams des Users deaktivieren
      for (const m of cleaned) {
        await tx/*sql*/`
          update public.team_memberships
          set active = false
          where user_id = ${m.user_id}::uuid and active = true
        `;

        await tx/*sql*/`
          insert into public.team_memberships (team_id, user_id, is_teamleiter, active)
          values (${teamId}, ${m.user_id}::uuid, ${m.is_teamleiter}, true)
          on conflict (team_id, user_id)
          do update set is_teamleiter = excluded.is_teamleiter, active = true
        `;
      }
    });
    return NextResponse.json({ ok:true, count: cleaned.length });
  } catch (e) {
    console.error('bulk replace members failed', e);
    return NextResponse.json({ ok:false, error:'db_error' }, { status:500 });
  }
}
