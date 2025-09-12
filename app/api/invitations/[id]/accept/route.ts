import { withAuth } from '@/lib/with-auth';
import { sql } from '@/lib/db';
import { json } from '@/lib/auth-server';
import type { NextRequest } from 'next/server';

export const POST = withAuth(async (_req: NextRequest, ctx, me) => {
  // params kann in neuen Next-Versionen ein Promise sein → robust entpacken
  const p: any = (ctx as any)?.params;
  const params = p && typeof p.then === 'function' ? await p : p;
  const id = Number(Array.isArray(params?.id) ? params.id[0] : params?.id);
  if (!Number.isFinite(id)) return json({ error: 'Bad id' }, 400);

  const updated = await sql<{ group_id: number }[]>`
    update group_invitations
       set accepted_at = now()
     where id = ${id}
       and invited_user_id::text = ${me.sub}
       and accepted_at is null
       and declined_at is null
       and revoked_at is null
     returning group_id
  `;
  if (updated.length === 0) return json({ error: 'Not found' }, 404);

  // Mitgliedschaft anlegen (idempotent)
  await sql`
    insert into group_members (group_id, user_id)
    values (${updated[0].group_id}, ${me.sub}::uuid)
    on conflict (group_id, user_id) do nothing
  `;

  return json({ ok: true });
});

export function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
