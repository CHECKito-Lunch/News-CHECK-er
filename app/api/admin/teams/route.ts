/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/teams/route.ts
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
type ErrorCode = 'unauthorized' | 'bad_subject' | 'forbidden' | 'name_required' | 'name_exists' | 'db_error';
type ErrorResponse = { ok: false; error: ErrorCode };

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const json = <T extends object>(d: T, status = 200) => NextResponse.json<T>(d, { status });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) return json<ErrorResponse>({ ok: false, error: 'unauthorized' }, 401);

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const forUser = searchParams.get('for_user');

  // Nicht-Admin/Mod: wir brauchen eine **valide UUID** in me.sub für den Filter
  const isAdminOrMod = me.role === 'admin' || me.role === 'moderator';
  if (!isAdminOrMod && !isUUID(me.sub)) {
    // console.warn('GET /api/teams: invalid sub', me.sub);
    return json<ErrorResponse>({ ok: false, error: 'bad_subject' }, 401);
  }

  const visibleTeams = await sql<Array<{ id: number; name: string; member_count: number }>>/*sql*/`
    with base as (
      select
        t.id,
        t.name,
        count(tm.*) filter (where tm.active) as member_count
      from public.teams t
      left join public.team_memberships tm on tm.team_id = t.id
      ${q ? sql`where t.name ilike ${'%' + q + '%'} ` : sql``}
      group by t.id
    )
    select * from base
    ${
      isAdminOrMod
        ? sql`order by name asc`
        : sql`
          where id in (
            select team_id from public.team_memberships
            where user_id = ${me.sub}::uuid
          )
          order by name asc
        `
    }
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
}

export async function POST(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) return json<ErrorResponse>({ ok: false, error: 'unauthorized' }, 401);

  const canCreate = me.role === 'admin' || me.role === 'moderator' || me.role === 'teamleiter';
  if (!canCreate) return json<ErrorResponse>({ ok: false, error: 'forbidden' }, 403);

  if (!isUUID(me.sub)) {
    // console.warn('POST /api/teams: invalid sub', me.sub);
    return json<ErrorResponse>({ ok: false, error: 'bad_subject' }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const name = String(body?.name ?? '').trim();
  if (!name) return json<ErrorResponse>({ ok: false, error: 'name_required' }, 400);

  const dupe = await sql/*sql*/`
    select 1 from public.teams where lower(name) = lower(${name}) limit 1
  `;
  if (dupe.length > 0) return json<ErrorResponse>({ ok: false, error: 'name_exists' }, 409);

  try {
    const row = await sql/*sql*/`
      insert into public.teams (name, created_by)
      values (${name}, ${me.sub}::uuid)
      returning id
    `;
    return json<PostOkResponse>({ ok: true, id: Number(row?.[0]?.id) });
  } catch (e: any) {
    // 23505 = unique_violation
    return json<ErrorResponse>(
      { ok: false, error: e?.code === '23505' ? 'name_exists' : 'db_error' },
      e?.code === '23505' ? 409 : 500
    );
  }
}
