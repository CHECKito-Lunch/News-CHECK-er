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

  const del = await sql`delete from public.group_invitations
                         where id = ${invId} and invited_user_id::text = ${me.sub}
                         returning 1`;
  if (del.length === 0) return json({ ok: false, error: 'not_found' }, 404);
  return json({ ok: true });
}
