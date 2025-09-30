export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';
const json = (d:any, s=200) => NextResponse.json(d, { status:s });

export async function GET() {
  const [row] = await sql<any[]>`select value from public.app_settings where key='checkiade'`;
  return json({ ok:true, value: row?.value ?? {} });
}

export async function POST(req: NextRequest) {
  const me = await requireUser(req);
  if (!me || (me.role !== 'admin' && me.role !== 'moderator')) return json({ ok:false, error:'forbidden' }, 403);

  const val = await req.json().catch(()=>null);
  if (!val) return json({ ok:false, error:'invalid json' }, 400);

  await sql`
    insert into public.app_settings (key, value, updated_at)
    values ('checkiade', ${val}::jsonb, now())
    on conflict (key) do update set value=excluded.value, updated_at=excluded.updated_at
  `;
  return json({ ok:true });
}
