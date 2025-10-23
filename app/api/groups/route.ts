// app/api/groups/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { maybeUser } from "@/lib/auth-server";

const json = <T,>(d: T, s = 200) => NextResponse.json<T>(d, { status: s });

type Row = {
  id: number;
  name: string;
  description: string | null;
  is_private: boolean;
  is_active: boolean;
  member_count: number;
  is_member: boolean;
};

export async function GET(req: NextRequest) {
  const me = await maybeUser(req);               // kann null sein
  const userId = me?.sub ?? "";                  // für EXISTS/compare
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");

  // --- 1) Explizite IDs: immer zurückgeben (auch private), wenn aktiv ---
  if (idsParam) {
    const ids: number[] = idsParam
      .split(",")
      .map((s) => Number(s.trim()))
      .filter(Number.isFinite);

    if (ids.length === 0) return json({ ok: true, data: [] as const });

    const rows = await sql<Row[]>`
      select
        g.id, g.name, g.description, g.is_private, g.is_active,
        coalesce(c.cnt, 0)::int as member_count,
        exists (
          select 1 from public.group_memberships m
          where m.group_id = g.id and m.user_id::text = ${userId}
        ) as is_member
      from public.groups g
      left join (
        select group_id, count(*)::int as cnt
        from public.group_memberships
        group by group_id
      ) c on c.group_id = g.id
      where g.id in ${sql(ids)} and g.is_active = true
      order by g.name asc
    `;

    const data = rows.map((r: Row) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      memberCount: r.member_count,
      isMember: r.is_member,
      is_private: r.is_private,
    }));
    return json({ ok: true, data });
  }

  // --- 2) Standardliste: öffentlich + meine (auch private) ---
  const rows = await sql<Row[]>`
    with pub as (
      select g.*
      from public.groups g
      where g.is_active = true and g.is_private = false
    ),
    mine as (
      select g.*
      from public.groups g
      join public.group_memberships m on m.group_id = g.id
      where g.is_active = true and m.user_id::text = ${userId}
    ),
    all_g as (
      select * from pub
      union
      select * from mine
    ),
    counts as (
      select group_id, count(*)::int as cnt
      from public.group_memberships
      group by group_id
    )
    select
      g.id, g.name, g.description, g.is_private, g.is_active,
      coalesce(c.cnt, 0)::int as member_count,
      exists (
        select 1 from public.group_memberships m
        where m.group_id = g.id and m.user_id::text = ${userId}
      ) as is_member
    from all_g g
    left join counts c on c.group_id = g.id
    order by g.name asc
  `;

  const data = rows.map((r: Row) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    memberCount: r.member_count,
    isMember: r.is_member,
  }));

  return json({ ok: true, data });
}
