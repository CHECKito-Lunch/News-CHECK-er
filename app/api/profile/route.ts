export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { json, requireUser } from '@/lib/auth-server';

export async function PUT(req: NextRequest) {
  const me = await requireUser(req);
  if (!me) return json({ ok: false, error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const name = (b?.name ?? '').toString().trim();
  await sql`update public.users set name = ${name || null} where id::text = ${me.sub}`;
  return json({ ok: true });
}
