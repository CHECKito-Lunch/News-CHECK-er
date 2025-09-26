// app/api/groups/previews/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req).catch(() => null);
    // Previews sind nur sinnvoll für eingeloggte Users (Mitgliedsgruppen)
    if (!me) return json({ ok: true, items: [] });

    const { searchParams } = new URL(req.url);
    const groupsLimit = Math.max(1, Math.min(12, Number(searchParams.get('groups') || 6)));
    const perGroup = Math.max(1, Math.min(5, Number(searchParams.get('perGroup') || 2)));

    // Kandidaten-Gruppen = Gruppen, in denen der User Mitglied ist
    // Dann je Gruppe die jüngsten Posts (nur created_at), begrenzt via LATERAL.
    // Sortierung der Gruppen nach "letztes Posting" absteigend.
    const rows = await sql<any[]>`
      with my_groups as (
        select gm.group_id
        from public.group_members gm
        where gm.user_id = ${me.sub}::uuid
      ),
      cand as (
        select g.id, g.name, g.description, g.is_private
        from public.groups g
        join my_groups mg on mg.group_id = g.id
      )
      select
        c.id            as group_id,
        c.name          as group_name,
        c.description   as group_description,
        c.is_private    as is_private,
        max(p.created_at) as last_post_at,
        json_agg(
          json_build_object(
            'id',            p.id,
            'title',         p.title,
            'created_at',    p.created_at,
            'hero_image_url',p.hero_image_url
          )
          order by p.created_at desc
        ) as posts
      from cand c
      join lateral (
        select gp.id, gp.title, gp.created_at, gp.hero_image_url
        from public.group_posts gp
        where gp.group_id = c.id
        order by gp.created_at desc
        limit ${perGroup}
      ) p on true
      group by c.id, c.name, c.description, c.is_private
      order by last_post_at desc
      limit ${groupsLimit}
    `;

    // in das vom Frontend erwartete Shape mappen
    const items = rows.map((r: { group_id: any; group_name: any; group_description: any; is_private: any; posts: any; }) => ({
      group: {
        id: r.group_id,
        name: r.group_name,
        description: r.group_description,
        is_private: !!r.is_private,
        isMember: true, // wir liefern nur Mitgliedsgruppen
      },
      posts: Array.isArray(r.posts) ? r.posts : [],
    }));

    return json({ ok: true, items });
  } catch (e) {
    console.error('[groups/previews GET]', e);
    return json({ ok: true, items: [] });
  }
}
