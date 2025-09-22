// app/api/admin/groups/[id]/members/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { withModerator } from '@/lib/with-auth';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

// Hilfsfunktion: Next 14/15 kann params als Promise liefern
async function getParams(ctx: any) {
  const p = (ctx && ctx.params) || {};
  return typeof p?.then === 'function' ? await p : p;
}

// GET: Mitglieder einer Gruppe (per UUID)
export const GET = withModerator(async (_req: NextRequest, ctx) => {
  const { id } = await getParams(ctx);
  const groupId = Number(Array.isArray(id) ? id[0] : id);
  if (!Number.isFinite(groupId) || groupId <= 0) return json({ error: 'Ungültige groupId' }, 400);

  type Row = {
    user_id: string;       // UUID
    app_user_id: number;   // int PK aus app_users (falls vorhanden)
    email: string | null;
    name: string | null;
    role: string | null;
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
export const PUT = withModerator(async (req: NextRequest, ctx) => {
  const { id } = await getParams(ctx);
  const groupId = Number(Array.isArray(id) ? id[0] : id);
  if (!Number.isFinite(groupId) || groupId <= 0) return json({ error: 'Ungültige groupId' }, 400);

  const body = await req.json().catch(() => ({}));

  // 1) Rohdaten typneutral lesen
  const inputRaw: unknown[] = Array.isArray(body?.userIds) ? (body.userIds as unknown[]) : [];

  // 2) Nur Strings erlauben (Type Guard) → string[]
  const inputIds: string[] = inputRaw.filter((v): v is string => typeof v === 'string');

  // 3) Normalisieren/trimmen + Duplikate raus → string[]
  const want: string[] = Array.from(
    new Set(
      inputIds
        .map((v: string) => v.trim())
        .filter((v: string): v is string => v.length > 0)
    )
  );

  // aktuelle Mitglieder holen
  const cur = await sql<{ user_id: string }[]>`
    select user_id::text as user_id
    from public.group_members
    where group_id = ${groupId}
  `;
  const have = new Set<string>(cur.map((r: { user_id: string }) => r.user_id));

  // Differenzen bilden
  const toAdd: string[] = want.filter((uuid: string) => !have.has(uuid));
  const wantSet = new Set<string>(want);
  const toRemove: string[] = [...have].filter((uuid: string) => !wantSet.has(uuid));

  // Einfügen (bulk)
  if (toAdd.length > 0) {
    const tuples = toAdd.map((uuid: string) =>
      sql`(${groupId}, ${uuid}::uuid, 'member', now())`
    );
    await sql`
      insert into public.group_members (group_id, user_id, role, joined_at)
      values ${sql(tuples)}
      on conflict (group_id, user_id) do nothing
    `;
  }

  // Löschen
  if (toRemove.length > 0) {
    await sql`
      delete from public.group_members
      where group_id = ${groupId}
        and user_id in ${sql(toRemove)}
    `;
  }

  return json({ ok: true, added: toAdd.length, removed: toRemove.length });
});

// Optional: explizites 405 verhindern Browser-GET auf falsche Methode
export function POST() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, PUT' } });
}
