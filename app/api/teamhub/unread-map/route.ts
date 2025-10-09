/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/teamhub/unread-map/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: unknown, s = 200) => NextResponse.json(d, { status: s });

type Row = {
  feedback_id: string;            // als Text zurück für sicheres JSON
  unread_total: number;
  last_comment_at: string | null; // ISO
  last_by_owner: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const me = await getUserFromCookies().catch(() => null);
    if (!me) return json({ ok: false, error: 'unauthorized' }, 401);
    if (me.role !== 'teamleiter' && me.role !== 'admin') {
      return json({ ok: false, error: 'forbidden' }, 403);
    }

    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get('owner_id');
    if (!ownerId) return json({ ok: false, error: 'missing owner_id' }, 400);

    // Threads (=Feedbacks) nur aus Teams, die der eingeloggte Teamleiter aktiv leitet
    const rows = await sql<Row[]>/*sql*/`
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
        select uf.id::text as feedback_id, uf.user_id as owner_id
        from public.user_feedback uf
        join my_team t on t.member_user_id = uf.user_id
        where uf.user_id = ${ownerId}::uuid
      ),
      last_c as (
        select c.feedback_id::text as feedback_id,
               max(c.created_at) as last_comment_at
        from public.feedback_comments c
        join fb on fb.feedback_id::bigint = c.feedback_id
        group by 1
      ),
      last_c_author as (
        select lc.feedback_id,
               lc.last_comment_at,
               (select c.author_user_id
                  from public.feedback_comments c
                 where c.feedback_id = lc.feedback_id::bigint
                   and c.created_at = lc.last_comment_at
                 limit 1) as last_author
        from last_c lc
      ),
      unread as (
        select c.feedback_id::text as feedback_id,
               count(*)::int as unread_total
        from public.feedback_comments c
        join fb on fb.feedback_id::bigint = c.feedback_id
        left join public.feedback_comment_reads r
          on r.comment_id = c.id
         and r.user_id = ${me.user_id}::uuid
        where r.comment_id is null
        group by 1
      )
      select
        fb.feedback_id,
        coalesce(un.unread_total, 0) as unread_total,
        lca.last_comment_at,
        (lca.last_author = fb.owner_id) as last_by_owner
      from fb
      left join unread un on un.feedback_id = fb.feedback_id
      left join last_c_author lca on lca.feedback_id = fb.feedback_id
    `;

    // In Map überführen: { [feedback_id]: {...} }
    const map: Record<string, Row> = {};
    for (const r of rows ?? []) map[r.feedback_id] = r;

    return json({ ok: true, map });
  } catch (err: any) {
    console.error('unread-map error:', err?.message || err);
    return json({ ok: false, error: err?.message ?? 'internal_error' }, 500);
  }
}
