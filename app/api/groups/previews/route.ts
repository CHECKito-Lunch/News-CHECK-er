export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

export async function GET(req: NextRequest) {
  const me = await requireUser(req).catch(() => null);
  if (!me) return json({ ok: true, items: [] });

  const { searchParams } = new URL(req.url);
  const groupsLimit = Number(searchParams.get('groups') || 6);
  const perGroup = Number(searchParams.get('perGroup') || 2);

  // last_seen
  const [{ last_seen }] = await sql<{ last_seen: string }[]>`
    select coalesce(us.last_seen_at, to_timestamp(0)) as last_seen
    from public.user_states us
    where us.user_id = ${me.sub}::text
  `.catch(() => [{ last_seen: '1970-01-01T00:00:00Z' as any }]);

  // Top-Gruppen mit max N Posts je Gruppe
  const rows = await sql<any[]>`
    with
    cursor as (select ${last_seen}::timestamptz as last_seen),
    m as (
      select gm.group_id
      from public.group_memberships gm
      where gm.user_id = ${me.sub}::uuid
    ),
    p as (
      select
        gp.id, gp.group_id, gp.title, gp.hero_image_url,
        coalesce(gp.effective_from, gp.created_at) as ts,
        row_number() over (partition by gp.group_id order by coalesce(gp.effective_from, gp.created_at) desc) as rn
      from public.group_posts gp
      join m on m.group_id = gp.group_id
      join cursor c on coalesce(gp.effective_from, gp.created_at) > c.last_seen
    ),
    limited as (
      select * from p where rn <= ${perGroup}
    )
    select
      g.id as group_id, g.name as group_name, g.description, g.is_private,
      json_agg(
        json_build_object(
          'id', l.id,
          'title', l.title,
          'created_at', l.ts,
          'hero_image_url', l.hero_image_url
        ) order by l.ts desc
      ) as posts,
      max(l.ts) as last_ts
    from limited l
    join public.groups g on g.id = l.group_id
    group by g.id, g.name, g.description, g.is_private
    order by last_ts desc
    limit ${groupsLimit}
  `;

  const items = rows.map((r: { group_id: any; group_name: any; description: any; is_private: any; posts: any; }) => ({
    group: {
      id: r.group_id,
      name: r.group_name,
      description: r.description,
      is_private: !!r.is_private,
      isMember: true,
    },
    posts: r.posts ?? []
  }));

  return json({ ok: true, items });
}
