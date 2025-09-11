export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { json, requireUser } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const me = await requireUser(req); // optional
  const ids = (req.nextUrl.searchParams.get('ids') || '')
    .split(',')
    .map(s => Number(s))
    .filter(n => Number.isFinite(n) && n > 0);

  if (ids.length === 0) return json({ ok: true, data: [] });

  const rows = await sql<any[]>`
    select id, name, description, is_private
    from public.groups
    where id = any(${ids})
  `;

  const data = rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    is_private: r.is_private,
    memberCount: null,
    isMember: false,
  }));
  return json({ ok: true, data });
}
