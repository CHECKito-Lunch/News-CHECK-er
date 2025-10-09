/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const getFeedbackId = (url:string) => Number(new URL(url).pathname.split('/').filter(Boolean).slice(-2, -1)[0]);

async function canAccessFeedback(me:{user_id:string, role:string}, feedbackId:number) {
  // owner?
  const fb = await sql/*sql*/`select user_id from public.user_feedback where id=${feedbackId} limit 1`;
  if (fb.length === 0) return { ok:false as const, error:'not_found' };
  const owner = fb[0].user_id;

  if (owner === me.user_id) return { ok:true as const, owner };

  // admin/mod?
  if (me.role === 'admin' || me.role === 'moderator') return { ok:true as const, owner };

  // teamleiter derselben Mannschaft?
  const rows = await sql/*sql*/`
    select 1
    from public.team_memberships tl
    join public.team_memberships tm on tm.team_id = tl.team_id and tm.active
    where tl.user_id=${me.user_id}::uuid and tl.is_teamleiter and tl.active
      and tm.user_id=${owner}::uuid
    limit 1
  `;
  if (rows.length) return { ok:true as const, owner };

  return { ok:false as const, error:'forbidden' };
}

export async function GET(req: NextRequest) {
  const me = await getUserFromCookies().catch(()=>null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const id = getFeedbackId(req.url);
  if (!Number.isFinite(id)) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  const access = await canAccessFeedback(me, id);
  if (!access.ok) return NextResponse.json({ ok:false, error: access.error }, { status: access.error==='not_found'?404:403 });

  const rows = await sql/*sql*/`
    select c.id, c.body, c.created_at, c.updated_at,
           au.name as author_name, au.email as author_email
    from public.feedback_comments c
    join public.app_users au on au.user_id = c.author_user_id
    where c.feedback_id=${id}
    order by c.created_at asc
    limit 500
  `;
  const items = rows.map((r:any)=>({
    id: r.id,
    body: r.body,
    created_at: r.created_at,
    updated_at: r.updated_at,
    author: r.author_name || r.author_email || 'Unbekannt'
  }));
  return NextResponse.json({ ok:true, items });
}

export async function POST(req: NextRequest) {
  const me = await getUserFromCookies().catch(()=>null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const id = getFeedbackId(req.url);
  if (!Number.isFinite(id)) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  const access = await canAccessFeedback(me, id);
  if (!access.ok) return NextResponse.json({ ok:false, error: access.error }, { status: access.error==='not_found'?404:403 });

  let body:any = {};
  try { body = await req.json(); } catch {}
  const text = String(body?.body ?? '').trim();
  if (!text) return NextResponse.json({ ok:false, error:'empty_body' }, { status:400 });

  const ins = await sql/*sql*/`
    insert into public.feedback_comments (feedback_id, author_user_id, body)
    values (${id}, ${me.user_id}::uuid, ${text})
    returning id, body, created_at
  `;
  return NextResponse.json({ ok:true, item: ins[0] });
}
