/* eslint-disable @typescript-eslint/no-explicit-any */
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
    const id = Number(parts[parts.length - 2]);
    return Number.isFinite(id) ? id : null;
  } catch { 
    return null; 
  }
}

/** Prüft ob User Admin, Moderator oder Teamleiter ist */
function hasAdminRights(role: string): boolean {
  return role === 'admin' || role === 'moderator' || role === 'teamleiter';
}

export async function GET(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Teamleiter haben Admin-Rechte
  if (!hasAdminRights(me.role)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const teamId = getTeamId(req.url);
  if (!teamId) {
    return NextResponse.json({ ok: false, error: 'bad_id' }, { status: 400 });
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

  return NextResponse.json({ ok: true, members: rows });
}

export async function POST(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Teamleiter haben Admin-Rechte
  if (!hasAdminRights(me.role)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const teamId = getTeamId(req.url);
  if (!teamId) {
    return NextResponse.json({ ok: false, error: 'bad_id' }, { status: 400 });
  }

  let body: any = {};
  try { 
    body = await req.json(); 
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const members: Array<{ user_id: string; is_teamleiter?: boolean }> =
    Array.isArray(body?.members) ? body.members : [];

  const cleaned = members
    .filter((m) => isUUID(m?.user_id))
    .map((m) => ({ user_id: m.user_id, is_teamleiter: !!m.is_teamleiter }));

  try {
    await sql.begin(async (tx: any) => {
      // 1. Lösche alle bisherigen Mitglieder dieses Teams
      await tx/*sql*/`delete from public.team_memberships where team_id = ${teamId}`;

      // 2. Für jeden neuen Member: deaktiviere andere aktive Teams und füge ein
      for (const m of cleaned) {
        // Deaktiviere andere aktive Teams für diesen User
        await tx/*sql*/`
          update public.team_memberships
          set active = false
          where user_id = ${m.user_id}::uuid 
            and team_id != ${teamId}
            and active = true
        `;

        // Füge Member zum aktuellen Team hinzu
        await tx/*sql*/`
          insert into public.team_memberships (team_id, user_id, is_teamleiter, active)
          values (${teamId}, ${m.user_id}::uuid, ${m.is_teamleiter}, true)
          on conflict (team_id, user_id)
          do update set 
            is_teamleiter = excluded.is_teamleiter, 
            active = true
        `;
      }
    });

    return NextResponse.json({ ok: true, count: cleaned.length });
  } catch (e: any) {
    console.error('[POST /api/admin/teams/:id/members] bulk replace failed:', e);
    return NextResponse.json({ 
      ok: false, 
      error: 'db_error',
      details: e?.message 
    }, { status: 500 });
  }
}
