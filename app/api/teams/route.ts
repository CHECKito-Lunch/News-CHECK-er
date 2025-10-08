export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const isAdminOrMod = (role?: string) => role === 'admin' || role === 'moderator' || role === 'teamleiter';

export async function GET(req: NextRequest) {
  const me = await getUserFromCookies(req).catch(() => null);
  if (!me || !isAdminOrMod(me.role)) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  // Liefert Teams inkl. Kennzeichnung wer Teamleiter ist
  const rows = await sql/*sql*/`
    select
      t.id, t.name, t.created_at,
      json_agg(json_build_object(
        'user_id', tm.user_id,
        'is_teamleiter', tm.is_teamleiter,
        'active', tm.active
      ) order by tm.is_teamleiter desc) as members
    from public.teams t
    left join public.team_memberships tm on tm.team_id = t.id
    group by t.id
    order by t.name asc
  `;

  return NextResponse.json({ ok:true, items: rows });
}

export async function POST(req: NextRequest) {
  const me = await getUserFromCookies(req).catch(() => null);
  if (!me || me.role !== 'admin') return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const name = String(body?.name ?? '').trim();
  if (!name) return NextResponse.json({ ok:false, error:'missing_name' }, { status:400 });

  const ins = await sql/*sql*/`
    insert into public.teams (name, created_by)
    values (${name}, ${me.user_id}::uuid)
    returning id, name, created_at
  `;
  return NextResponse.json({ ok:true, item: ins[0] });
}
