// app/api/admin/groups/[id]/members/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

async function appUserIdToUuid(appUserId: number): Promise<string | null> {
  const rows = await sql<{ user_id: string | null }[]>`
    select user_id from public.app_users where id = ${appUserId} limit 1
  `;
  return rows[0]?.user_id ?? null;
}

// Mitglied hinzufügen
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const gid = Number(params.id);
  if (!Number.isFinite(gid)) {
    return NextResponse.json({ ok: false, error: 'invalid_group_id' }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const appUserId = Number(body?.appUserId);
    if (!Number.isFinite(appUserId)) {
      return NextResponse.json({ ok: false, error: 'invalid_app_user_id' }, { status: 400 });
    }

    const uuid = await appUserIdToUuid(appUserId);
    if (!uuid) {
      return NextResponse.json({ ok: false, error: 'user_uuid_not_found' }, { status: 404 });
    }

    await sql`
      insert into public.group_members (group_id, user_id)
      values (${gid}, ${uuid})
      on conflict (group_id, user_id) do nothing
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

// Mitglied entfernen
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const gid = Number(params.id);
  if (!Number.isFinite(gid)) {
    return NextResponse.json({ ok: false, error: 'invalid_group_id' }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const appUserId = Number(body?.appUserId);
    if (!Number.isFinite(appUserId)) {
      return NextResponse.json({ ok: false, error: 'invalid_app_user_id' }, { status: 400 });
    }

    const uuid = await appUserIdToUuid(appUserId);
    if (!uuid) {
      return NextResponse.json({ ok: false, error: 'user_uuid_not_found' }, { status: 404 });
    }

    await sql`
      delete from public.group_members
      where group_id = ${gid} and user_id = ${uuid}
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
