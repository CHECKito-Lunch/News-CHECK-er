import { withAuth } from '@/lib/with-auth';
import { sql } from '@/lib/db';
import { json } from '@/lib/auth-server';
import type { NextRequest } from 'next/server';

export const POST = withAuth(async (_req: NextRequest, ctx, me) => {
  const p: any = (ctx as any)?.params;
  const params = p && typeof p.then === 'function' ? await p : p;
  const id = Number(Array.isArray(params?.id) ? params.id[0] : params?.id);
  if (!Number.isFinite(id)) return json({ error: 'Bad id' }, 400);

  const res = await sql`
    update group_invitations
       set declined_at = now()
     where id = ${id}
       and invited_user_id::text = ${me.sub}
       and accepted_at is null
       and declined_at is null
       and revoked_at is null
  `;
  // res muss hier nicht ausgewertet werden – ist idempotent
  return json({ ok: true });
});

export function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
