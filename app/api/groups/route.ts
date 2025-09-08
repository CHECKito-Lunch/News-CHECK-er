// app/api/groups/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUserSub } from '@/lib/me';

export async function GET() {
  try {
    const sub = await requireUserSub();

    const rows = await sql<{
      id: string; name: string; description: string | null; is_active: boolean; created_at: string;
      member_count: number; is_member: boolean;
    }[]>`
      select
        g.id,
        g.name,
        g.description,
        g.is_active,
        g.created_at,
        coalesce(mc.member_count, 0)::int as member_count,
        exists (
          select 1 from public.group_members gm
          where gm.group_id = g.id and gm.user_id = ${sub}::uuid
        ) as is_member
      from public.groups g
      left join (
        select group_id, count(*) as member_count
        from public.group_members
        group by group_id
      ) mc on mc.group_id = g.id
      where g.is_active = true
      order by g.name asc;
    `;

    // Formatiere in das Frontend-Shape
    const data = rows.map(r => ({
      id: Number(r.id),
      name: r.name,
      description: r.description,
      memberCount: r.member_count,
      isMember: r.is_member,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const code = msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}