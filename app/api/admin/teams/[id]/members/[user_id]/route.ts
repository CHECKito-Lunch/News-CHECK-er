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

function parsePath(url: string): { teamId: number | null; userId: string | null } {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // .../teams/[id]/members/[user_id]
    const teamId = Number(parts[parts.length - 3]);
    const userId = parts[parts.length - 1] || null;
    return { 
      teamId: Number.isFinite(teamId) ? teamId : null, 
      userId 
    };
  } catch { 
    return { teamId: null, userId: null }; 
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

  const { teamId, userId } = parsePath(req.url);
  if (!teamId || !isUUID(userId)) {
    return NextResponse.json({ ok: false, error: 'bad_path' }, { status: 400 });
  }

  try {
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
      where tm.team_id = ${teamId} and tm.user_id = ${userId}::uuid
      limit 1
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, member: rows[0] });
  } catch (e: any) {
    console.error('[GET /api/admin/teams/:id/members/:user_id] query failed:', e);
    return NextResponse.json({ 
      ok: false, 
      error: 'db_error',
      details: e?.message 
    }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Teamleiter haben Admin-Rechte
  if (!hasAdminRights(me.role)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const { teamId, userId } = parsePath(req.url);
  if (!teamId || !isUUID(userId)) {
    return NextResponse.json({ ok: false, error: 'bad_path' }, { status: 400 });
  }

  let body: any = {};
  try { 
    body = await req.json(); 
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const setLeader = body?.is_teamleiter as boolean | undefined;
  const setActive = body?.active as boolean | undefined;

  try {
    await sql.begin(async (tx: any) => {
      // Wenn aktiv gesetzt wird: max. 1 aktives Team pro User -> andere deaktivieren
      if (setActive === true) {
        await tx/*sql*/`
          update public.team_memberships
          set active = false
          where user_id = ${userId}::uuid 
            and team_id != ${teamId} 
            and active = true
        `;
      }

      // Membership updaten oder erstellen
      await tx/*sql*/`
        insert into public.team_memberships (team_id, user_id, is_teamleiter, active)
        values (
          ${teamId}, 
          ${userId}::uuid, 
          coalesce(${setLeader}::boolean, false), 
          coalesce(${setActive}::boolean, true)
        )
        on conflict (team_id, user_id)
        do update set
          is_teamleiter = coalesce(${setLeader}::boolean, public.team_memberships.is_teamleiter),
          active = coalesce(${setActive}::boolean, public.team_memberships.active)
      `;
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[PATCH /api/admin/teams/:id/members/:user_id] update failed:', e);
    return NextResponse.json({ 
      ok: false, 
      error: 'db_error',
      details: e?.message 
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Teamleiter haben Admin-Rechte
  if (!hasAdminRights(me.role)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const { teamId, userId } = parsePath(req.url);
  if (!teamId || !isUUID(userId)) {
    return NextResponse.json({ ok: false, error: 'bad_path' }, { status: 400 });
  }

  try {
    await sql/*sql*/`
      delete from public.team_memberships 
      where team_id = ${teamId} and user_id = ${userId}::uuid
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[DELETE /api/admin/teams/:id/members/:user_id] delete failed:', e);
    return NextResponse.json({ 
      ok: false, 
      error: 'db_error',
      details: e?.message 
    }, { status: 500 });
  }
}
