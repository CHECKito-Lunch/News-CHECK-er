// app/api/admin/users/[id]/groups/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/** Pfad .../users/:id/groups  -> :id holen */
function getAppUserIdFromUrl(url: string): number | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // .../api/admin/users/{id}/groups
    const idStr = parts[parts.length - 2]; // Segment vor "groups"
    const idNum = Number(idStr);
    return Number.isFinite(idNum) ? idNum : null;
  } catch {
    return null;
  }
}

async function appUserIdToUuid(appUserId: number): Promise<string | null> {
  const rows = await sql<{ user_id: string | null }[]>`
    select user_id from public.app_users where id = ${appUserId} limit 1
  `;
  return rows[0]?.user_id ?? null;
}

/** GET: aktuelle Gruppen-Mitgliedschaften eines Users als IDs */
export async function GET(request: Request) {
  const appUserId = getAppUserIdFromUrl(request.url);
  if (!appUserId) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const userUuid = await appUserIdToUuid(appUserId);
  if (!userUuid) {
    return NextResponse.json({ ok: false, error: 'user_uuid_not_found' }, { status: 404 });
  }

  const rows = await sql<{ group_id: string | number }[]>`
    select group_id from public.group_members where user_id = ${userUuid}
  `;
  const groupIds = rows.map(r => Number(r.group_id));

  return NextResponse.json({ ok: true, groupIds });
}

/** PUT: Mitgliedschaften synchronisieren (ersetzen) – Body: { groupIds: number[] } */
export async function PUT(request: Request) {
  const appUserId = getAppUserIdFromUrl(request.url);
  if (!appUserId) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const userUuid = await appUserIdToUuid(appUserId);
  if (!userUuid) {
    return NextResponse.json({ ok: false, error: 'user_uuid_not_found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const groupIds: number[] = Array.isArray(body?.groupIds)
    ? body.groupIds.map((x: unknown) => Number(x)).filter(Number.isFinite)
    : [];

  try {
    await sql.begin(async (tx) => {
      // Alles entfernen …
      await tx`delete from public.group_members where user_id = ${userUuid}`;

      // … und gewünschte Liste setzen (wenn vorhanden).
      for (const gid of groupIds) {
        await tx`
          insert into public.group_members (group_id, user_id)
          values (${gid}, ${userUuid})
          on conflict (group_id, user_id) do nothing
        `;
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
