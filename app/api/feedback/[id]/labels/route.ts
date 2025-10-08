// app/api/feedback/[id]/labels/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const getFeedbackId = (url:string) => Number(new URL(url).pathname.split('/').filter(Boolean).slice(-2,-1)[0]);

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

export async function POST(req: NextRequest) {
  const me = await getUserFromCookies(req).catch(()=>null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const feedbackId = getFeedbackId(req.url);
  if (!Number.isFinite(feedbackId)) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  const acc = await canAccess(me, feedbackId);
  if (!acc.ok) return NextResponse.json({ ok:false, error:'forbidden' }, { status: acc.code });

  let b:any={}; try { b = await req.json(); } catch {}
  const label_id = Number(b?.label_id);
  if (!Number.isFinite(label_id)) return NextResponse.json({ ok:false, error:'missing_label_id' }, { status:400 });

  await sql/*sql*/`
    insert into public.feedback_label_links (feedback_id, label_id, added_by)
    values (${feedbackId}, ${label_id}, ${me.user_id}::uuid)
    on conflict do nothing
  `;
  return NextResponse.json({ ok:true });
}
