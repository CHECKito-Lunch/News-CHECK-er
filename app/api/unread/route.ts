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
    if (!me) {
      return json({ ok: true, unread: 0, breakdown: { posts: 0, invites: 0 }, preview: [] });
    }

    // last_seen aus user_states (fallback epoch)
    const [{ last_seen }] = await sql<{ last_seen: string }[]>`
      select coalesce(
        (select us.last_seen_at from public.user_states us where us.user_id = ${me.sub}::text),
        to_timestamp(0)
      ) as last_seen
    `;

    // offene Einladungen
    const [{ invites }] = await sql<{ invites: number }[]>`
      select count(*)::int as invites
      from public.group_invitations gi
      where gi.invited_user_id = ${me.sub}::uuid
        and gi.accepted_at is null
        and gi.declined_at is null
        and gi.revoked_at is null
    `;

    // neue Posts in Mitgliedsgruppen seit last_seen (nur created_at)
    const rows = await sql<any[]>`
      with cursor as (
        select ${last_seen}::timestamptz as last_seen
      ),
      m as (
        select gm.group_id
        from public.group_members gm
        where gm.user_id = ${me.sub}::uuid
      ),
      p as (
        select
          gp.id,
          gp.group_id,
          gp.title,
          gp.hero_image_url,
          gp.created_at as ts
        from public.group_posts gp
        join m on m.group_id = gp.group_id
        join cursor c on gp.created_at > c.last_seen
      )
      select
        p.id,
        p.group_id,
        p.title,
        p.ts as created_at,
        p.hero_image_url,
        g.name as group_name,
        g.description as group_description,
        g.is_private
      from p
      join public.groups g on g.id = p.group_id
      order by p.ts desc
      limit 20
    `;

    const posts = rows.length | 0;
    const unread = posts + Number(invites || 0);

    return json({
      ok: true,
      unread,
      breakdown: { posts, invites: Number(invites || 0) },
      preview: rows.map((r: { id: any; title: any; created_at: any; hero_image_url: any; group_id: any; group_name: any; is_private: any; }) => ({
        id: r.id,
        title: r.title,
        created_at: r.created_at,
        hero_image_url: r.hero_image_url,
        group: { id: r.group_id, name: r.group_name, is_private: !!r.is_private }
      })),
    });
  } catch (e) {
    console.error('[unread GET]', e);
    return json({ ok: true, unread: 0, breakdown: { posts: 0, invites: 0 }, preview: [] });
  }
}
