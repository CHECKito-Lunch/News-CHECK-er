export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const me = await getUserFromCookies().catch(()=>null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
  if (me.role !== 'teamleiter' && me.role !== 'admin' && me.role !== 'moderator')
    return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

  const { searchParams } = new URL(req.url);
  const onlyUnread = (searchParams.get('only_unread') ?? 'true') === 'true';
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 100)));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

  const rows = await sql/*sql*/`
    with my_team as (
      select tm2.user_id as member_user_id
      from public.team_memberships tl
      join public.team_memberships tm2 on tm2.team_id = tl.team_id and tm2.active
      where tl.user_id = ${me.user_id}::uuid and tl.is_teamleiter and tl.active
    ),
    fb as (
      select uf.id as feedback_id, uf.user_id as owner_id, uf.channel
      from public.user_feedback uf
      join my_team t on t.member_user_id = uf.user_id
    ),
    last_c as (
      select c.feedback_id, max(c.created_at) as last_at
      from public.feedback_comments c
      join fb on fb.feedback_id=c.feedback_id
      group by 1
    ),
    unread as (
      select c.feedback_id, count(*) as unread
      from public.feedback_comments c
      join fb on fb.feedback_id=c.feedback_id
      left join public.feedback_comment_reads r
        on r.comment_id=c.id and r.user_id=${me.user_id}::uuid
      where r.comment_id is null
      group by 1
    )
    select
      fb.feedback_id,
      u.name as member_name,
      fb.channel,
      lc.last_at as last_comment_at,
      substring(c.body from 1 for 140) as last_comment_snippet,
      coalesce(un.unread,0) as unread,
      coalesce(
        (
          select json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) order by l.name)
          from public.feedback_label_links ll
          join public.feedback_labels l on l.id=ll.label_id
          where ll.feedback_id=fb.feedback_id
        ), '[]'::json
      ) as labels
    from fb
    left join last_c lc on lc.feedback_id = fb.feedback_id
    left join public.feedback_comments c on c.feedback_id = fb.feedback_id and c.created_at = lc.last_at
    left join unread un on un.feedback_id = fb.feedback_id
    left join public.app_users u on u.user_id = fb.owner_id
    ${onlyUnread ? sql`where coalesce(un.unread,0) > 0` : sql``}
    order by (coalesce(un.unread,0) > 0) desc, lc.last_at desc nulls last
    limit ${limit} offset ${offset}
  `;

  return NextResponse.json({ ok:true, items: rows });
}
