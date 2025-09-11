export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { json, requireUser } from '@/lib/auth-server';

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const me = await requireUser(req);
  if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

  const invId = Number(ctx.params.id || 0);
  if (!invId) return json({ ok: false, error: 'bad_id' }, 400);

  // Einladung löschen und group_id holen
  const del = await sql<{ group_id: number }[]>`
    delete from public.group_invitations
    where id = ${invId} and invited_user_id::text = ${me.sub}
    returning group_id
  `;
  if (del.length === 0) return json({ ok: false, error: 'not_found' }, 404);

  const groupId = del[0].group_id;

  // Mitglied hinzufügen (idempotent)
  await sql`
    insert into public.group_members (group_id, user_id)
    values (${groupId}, ${me.sub}::uuid)
    on conflict (group_id, user_id) do nothing
  `;

  return json({ ok: true, groupId });
}
