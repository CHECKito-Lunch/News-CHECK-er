/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/teamhub/members/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

export async function GET(req: NextRequest) {
  const me = await getUserFromCookies().catch(() => null);
  if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

  const { searchParams } = new URL(req.url);
  const includeSelf = (searchParams.get('include_self') ?? '').toLowerCase() === 'true';

  // Teamleiter/Admin → aus View lesen
  if (me.role === 'teamleiter' || me.role === 'admin') {
    const rows = await sql/*sql*/`
      select distinct on (user_id)
        user_id::text as user_id,
        name,
        team_id,
        team_name,
        member_is_teamleiter
      from public.teamhub_members_view
      where leader_user_id = ${me.user_id}::uuid
      ${includeSelf ? sql`` : sql`and user_id <> ${me.user_id}::uuid`}
      order by user_id, team_name
    `;

    // API-Form wie bei dir: { user_id, name }
    const members = rows
      .map((r: any) => ({ user_id: String(r.user_id), name: r.name ?? '—' }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name, 'de'));

    return json({ ok: true, members });
  }

  // Nicht-Teamleiter → Fallback: nur sich selbst zurückgeben
  const self = await sql/*sql*/`
    select
      coalesce(nullif(trim(u.name),''), split_part(u.email,'@',1),'—') as name
    from public.app_users u
    where u.user_id = ${me.user_id}::uuid
    limit 1
  `;
  const name = self?.[0]?.name ?? '—';
  return json({ ok: true, members: [{ user_id: String(me.user_id), name }] });
}
