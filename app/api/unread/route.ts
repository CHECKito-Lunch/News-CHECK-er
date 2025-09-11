// app/api/unread/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req).catch(() => null);
    if (!me) {
      return json({ ok: true, unread: 0, breakdown: { invites: 0 } });
    }

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count
        from public.group_invitations gi
       where gi.invited_user_id = ${me.sub}::uuid
         and gi.accepted_at is null
         and gi.declined_at is null
         and gi.revoked_at is null
    `;

    return json({ ok: true, unread: Number(count ?? 0), breakdown: { invites: Number(count ?? 0) } });
  } catch (e) {
    console.error('[unread GET]', e);
    return json({ ok: true, unread: 0, breakdown: { invites: 0 } });
  }
}
