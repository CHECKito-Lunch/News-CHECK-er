export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { json, requireUser } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  const me = await requireUser(req);
  if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

  await sql`
    insert into public.user_states (user_id, last_seen_at, updated_at)
    values (${me.sub}::text, now(), now())
    on conflict (user_id)
    do update set last_seen_at = excluded.last_seen_at,
                 updated_at   = excluded.updated_at
  `;

  return json({ ok: true });
}
