/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

type TeamListItem = { id: number; name: string; memberCount: number };
type TeamListResponse = { ok: true; data: TeamListItem[]; activeTeamId: number | null };
type PostOkResponse = { ok: true; id: number };
type ErrorCode = 'unauthorized' | 'forbidden' | 'name_required' | 'name_exists' | 'db_error';
type ErrorResponse = { ok: false; error: ErrorCode };

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const json = <T extends object>(d: T, status = 200) => NextResponse.json<T>(d, { status });

/** Prüft ob User Admin, Moderator oder Teamleiter ist */
function hasAdminRights(role: string): boolean {
  return role === 'admin' || role === 'moderator' || role === 'teamleiter';
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) {
    return json<ErrorResponse>({ ok: false, error: 'unauthorized' }, 401);
  }

  // Teamleiter haben Admin-Rechte
  if (!hasAdminRights(me.role)) {
    return json<ErrorResponse>({ ok: false, error: 'forbidden' }, 403);
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const forUser = searchParams.get('for_user');

  try {
    // Admin/Moderator/Teamleiter sehen ALLE Teams
    const visibleTeams = await sql<Array<{ id: number; name: string; member_count: number }>>/*sql*/`
      with base as (
        select
          t.id,
          t.name,
          count(tm.*) filter (where tm.active) as member_count
        from public.teams t
        left join public.team_memberships tm on tm.team_id = t.id
        ${q ? sql`where t.name ilike ${'%' + q + '%'}` : sql``}
        group by t.id
      )
      select * from base
      order by name asc
    `;

    let activeTeamId: number | null = null;
    if (forUser && isUUID(forUser)) {
      const r = await sql/*sql*/`
        select team_id
        from public.team_memberships
        where user_id = ${forUser}::uuid and active = true
        limit 1
      `;
      activeTeamId = r?.[0]?.team_id ?? null;
    }

    const payload: TeamListResponse = {
      ok: true,
      data: visibleTeams.map((r: { id: any; name: any; member_count: any; }) => ({
        id: Number(r.id),
        name: r.name,
        memberCount: Number(r.member_count) || 0,
      })),
      activeTeamId,
    };

    return json<TeamListResponse>(payload);
  } catch (e: any) {
    console.error('[GET /api/admin/teams] query failed:', e);
    return json<ErrorResponse>({ ok: false, error: 'db_error' }, 500);
  }
}

export async function POST(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) {
    return json<ErrorResponse>({ ok: false, error: 'unauthorized' }, 401);
  }

  // Teamleiter haben Admin-Rechte
  if (!hasAdminRights(me.role)) {
    return json<ErrorResponse>({ ok: false, error: 'forbidden' }, 403);
  }

  let body: any = {};
  try { 
    body = await req.json(); 
  } catch {
    return json<ErrorResponse>({ ok: false, error: 'name_required' }, 400);
  }

  const name = String(body?.name ?? '').trim();
  if (!name) {
    return json<ErrorResponse>({ ok: false, error: 'name_required' }, 400);
  }

  try {
    // Prüfe auf Duplikat
    const dupe = await sql/*sql*/`
      select 1 from public.teams where lower(name) = lower(${name}) limit 1
    `;
    if (dupe.length > 0) {
      return json<ErrorResponse>({ ok: false, error: 'name_exists' }, 409);
    }

    // Erstelle Team (created_by nur wenn UUID vorhanden)
    const createdBy = isUUID(me.sub) ? me.sub : null;
    const row = await sql/*sql*/`
      insert into public.teams (name, created_by)
      values (${name}, ${createdBy ? sql`${createdBy}::uuid` : sql`null`})
      returning id
    `;

    return json<PostOkResponse>({ ok: true, id: Number(row?.[0]?.id) });
  } catch (e: any) {
    console.error('[POST /api/admin/teams] insert failed:', e);
    // 23505 = unique_violation
    return json<ErrorResponse>(
      { ok: false, error: e?.code === '23505' ? 'name_exists' : 'db_error' },
      e?.code === '23505' ? 409 : 500
    );
  }
}
