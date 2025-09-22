// app/api/admin/groups/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';
import bcrypt from 'bcryptjs';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

type Row = {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  is_private: boolean;
  join_password_hash: string | null;
  member_count: number;
};

export async function GET() {
  if (!(await getAdminFromCookies())) return json({ ok: false, error: 'forbidden' }, 401);

  const rows: Row[] = await sql<Row[]>`
    select
      g.id, g.name, g.description, g.is_active, g.is_private, g.join_password_hash,
      coalesce(mc.member_count,0)::int as member_count
    from public.groups g
    left join (
      select group_id, count(*) as member_count
      from public.group_members
      group by group_id
    ) mc on mc.group_id = g.id
    order by g.name asc
  `;

  const data = rows.map((r: Row) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    is_active: r.is_active,
    is_private: r.is_private,
    has_password: !!r.join_password_hash,
    memberCount: r.member_count,
  }));

  return json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminFromCookies())) return json({ ok: false, error: 'forbidden' }, 401);
  const b = await req.json().catch(() => ({}));

  const name = (b?.name ?? '').toString().trim();
  if (!name) return json({ ok: false, error: 'name_required' }, 400);

  const description = (b?.description ?? null) as string | null;
  const is_private = !!b?.is_private;
  const password = (b?.password ?? '').toString().trim();

  const hash = password ? await bcrypt.hash(password, 10) : null;

  const [row] = await sql<{ id: number }[]>`
    insert into public.groups (name, description, is_active, is_private, join_password_hash)
    values (${name}, ${description}, true, ${is_private}, ${hash})
    returning id
  `;
  return json({ ok: true, id: row.id });
}
