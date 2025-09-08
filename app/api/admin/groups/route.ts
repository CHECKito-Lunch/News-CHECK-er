// app/api/admin/groups/[id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/** Pfad .../groups/:id -> :id aus URL ziehen */
function getGroupIdFromUrl(url: string): number | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // .../api/admin/groups/{id}
    const idStr = parts[parts.length - 1];
    const idNum = Number(idStr);
    return Number.isFinite(idNum) ? idNum : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const gid = getGroupIdFromUrl(request.url);
  if (!gid) {
    return NextResponse.json({ ok: false, error: 'invalid_group_id' }, { status: 400 });
  }
  try {
    const rows = await sql<{
      id: string;
      name: string;
      description: string | null;
      is_active: boolean;
      member_count: number | string | null;
    }[]>`
      select
        g.id,
        g.name,
        g.description,
        g.is_active,
        coalesce(count(m.user_id), 0)::int as member_count
      from public.groups g
      left join public.group_members m on m.group_id = g.id
      where g.id = ${gid}
      group by g.id, g.name, g.description, g.is_active
      limit 1
    `;
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const r = rows[0];
    return NextResponse.json({
      ok: true,
      data: {
        id: Number(r.id),
        name: r.name,
        description: r.description,
        is_active: r.is_active,
        memberCount: Number(r.member_count ?? 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const gid = getGroupIdFromUrl(request.url);
  if (!gid) {
    return NextResponse.json({ ok: false, error: 'invalid_group_id' }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const hasName   = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasDesc   = Object.prototype.hasOwnProperty.call(body, 'description');
    const hasActive = Object.prototype.hasOwnProperty.call(body, 'is_active');

    if (!hasName && !hasDesc && !hasActive) {
      return NextResponse.json({ ok: false, error: 'no_fields' }, { status: 400 });
    }

    const name        = hasName   ? (body.name == null ? null : String(body.name).trim()) : null;
    const description = hasDesc   ? (body.description == null ? null : String(body.description)) : null;
    const is_active   = hasActive ? Boolean(body.is_active) : null;

    await sql`
      update public.groups
      set
        name        = case when ${hasName}   then ${name}        else name end,
        description = case when ${hasDesc}   then ${description} else description end,
        is_active   = case when ${hasActive} then ${is_active}   else is_active end
      where id = ${gid}
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ?? 'server_error';
    const status = /unique/i.test(msg) ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(request: Request) {
  const gid = getGroupIdFromUrl(request.url);
  if (!gid) {
    return NextResponse.json({ ok: false, error: 'invalid_group_id' }, { status: 400 });
  }
  try {
    await sql`delete from public.groups where id = ${gid}`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
