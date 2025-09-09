// app/api/admin/groups/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET /api/admin/groups?q=&page=&pageSize=
export async function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const q = (u.searchParams.get('q') ?? '').trim();
    const page = Math.max(1, Number(u.searchParams.get('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(u.searchParams.get('pageSize') ?? 20)));
    const offset = (page - 1) * pageSize;

    const like = q ? `%${q}%` : null;

    const totalRows = await sql<{ c: number }[]>`
      select count(*)::int as c
      from public.groups g
      ${like ? sql`where g.name ilike ${like} or g.description ilike ${like}` : sql``}
    `;
    const total = totalRows[0]?.c ?? 0;

    const rows = await sql<{
      id: number | string;
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
      ${like ? sql`where g.name ilike ${like} or g.description ilike ${like}` : sql``}
      group by g.id, g.name, g.description, g.is_active
      order by g.id desc
      limit ${pageSize} offset ${offset}
    `;

    const data = rows.map(r => ({
      id: Number(r.id),
      name: r.name,
      description: r.description,
      is_active: r.is_active,
      memberCount: Number(r.member_count ?? 0),
    }));

    return NextResponse.json({ ok: true, data, total, page, pageSize });
  } catch (e: any) {
    console.error('GET /admin/groups failed', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

// POST /api/admin/groups  { name, description?, is_active? }
export async function POST(request: Request) {
  try {
    // WICHTIG: client muss Content-Type: application/json senden
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name ?? '').trim();
    const description =
      body?.description == null ? null : String(body.description);
    const is_active =
      body?.is_active == null ? true : Boolean(body.is_active);

    if (!name) {
      return NextResponse.json(
        { ok: false, error: 'name_required' },
        { status: 400 }
      );
    }

    const rows = await sql<{ id: number }[]>`
      insert into public.groups (name, description, is_active)
      values (${name}, ${description}, ${is_active})
      returning id
    `;

    return NextResponse.json(
      { ok: true, id: rows[0]?.id ?? null },
      { status: 201 }
    );
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    const status = /duplicate key|unique/i.test(msg) ? 409 : 500;
    console.error('POST /admin/groups failed', e);
    return NextResponse.json({ ok: false, error: msg || 'server_error' }, { status });
  }
}
