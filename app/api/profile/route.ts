// app/api/profile/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { json } from '@/lib/auth-server';
import { withAuth } from '@/lib/with-auth';

export const GET = withAuth(async (_req, _ctx, me) => {
  const rows = await sql<{ sub: string; email: string|null; name: string|null; role: 'admin'|'moderator'|'user' }[]>`
    select user_id::text as sub, email, name, role::text as role
    from public.app_users
    where user_id::text = ${me.sub}
    limit 1
  `;
  const user = rows[0] ?? { sub: me.sub, email: null, name: null, role: me.role };
  return json({ ok: true, user });
});

export const PUT = withAuth(async (req: NextRequest, _ctx, me) => {
  const body = await req.json().catch(() => ({} as any));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  await sql`
    update public.app_users
    set name = ${name || null}, updated_at = now()
    where user_id::text = ${me.sub}
  `;

  const rows = await sql<{ sub: string; email: string|null; name: string|null; role: 'admin'|'moderator'|'user' }[]>`
    select user_id::text as sub, email, name, role::text as role
    from public.app_users
    where user_id::text = ${me.sub}
    limit 1
  `;
  return json({ ok: true, user: rows[0] });
});