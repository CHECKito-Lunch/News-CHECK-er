// app/api/feedback/[id]/labels/[label_id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const parts = (url:string)=> new URL(url).pathname.split('/').filter(Boolean);
const getFeedbackId = (url:string)=> Number(parts(url).slice(-3,-2)[0]);
const getLabelId    = (url:string)=> Number(parts(url).slice(-1)[0]);

async function canAccess(me:{user_id:string, role:string}, feedbackId:number){
  const fb = await sql`select user_id from public.user_feedback where id=${feedbackId} limit 1`;
  if (fb.length===0) return {ok:false as const, code:404};
  const owner = fb[0].user_id;
  if (owner===me.user_id || me.role==='admin' || me.role==='moderator') return {ok:true as const};
  const t = await sql/*sql*/`
    select 1
    from public.team_memberships tl
    join public.team_memberships tm on tm.team_id=tl.team_id and tm.active
    where tl.user_id=${me.user_id}::uuid and tl.is_teamleiter and tl.active
      and tm.user_id=${owner}::uuid
    limit 1
  `;
  return { ok: Boolean(t.length), code: 403 as const };
}

export async function DELETE(req: NextRequest) {
  const me = await getUserFromCookies().catch(()=>null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const feedbackId = getFeedbackId(req.url);
  const labelId = getLabelId(req.url);
  if (!Number.isFinite(feedbackId) || !Number.isFinite(labelId))
    return NextResponse.json({ ok:false, error:'bad_ids' }, { status:400 });

  const acc = await canAccess(me, feedbackId);
  if (!acc.ok) return NextResponse.json({ ok:false, error:'forbidden' }, { status: acc.code });

  await sql/*sql*/`
    delete from public.feedback_label_links
    where feedback_id=${feedbackId} and label_id=${labelId}
  `;
  return NextResponse.json({ ok:true });
}
