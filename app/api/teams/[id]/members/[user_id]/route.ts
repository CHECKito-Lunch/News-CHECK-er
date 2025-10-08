export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const parts = (url:string) => new URL(url).pathname.split('/').filter(Boolean);
const getTeamId = (url:string) => Number(parts(url).slice(-3, -2)[0]);
const getUserId = (url:string) => parts(url).slice(-1)[0];

export async function PATCH(req: NextRequest) {
  const me = await getUserFromCookies(req).catch(() => null);
  if (!me || me.role !== 'admin') return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

  const teamId = getTeamId(req.url);
  const userId = getUserId(req.url);
  if (!Number.isFinite(teamId) || !isUUID(userId)) return NextResponse.json({ ok:false, error:'bad_params' }, { status:400 });

  let body:any={};
  try { body = await req.json(); } catch {}
  const active = typeof body.active === 'boolean' ? body.active : undefined;
  const is_teamleiter = typeof body.is_teamleiter === 'boolean' ? body.is_teamleiter : undefined;

  const res = await sql/*sql*/`
    update public.team_memberships set
      is_teamleiter = coalesce(${is_teamleiter}::boolean, is_teamleiter),
      active       = coalesce(${active}::boolean, active)
    where team_id = ${teamId}
      and user_id = ${userId}::uuid
    returning team_id, user_id, is_teamleiter, active, assigned_at
  `;

  if (res.length === 0) return NextResponse.json({ ok:false, error:'not_found' }, { status:404 });
  return NextResponse.json({ ok:true, item: res[0] });
}
