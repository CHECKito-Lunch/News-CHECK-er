export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/user-auth';

const json = (d: any, status = 200) => NextResponse.json(d, { status });

export async function GET() {
  const me = await getUserFromCookies();
  if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

  const rows = await sql<{
    id: number;
    group_id: string;
    group_name: string;
    message: string | null;
    created_at: string;
    invited_by: string;
    invited_by_name: string | null;
    invited_by_email: string | null;
  }[]>`
    select
      gi.id,
      gi.group_id::text,
      g.name as group_name,
      gi.message,
      gi.created_at,
      gi.invited_by::text as invited_by,
      au.name  as invited_by_name,
      au.email as invited_by_email
    from public.group_invitations gi
    join public.groups g on g.id = gi.group_id
    left join public.app_users au on au.user_id = gi.invited_by
    where gi.invited_user_id = ${me.sub}::uuid
      and gi.accepted_at is null
      and gi.declined_at is null
      and gi.revoked_at is null
    order by gi.created_at desc
    limit 200
  `;

  return json({ ok: true, items: rows });
}
