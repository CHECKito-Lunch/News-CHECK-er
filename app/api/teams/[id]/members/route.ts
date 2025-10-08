export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const getPathId = (url: string) => Number(new URL(url).pathname.split('/').filter(Boolean).slice(-2, -1)[0]);

export async function POST(req: NextRequest) {
  const me = await getUserFromCookies(req).catch(() => null);
  if (!me || me.role !== 'admin') return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

  const teamId = getPathId(req.url);
  if (!Number.isFinite(teamId)) return NextResponse.json({ ok:false, error:'bad_team_id' }, { status:400 });

  let body:any={};
  try { body = await req.json(); } catch {}
  const user_id = body?.user_id;
  const is_teamleiter = !!body?.is_teamleiter;

  if (!isUUID(user_id)) return NextResponse.json({ ok:false, error:'user_id_must_be_uuid' }, { status:400 });

  // Deaktivere evtl. alte aktive Membership dieses Users (genau-ein-Team-Policy)
  await sql/*sql*/`
    update public.team_memberships
       set active = false
     where user_id = ${user_id}::uuid
       and active = true
  `;

  // Einfügen (oder reaktivieren, falls schon vorhanden)
  const upsert = await sql/*sql*/`
    insert into public.team_memberships (team_id, user_id, is_teamleiter, active)
    values (${teamId}, ${user_id}::uuid, ${is_teamleiter}, true)
    on conflict (team_id, user_id)
      do update set is_teamleiter = excluded.is_teamleiter, active = true, assigned_at = now()
    returning team_id, user_id, is_teamleiter, active, assigned_at
  `;

  return NextResponse.json({ ok:true, item: upsert[0] });
}
