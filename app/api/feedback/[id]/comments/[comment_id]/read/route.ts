export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const getIds = (url:string) => {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  return {
    feedbackId: Number(parts.slice(-4, -3)[0]),
    commentId:  Number(parts.slice(-2, -1)[0]),
  };
};

async function canAccessFeedback(me:{user_id:string, role:string}, feedbackId:number) {
  const fb = await sql`select user_id from public.user_feedback where id=${feedbackId} limit 1`;
  if (fb.length === 0) return false;
  const owner = fb[0].user_id;

  if (owner === me.user_id) return true;
  if (me.role === 'admin' || me.role === 'moderator') return true;
  const rows = await sql/*sql*/`
    select 1
    from public.team_memberships tl
    join public.team_memberships tm on tm.team_id = tl.team_id and tm.active
    where tl.user_id=${me.user_id}::uuid and tl.is_teamleiter and tl.active
      and tm.user_id=${owner}::uuid
    limit 1
  `;
  return rows.length > 0;
}

export async function POST(req: NextRequest) {
  const me = await getUserFromCookies().catch(()=>null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const { feedbackId, commentId } = getIds(req.url);
  if (!Number.isFinite(feedbackId) || !Number.isFinite(commentId))
    return NextResponse.json({ ok:false, error:'bad_ids' }, { status:400 });

  const allowed = await canAccessFeedback(me, feedbackId);
  if (!allowed) return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

  await sql/*sql*/`
    insert into public.feedback_comment_reads (comment_id, user_id)
    values (${commentId}, ${me.user_id}::uuid)
    on conflict (comment_id, user_id) do update set read_at = now()
  `;
  return NextResponse.json({ ok:true });
}
