export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/user-auth';

const json = (d: any, status = 200) => NextResponse.json(d, { status });

function extractId(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // .../admin/groups/:id/invite
    const idStr = parts[parts.length - 2];
    const id = Number(idStr);
    return Number.isFinite(id) ? id : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const me = await getUserFromCookies();
  if (!me || (me.role !== 'admin' && me.role !== 'moderator')) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const gid = extractId(req.url);
  if (gid == null) return json({ ok: false, error: 'invalid_group_id' }, 400);

  // Gruppe prüfen (optional: nur aktive)
  const [g] = await sql<{ id: string; is_active: boolean | null; is_private: boolean | null }[]>`
    select id, is_active, is_private from public.groups where id = ${gid}::bigint limit 1
  `;
  if (!g) return json({ ok: false, error: 'group_not_found' }, 404);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const userIds: number[] = Array.isArray(body?.userIds) ? body.userIds.map((x: any) => Number(x)).filter(Number.isFinite) : [];
  const message: string | null = (body?.message ?? '').toString().trim() || null;

  if (userIds.length === 0) return json({ ok: false, error: 'empty_user_ids' }, 400);

  // Admin-User-Liste -> UUIDs ermitteln
  const rows = await sql<{ id: string; user_id: string }[]>`
    select id, user_id
    from public.app_users
    where id = any(${userIds}::bigint[])
  `;
  const uuids = rows.map(r => r.user_id).filter(Boolean);
  if (uuids.length === 0) return json({ ok: false, error: 'no_users_found' }, 400);

  // Einladungen upserten (erneut einladen = Eintrag reaktivieren & Nachricht aktualisieren)
  const inserted = await sql<{ invited_user_id: string }[]>`
    insert into public.group_invitations (group_id, invited_user_id, invited_by, message)
    select ${gid}::bigint, u.user_id::uuid, ${me.sub}::uuid, ${message}
    from public.app_users u
    where u.id = any(${userIds}::bigint[])
    on conflict (group_id, invited_user_id) do update
      set message = excluded.message,
          revoked_at = null,
          declined_at = null,
          accepted_at = null,
          created_at = now()
    returning invited_user_id
  `;

  return json({
    ok: true,
    group_id: gid,
    invited_count: inserted.length,
  });
}
