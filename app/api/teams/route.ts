// app/api/teams/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export async function GET(req: NextRequest) {
  const me = await getUserFromCookies(req);
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const forUser = searchParams.get('for_user'); // optional: aktives Team für einen User

  // Sichtbarkeit:
  // - admin/mod: alle Teams
  // - teamleiter: nur Teams, in denen er/sie Mitglied ist (oder leitet)
  const visibleTeams = await sql/*sql*/`
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
      me.role === 'admin' || me.role === 'moderator'
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

  return NextResponse.json({
    ok: true,
    data: visibleTeams.map((r: any) => ({
      id: Number(r.id),
      name: r.name as string,
      memberCount: Number(r.member_count) || 0,
    })),
    activeTeamId,
  });
}

export async function POST(req: NextRequest) {
  const me = await getUserFromCookies(req);
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  let body: any = {};
  try { body = await req.json(); } catch {}
  const name = String(body?.name ?? '').trim();
  if (!name) return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 });

  const row = await sql/*sql*/`
    insert into public.teams (name, created_by)
    values (${name}, ${me.sub}::uuid)
    returning id
  `;
  return NextResponse.json({ ok: true, id: Number(row?.[0]?.id) });
}
