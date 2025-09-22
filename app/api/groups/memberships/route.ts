// app/api/groups/memberships/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withAuth } from '@/lib/with-auth';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

type MembershipRow = {
  groupId: number;
  groupName: string;
  role: string | null;
  joinedAt: string | null;
};

// GET: Liste + IDs (wie vorher, nur mit withAuth)
export const GET = withAuth(async (_req, _ctx, me) => {
  const rows: MembershipRow[] = await sql<MembershipRow[]>`
    select m.group_id as "groupId",
           g.name     as "groupName",
           m.role,
           m.joined_at as "joinedAt"
      from group_members m
      join groups g on g.id = m.group_id
     where m.user_id = ${me.sub}::uuid
     order by g.name asc
  `;

  return json({
    ok: true,
    memberships: rows,
    groupIds: rows.map((r: MembershipRow) => r.groupId), // TS7006 fix
  });
});

// POST: { groupId, action: 'join' | 'leave' }
export const POST = withAuth(async (req, _ctx, me) => {
  const body = await req.json().catch(() => ({} as any));
  const groupId = Number(body?.groupId);
  const action = String(body?.action ?? '').toLowerCase() as 'join' | 'leave';

  if (!Number.isFinite(groupId) || groupId <= 0) return json({ ok: false, error: 'invalid_groupId' }, 400);
  if (action !== 'join' && action !== 'leave') return json({ ok: false, error: 'invalid_action' }, 400);

  if (action === 'join') {
    await sql`
      insert into group_members (group_id, user_id, role, joined_at)
      select ${groupId}, ${me.sub}::uuid, 'member', now()
      where not exists (
        select 1 from group_members
         where group_id = ${groupId}
           and user_id  = ${me.sub}::uuid
      )
    `;
    return json({ ok: true, joined: true, groupId });
  } else {
    await sql`delete from group_members where group_id = ${groupId} and user_id = ${me.sub}::uuid`;
    return json({ ok: true, joined: false, groupId });
  }
});

// PUT: { groupIds: number[] } – Zielmenge setzen (Diff-insert/delete)
export const PUT = withAuth(async (req, _ctx, me) => {
  const body = await req.json().catch(() => ({} as any));
  const groupIds: number[] = Array.isArray(body?.groupIds)
    ? body.groupIds.map((x: unknown) => Number(x)).filter(Number.isFinite)
    : [];

  if (groupIds.length === 0) return json({ ok: false, error: 'groupIds_required' }, 400);

  const current = await sql<{ group_id: number }[]>`
    select group_id from group_members where user_id = ${me.sub}::uuid
  `;

  // Typisiere Set explizit → keine impliziten any
  const have = new Set<number>(current.map((r: { group_id: number }) => r.group_id));
  const want = new Set<number>(groupIds);

  const toAdd: number[] = groupIds.filter((id: number) => !have.has(id));
  const toRemove: number[] = [...have].filter((id: number) => !want.has(id));

  if (toAdd.length) {
    const tuples = toAdd.map((id: number) =>
      sql`(${id}, ${me.sub}::uuid, 'member', now())`
    );
    await sql`
      insert into group_members (group_id, user_id, role, joined_at)
      values ${sql(tuples)}
      on conflict (group_id, user_id) do nothing
    `;
  }

  if (toRemove.length) {
    await sql`
      delete from group_members
       where user_id = ${me.sub}::uuid
         and group_id in ${sql(toRemove)}
    `;
  }

  return json({ ok: true, added: toAdd.length, removed: toRemove.length, groupIds });
});
