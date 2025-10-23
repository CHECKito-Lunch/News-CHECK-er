/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/admin/groups/[id]/members/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withAdminRights } from '@/lib/with-auth';

const json = (d: unknown, s = 200) => NextResponse.json(d, { status: s });

// Next 14/15: params können ein Promise sein
async function getParams(ctx: any) {
  const p = (ctx && ctx.params) || {};
  return typeof p?.then === 'function' ? await p : p;
}

// GET: Mitglieder einer Gruppe (per UUID)
export const GET = withAdminRights(async (_req: NextRequest, ctx) => {
  const { id } = await getParams(ctx);
  const groupId = Number(Array.isArray(id) ? id[0] : id);
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return json({ error: 'Ungültige groupId' }, 400);
  }

  type Row = {
    user_id: string;       // UUID
    app_user_id: number;   // int PK aus app_users (falls vorhanden)
    email: string | null;
    name: string | null;
    role: string | null;   // aus app_users
    active: boolean | null;
    joined_at: string | null;
  };

  const rows = await sql<Row[]>`
    select
      u.user_id::text as user_id,
      u.id            as app_user_id,
      u.email,
      u.name,
      u.role,
      u.active,
      m.joined_at
    from public.group_members m
    join public.app_users u
      on u.user_id = m.user_id
    where m.group_id = ${groupId}
    order by coalesce(u.name, u.email) asc
  `;

  return json({ ok: true, members: rows });
});

// PUT: Mitglieder einer Gruppe setzen (exakte Menge, UUIDs)
export const PUT = withAdminRights(async (req: NextRequest, ctx) => {
  const { id } = await getParams(ctx);
  const groupId = Number(Array.isArray(id) ? id[0] : id);
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return json({ error: 'Ungültige groupId' }, 400);
  }

  const body: unknown = await req.json().catch(() => ({} as unknown));
  const inputRaw: unknown[] = Array.isArray((body as any)?.userIds)
    ? ((body as any).userIds as unknown[])
    : [];

  const inputIds: string[] = inputRaw.filter((v: unknown): v is string => typeof v === 'string');
  const want: string[] = Array.from(
    new Set(
      inputIds
        .map((v: string) => v.trim())
        .filter((v: string): v is string => v.length > 0)
    )
  );

  const uuidish = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  const wantUuids: string[] = want.filter((v: string) => uuidish(v));

  const cur = await sql<{ user_id: string }[]>`
    select user_id::text as user_id
    from public.group_members
    where group_id = ${groupId}
  `;
  const have = new Set<string>(cur.map((r: { user_id: string }) => r.user_id));

  const toAdd: string[] = wantUuids.filter((uuid: string) => !have.has(uuid));
  const wantSet = new Set<string>(wantUuids);
  const toRemove: string[] = [...have].filter((uuid: string) => !wantSet.has(uuid));

  // Transaktion für atomare Änderungen
  await sql.begin(async (tx: any) => {
    // Einfügen - einzeln
    for (const uuid of toAdd) {
      await tx`
        insert into public.group_members (group_id, user_id, role, joined_at)
        values (${groupId}, ${uuid}::uuid, ${'member'}, now())
        on conflict (group_id, user_id) do nothing
      `;
    }

    // Löschen - bulk
    if (toRemove.length > 0) {
      await tx`
        delete from public.group_members
        where group_id = ${groupId}
          and user_id = ANY(${toRemove}::uuid[])
      `;
    }
  });

  return json({
    ok: true,
    added: toAdd.length,
    removed: toRemove.length,
    ignoredInvalid: want.length - wantUuids.length,
  });
});


export function POST() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, PUT' } });
}