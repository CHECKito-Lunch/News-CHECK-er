export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const getSlug = (url:string)=> new URL(url).pathname.split('/').filter(Boolean).slice(-1)[0];

export async function GET(req: NextRequest) {
  const me = await getUserFromCookies().catch(()=>null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
  if (me.role !== 'teamleiter' && me.role !== 'admin' && me.role !== 'moderator')
    return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

  const slug = getSlug(req.url);
  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 100)));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

  const rows = await sql/*sql*/`
    with my_team as (
      select tm2.user_id as member_user_id
      from public.team_memberships tl
      join public.team_memberships tm2 on tm2.team_id = tl.team_id and tm2.active
      where tl.user_id = ${me.user_id}::uuid and tl.is_teamleiter and tl.active
    ),
    lab as (
      select id from public.feedback_labels where slug=${slug} limit 1
    ),
    fb as (
      select uf.*
      from public.user_feedback uf
      join my_team t on t.member_user_id = uf.user_id
      join public.feedback_label_links ll on ll.feedback_id=uf.id
      join lab on lab.id = ll.label_id
    )
    select
      fb.id as feedback_id,
      fb.user_id,
      u.name as member_name,
      fb.channel,
      fb.feedback_at,
      fb.feedback_ts,
      coalesce(
        (select json_agg(json_build_object('id',l.id,'name',l.name,'color',l.color) order by l.name)
         from public.feedback_label_links ll2
         join public.feedback_labels l on l.id=ll2.label_id
         where ll2.feedback_id=fb.id),
        '[]'::json
      ) as labels
    from fb
    left join public.app_users u on u.user_id = fb.user_id
    order by coalesce(fb.feedback_ts, fb.feedback_at::timestamp) desc, fb.id desc
    limit ${limit} offset ${offset}
  `;

  return NextResponse.json({ ok:true, items: rows });
}
