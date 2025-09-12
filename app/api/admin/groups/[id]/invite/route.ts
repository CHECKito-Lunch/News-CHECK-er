// app/api/admin/groups/[id]/invite/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { json } from '@/lib/auth-server';
import { withModerator } from '@/lib/with-auth';

type RowUid = { user_id: string };

export const POST = withModerator(async (req: NextRequest, ctx, me) => {
  // params robust (Next 15 kann Promise liefern)
  const rawParams: any = (ctx as any)?.params;
  const params = rawParams && typeof rawParams?.then === 'function' ? await rawParams : rawParams ?? {};
  const groupId = Number(params?.id);
  if (!Number.isFinite(groupId) || groupId <= 0) return json({ error: 'Ungültige groupId' }, 400);

  const body = await req.json().catch(() => ({} as any));
  const message: string | null =
    typeof body?.message === 'string' && body.message.trim() ? body.message.trim() : null;

  const rawIds: any[] = Array.isArray(body?.userIds) ? body.userIds : [];
  if (rawIds.length === 0) return json({ error: 'userIds erforderlich' }, 400);

  // in UUIDs und numerische IDs aufteilen
  const asText = rawIds.map((x) => String(x ?? '').trim()).filter(Boolean);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const uuids = Array.from(new Set(asText.filter((x) => uuidRe.test(x))));
  const nums  = Array.from(new Set(asText.map((x) => Number(x)).filter(Number.isFinite)));

  if (uuids.length === 0 && nums.length === 0) {
    return json({ error: 'Keine gültigen Nutzer' }, 400);
  }

  // aktive Nutzer holen – einmal über user_id (UUID), einmal über id (int)
  let rows: RowUid[] = [];
  if (uuids.length) {
    rows = rows.concat(await sql<RowUid[]>`
      select user_id::text as user_id
      from public.app_users
      where active = true and user_id::text in ${sql(uuids)}
    `);
  }
  if (nums.length) {
    rows = rows.concat(await sql<RowUid[]>`
      select user_id::text as user_id
      from public.app_users
      where active = true and id in ${sql(nums)}
    `);
  }

  const validUids = Array.from(new Set(rows.map((r) => r.user_id)));
  if (validUids.length === 0) {
    return json({ error: 'Keine gültigen Nutzer' }, 400);
  }

  // bereits offene Einladungen ausfiltern
  const existing = await sql<{ user_id: string }[]>`
    select invited_user_id::text as user_id
    from public.group_invitations
    where group_id = ${groupId}
      and invited_user_id::text in ${sql(validUids)}
      and accepted_at is null and declined_at is null and revoked_at is null
  `;
  const existingSet = new Set(existing.map((r) => r.user_id));
  const toInvite = validUids.filter((u) => !existingSet.has(u));

  if (toInvite.length === 0) {
    return json({ ok: true, invited: 0, skipped: { alreadyPending: existing.length } });
  }

  // Inserts (kurze TX, keine sql.join-Nutzung nötig)
  await sql.begin(async (trx: any) => {
    for (const uid of toInvite) {
      await trx`
        insert into public.group_invitations (group_id, invited_user_id, invited_by, message)
        values (${groupId}, ${uid}::uuid, ${me.sub}::uuid, ${message})
      `;
    }
  });

  return json({
    ok: true,
    invited: toInvite.length,
    skipped: { alreadyPending: existing.length }
  });
});

export function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
