export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { json, requireUser } from '@/lib/auth-server';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const me = await requireUser(req);
  if (!me) return json({ ok: false, error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const current = (b?.currentPassword ?? '').toString();
  const next = (b?.newPassword ?? '').toString();
  if (next.length < 8) return json({ ok: false, error: 'weak_password' }, 400);

  const rows = await sql<{ password_hash: string | null }[]>`
    select password_hash from public.users where id::text = ${me.sub} limit 1
  `;
  const hash = rows[0]?.password_hash || '';
  const ok = hash ? await bcrypt.compare(current, hash) : false;
  if (!ok) return json({ ok: false, error: 'invalid_password' }, 400);

  const newHash = await bcrypt.hash(next, 10);
  await sql`update public.users set password_hash = ${newHash} where id::text = ${me.sub}`;
  return json({ ok: true });
}
