export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d, { status:s });

export async function GET() {
  const rows = await sql<any[]>`select id, name, created_at from public.checkiade_teams order by name`;
  return json({ ok:true, items: rows });
}

export async function POST(req: NextRequest) {
  const me = await requireUser(req);
  if (!me || (me.role !== 'admin' && me.role !== 'moderator')) return json({ ok:false, error:'forbidden' }, 403);

  const { name } = await req.json().catch(()=>({}));
  if (!name?.trim()) return json({ ok:false, error:'name required' }, 400);

  const [row] = await sql<any[]>`
    insert into public.checkiade_teams (name) values (${name.trim()})
    on conflict (name) do update set name = excluded.name
    returning id, name, created_at
  `;
  return json({ ok:true, item: row });
}
