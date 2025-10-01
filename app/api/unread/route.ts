// app/api/unread/route.ts (GET)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d, { status:s });

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req).catch(() => null);
    if (!me) {
      return json({ ok:true, unread:0, breakdown:{ invites:0, groups:0, news:0, events:0 }, preview:[] });
    }

    const lsRow = await sql<{ last_seen_at: string | null }[]>`
      select last_seen_at from public.user_states where user_id = ${me.sub}::text limit 1
    `;
    const lastSeen = lsRow[0]?.last_seen_at ?? '1970-01-01T00:00:00Z';

    const [{ invites }] = await sql<{ invites:number }[]>`
      select count(*)::int invites
      from public.group_invitations gi
      where gi.invited_user_id = ${me.sub}::uuid
        and gi.accepted_at is null and gi.declined_at is null and gi.revoked_at is null
    `;

    const myGroupIds = (await sql<{ group_id:number }[]>`
      select gm.group_id
      from public.group_members gm
      where gm.user_id = ${me.sub}::uuid
    `).map((r: { group_id: any; }) => r.group_id);

    const [{ groups }] = await sql<{ groups:number }[]>`
      select count(*)::int groups
      from public.group_posts gp
      where gp.created_at > ${lastSeen}::timestamptz
        and ${myGroupIds.length ? sql`gp.group_id = any(${myGroupIds})` : sql`false`}
    `;

    const [{ news }] = await sql<{ news:number }[]>`
      select count(*)::int news
      from public.posts p
      where coalesce(p.published_at, p.created_at) > ${lastSeen}::timestamptz
        and coalesce(p.is_draft, false) = false
    `;

    const [{ events }] = await sql<{ events:number }[]>`
      select count(*)::int events
      from public.termine t
      where coalesce(t.updated_at, t.created_at, t.starts_at) > ${lastSeen}::timestamptz
    `;

    const previewRows = await sql<any[]>`
      select gp.id, gp.group_id, gp.title, gp.hero_image_url, gp.created_at,
             g.name as group_name, g.is_private
      from public.group_posts gp
      join public.groups g on g.id = gp.group_id
      where gp.created_at > ${lastSeen}::timestamptz
        and ${myGroupIds.length ? sql`gp.group_id = any(${myGroupIds})` : sql`false`}
      order by gp.created_at desc
      limit 20
    `;

    const breakdown = { invites, groups, news, events };
    const unread = invites + groups + news + events;

    return json({
      ok: true,
      unread,
      breakdown,
      preview: previewRows.map((r: { id: any; title: any; created_at: any; hero_image_url: any; group_id: any; group_name: any; is_private: any; }) => ({
        id: r.id,
        title: r.title,
        created_at: r.created_at,
        hero_image_url: r.hero_image_url,
        group: { id: r.group_id, name: r.group_name, is_private: !!r.is_private }
      })),
    });
  } catch (e) {
    console.error('[unread GET]', e);
    return json({ ok:true, unread:0, breakdown:{ invites:0, groups:0, news:0, events:0 }, preview:[] });
  }
}
