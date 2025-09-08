// app/api/admin/groups/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// app_users.id (int) -> app_users.user_id (uuid)
async function appUserIdToUuid(appUserId: number): Promise<string | null> {
  const rows = await sql<{ user_id: string | null }[]>`
    select user_id from public.app_users where id = ${appUserId} limit 1
  `;
  return rows[0]?.user_id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forUserParam = searchParams.get('forUserId') ?? searchParams.get('userId');

    let userUuid: string | null = null;
    if (forUserParam) {
      const n = Number(forUserParam);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
      }
      userUuid = await appUserIdToUuid(n);
    }

    // Robust: ohne View; memberCount via LEFT JOIN + GROUP BY
    const rows = await sql<{
      id: string;
      name: string;
      description: string | null;
      is_active: boolean;
      member_count: number | string | null;
      is_member: boolean;
    }[]>`
      select
        g.id,
        g.name,
        g.description,
        g.is_active,
        coalesce(count(m.user_id), 0)::int as member_count,
        ${
          userUuid
            ? sql`exists(select 1 from public.group_members mm where mm.group_id = g.id and mm.user_id = ${userUuid})`
            : sql`false`
        } as is_member
      from public.groups g
      left join public.group_members m on m.group_id = g.id
      group by g.id, g.name, g.description, g.is_active
      order by g.name asc
    `;

    const data = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      description: r.description,
      is_active: r.is_active,
      memberCount: Number(r.member_count ?? 0),
      isMember: Boolean(r.is_member),
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error('GET /api/admin/groups failed:', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? '').trim();
    const description = body?.description != null ? String(body.description) : null;
    const is_active = body?.is_active === false ? false : true;

    if (!name) {
      return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 });
    }

    const rows = await sql<{ id: string }[]>`
      insert into public.groups (name, description, is_active)
      values (${name}, ${description}, ${is_active})
      returning id
    `;

    return NextResponse.json({ ok: true, id: Number(rows[0].id) }, { status: 201 });
  } catch (e: any) {
    const msg = e?.message ?? 'server_error';
    const status = /unique/i.test(msg) ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
