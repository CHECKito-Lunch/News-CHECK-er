// app/api/teams/[id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

function getTeamId(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const id = Number(parts[parts.length - 1]);
    return Number.isFinite(id) ? id : null;
  } catch { return null; }
}

export async function PATCH(req: NextRequest) {
  const me = await getUserFromCookies(req);
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });
  }
  const id = getTeamId(req.url);
  if (!id) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  let b: any = {};
  try { b = await req.json(); } catch {}
  const name = (b?.name ?? '').trim();
  if (!name) return NextResponse.json({ ok:false, error:'name_required' }, { status:400 });

  await sql/*sql*/`update public.teams set name = ${name} where id = ${id}`;
  return NextResponse.json({ ok:true });
}

export async function DELETE(req: NextRequest) {
  const me = await getUserFromCookies(req);
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });
  }
  const id = getTeamId(req.url);
  if (!id) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  await sql/*sql*/`delete from public.teams where id = ${id}`;
  return NextResponse.json({ ok:true });
}
