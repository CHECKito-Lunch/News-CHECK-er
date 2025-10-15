// app/api/teamhub/threads/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';



// Eigener JSON-Helper (vermeidet Typ-Probleme mit NextResponse.json)
const json = (data: unknown, status = 200) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// simple UUID-Check
const isUuid = (s?: string | null) => !!s && /^[0-9a-f-]{36}$/i.test(s || '');

export async function GET(req: NextRequest) {
  let me: { user_id: string; role: string } | null = null;
  try {
    me = await getUserFromCookies();
  } catch {
    me = null;
  }
  if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

  // Nur Teamleiter sehen den Hub
  if (me.role !== 'teamleiter') {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const { searchParams } = new URL(req.url);
  const onlyUnread = (searchParams.get('only_unread') ?? 'true') === 'true';
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 100)));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));
  const ownerId = searchParams.get('owner_id');
  const mode = (searchParams.get('mode') || 'threads').toLowerCase();

  // optionaler Mitarbeiter-Filter
  const whereOwner = isUuid(ownerId) ? sql`and uf.user_id = ${ownerId}::uuid` : sql``;

  if (mode === 'recent_owner_comments') {
    // flache Liste der letzten Kommentare, die der Mitarbeiter selbst geschrieben hat
    const rows = await sql/*sql*/`
      with my_team as (
        select tm2.user_id as member_user_id
        from public.team_memberships tl
        join public.team_memberships tm2
          on tm2.team_id = tl.team_id and tm2.active
        where tl.user_id = ${me.user_id}::uuid
          and tl.is_teamleiter
          and tl.active
      ),
      fb as (
        select uf.id as feedback_id, uf.user_id as owner_id
        from public.user_feedback uf
        join my_team t on t.member_user_id = uf.user_id
        ${whereOwner}
      )
      select
        c.id,
        c.feedback_id,
        c.body,
        c.created_at,
        au.name as author
      from public.feedback_comments c
      join fb on fb.feedback_id = c.feedback_id
      join public.app_users au on au.user_id = c.user_id
      where c.user_id = fb.owner_id           -- nur Mitarbeiter-Kommentare
      order by c.created_at desc
      limit ${limit} offset ${offset}
    `;

    return json({ ok: true, items: rows });
  }

  // Standard: Threads mit letztem Kommentar, Unread-Zahl etc.
  const rows = await sql/*sql*/`
    with my_team as (
      select tm2.user_id as member_user_id
      from public.team_memberships tl
      join public.team_memberships tm2
        on tm2.team_id = tl.team_id and tm2.active
      where tl.user_id = ${me.user_id}::uuid
        and tl.is_teamleiter
        and tl.active
    ),
    fb as (
      select uf.id as feedback_id, uf.user_id as owner_id, uf.channel
      from public.user_feedback uf
      join my_team t on t.member_user_id = uf.user_id
      ${whereOwner}
    ),
    fb_with_comments as (
      select distinct c.feedback_id
      from public.feedback_comments c
      join fb on fb.feedback_id = c.feedback_id
    ),
    last_c as (
      select c.feedback_id, max(c.created_at) as last_at
      from public.feedback_comments c
      join fb on fb.feedback_id = c.feedback_id
      group by 1
    ),
    unread as (
      select c.feedback_id, count(*)::int as unread
      from public.feedback_comments c
      join fb on fb.feedback_id = c.feedback_id
      left join public.feedback_comment_reads r
             on r.comment_id = c.id and r.user_id = ${me.user_id}::uuid
      where r.comment_id is null
      group by 1
    ),
    counts as (
      select c.feedback_id, count(*)::int as comment_count
      from public.feedback_comments c
      join fb on fb.feedback_id = c.feedback_id
      group by 1
    )
    select
      fb.feedback_id,
      coalesce(u.name, '—') as member_name,
      fb.channel,
      lc.last_at as last_comment_at,
      left(coalesce(c.body, ''), 140) as last_comment_snippet,
      coalesce(un.unread, 0)          as unread,
      coalesce(cnt.comment_count, 0)  as comment_count,
      coalesce(
        (
          select json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) order by l.name)
          from public.feedback_label_links ll
          join public.feedback_labels l on l.id = ll.label_id
          where ll.feedback_id = fb.feedback_id
        ), '[]'::json
      ) as labels
    from fb
    join fb_with_comments fbc on fbc.feedback_id = fb.feedback_id
    left join last_c lc on lc.feedback_id = fb.feedback_id
    left join public.feedback_comments c
           on c.feedback_id = fb.feedback_id and c.created_at = lc.last_at
    left join unread un on un.feedback_id = fb.feedback_id
    left join counts cnt on cnt.feedback_id = fb.feedback_id
    left join public.app_users u on u.user_id = fb.owner_id
    ${onlyUnread ? sql`where coalesce(un.unread, 0) > 0` : sql``}
    order by (coalesce(un.unread, 0) > 0) desc, lc.last_at desc nulls last
    limit ${limit} offset ${offset}
  `;

  return json({ ok: true, items: rows });
}
